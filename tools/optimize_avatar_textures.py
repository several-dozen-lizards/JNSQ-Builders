"""Bound texture resolution in a compiled GLB; geometry and rig bytes are unchanged."""
import io
import json
import struct
import sys
from pathlib import Path
from PIL import Image
import numpy as np

def accessor_array(model,binary,index):
    accessor=model['accessors'][index]
    assert accessor['componentType']==5126 and accessor['type']=='VEC3'
    result=np.zeros((accessor['count'],3),dtype='<f4')
    if 'bufferView' in accessor:
        view=model['bufferViews'][accessor['bufferView']]
        offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)
        result[:]=np.ndarray(result.shape,dtype='<f4',buffer=binary,offset=offset,strides=(view.get('byteStride',12),4))
    if 'sparse' in accessor:
        sparse=accessor['sparse'];indices=sparse['indices'];values=sparse['values']
        index_view=model['bufferViews'][indices['bufferView']];value_view=model['bufferViews'][values['bufferView']]
        dtype={5121:'u1',5123:'<u2',5125:'<u4'}[indices['componentType']]
        positions=np.frombuffer(binary,dtype=dtype,count=sparse['count'],offset=index_view.get('byteOffset',0)+indices.get('byteOffset',0))
        data=np.frombuffer(binary,dtype='<f4',count=sparse['count']*3,offset=value_view.get('byteOffset',0)+values.get('byteOffset',0)).reshape(-1,3)
        result[positions]=data
    return result

def coordinate_tongue(model,binary):
    anatomy={node.get('extras',{}).get('jnsq_fit_category'):model['meshes'][node['mesh']] for node in model.get('nodes',[]) if 'mesh' in node}
    if not all(key in anatomy for key in ['teeth','tongue']): return
    teeth=anatomy['teeth'];tongue=anatomy['tongue']
    name='JNSQ_Expr_MouthOpen'
    if any(name not in mesh.get('extras',{}).get('targetNames',[]) for mesh in [teeth,tongue]): return
    primitive=teeth['primitives'][0];index=teeth['extras']['targetNames'].index(name)
    neutral=accessor_array(model,binary,primitive['attributes']['POSITION'])
    delta=accessor_array(model,binary,primitive['targets'][index]['POSITION'])
    # Recover lower-jaw motion from the fitted lower teeth, excluding the
    # upper teeth. glTF is Y-up. Apply its measured rigid movement to tongue.
    selected=delta[:,1]<delta[:,1].min()*0.5
    if selected.sum()<3:return
    before=neutral[selected].astype(float);after=before+delta[selected]
    origin=before.mean(axis=0);destination=after.mean(axis=0)
    u,_,vh=np.linalg.svd((before-origin).T@(after-destination))
    rotation=vh.T@u.T
    if np.linalg.det(rotation)<0:vh[-1]*=-1;rotation=vh.T@u.T
    target_index=tongue['extras']['targetNames'].index(name)
    for primitive in tongue['primitives']:
        points=accessor_array(model,binary,primitive['attributes']['POSITION'])
        changed=((points-origin)@rotation.T+destination-points).astype('<f4')
        binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(changed.tobytes())
        view=len(model['bufferViews']);model['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':changed.nbytes})
        index=len(model['accessors']);model['accessors'].append({'bufferView':view,'componentType':5126,'count':len(changed),'type':'VEC3','min':changed.min(axis=0).tolist(),'max':changed.max(axis=0).tolist()})
        primitive['targets'][target_index]['POSITION']=index

def optimize(path):
    raw=Path(path).read_bytes()
    size=struct.unpack_from('<I',raw,12)[0]
    model=json.loads(raw[20:20+size])
    binary=bytearray(raw[28+size:])
    coordinate_tongue(model,binary)
    from tools.refine_avatar_cornea import split_cornea
    binary=split_cornea(model,binary)
    eye_meshes={node.get('mesh') for node in model.get('nodes',[]) if node.get('extras',{}).get('jnsq_fit_category')=='eyes'}
    for i in eye_meshes:
        if i is None: continue
        mesh=model['meshes'][i]
        for index,name in enumerate(mesh.get('extras',{}).get('targetNames',[])):
            if not name.startswith('JNSQ_Expr_'): continue
            for primitive in mesh.get('primitives',[]):
                for accessor_id in primitive.get('targets',[])[index].values():
                    accessor=model['accessors'][accessor_id]
                    assert accessor['componentType']==5126 and accessor['type']=='VEC3'
                    # glTF accessors without a bufferView are implicit zeros.
                    # This also handles the compiler's already-zero targets.
                    accessor.pop('bufferView',None)
                    accessor.pop('byteOffset',None)
                    accessor.pop('sparse',None)
                    if 'min' in accessor: accessor['min']=[0,0,0]
                    if 'max' in accessor: accessor['max']=[0,0,0]
    images={image['bufferView']:image for image in model.get('images',[]) if 'bufferView' in image}
    # Normal/roughness maps carry data, not color: JPEG blocks become shading artifacts.
    data_views=set()
    portrait_views=set()
    for material in model.get('materials',[]):
        if material.get('name')=='Human.body':
            texture=material.get('pbrMetallicRoughness',{}).get('baseColorTexture')
            if texture:
                source=model['textures'][texture['index']]['source']
                portrait_views.add(model['images'][source].get('bufferView'))
        for texture in [material.get('normalTexture'),material.get('occlusionTexture'),material.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')]:
            if texture:
                source=model['textures'][texture['index']]['source']
                data_views.add(model['images'][source].get('bufferView'))
    blocks=[];offset=0
    for i,view in enumerate(model.get('bufferViews',[])):
        data=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        if i in images:
            image=Image.open(io.BytesIO(data))
            limit=2048 if i in portrait_views else 1024
            image.thumbnail((limit,limit),Image.Resampling.LANCZOS)
            output=io.BytesIO()
            if i in data_views or (image.mode=='RGBA' and image.getextrema()[3][0]<255):
                image.save(output,format='PNG',optimize=True);mime='image/png'
            else:
                image.convert('RGB').save(output,format='JPEG',quality=90);mime='image/jpeg'
            data=output.getvalue();images[i]['mimeType']=mime
        view['byteOffset']=offset;view['byteLength']=len(data)
        data+=b'\0'*(-len(data)%4);blocks.append(data);offset+=len(data)
    model['buffers'][0]['byteLength']=offset
    encoded=json.dumps(model,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
    result=struct.pack('<III',0x46546c67,2,28+len(encoded)+offset)+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',offset,0x004e4942)+b''.join(blocks)
    Path(path).write_bytes(result)
    print(Path(path).name,len(raw),'->',len(result))

if __name__=='__main__':
    for path in sys.argv[1:]: optimize(path)
