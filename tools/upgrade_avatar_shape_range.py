"""Transfer freshly fitted face targets to matching neutral wardrobe geometry.

Only exact neutral vertex matches receive deltas; unsupported meshes fail.
Clothing receives zeros: face shape controls must not refit the torso.
Old candidates and saved recipes remain intact. Catalog publication is atomic.
"""
import json,struct,sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from tools.mix_avatar_clothes import load
from tools.optimize_avatar_textures import accessor_array
from core.body_candidates import CandidateStager,save_candidate_mapping
NEW_NAMES=['JNSQ_EyeAngle_Down', 'JNSQ_EyeAngle_Up', 'JNSQ_InnerEyeFold_In', 'JNSQ_InnerEyeFold_Out', 'JNSQ_InnerLidOpening_Low', 'JNSQ_InnerLidOpening_High', 'JNSQ_OuterLidOpening_Low', 'JNSQ_OuterLidOpening_High']
REPAIR_NAMES=[]
NAMES=NEW_NAMES

def key(node):
    e=node.get('extras',{})
    return (e.get('jnsq_fit_category','body'),e.get('jnsq_fit_asset_name',node.get('name')))

def uv_array(model,binary,primitive):
    accessor=model['accessors'][primitive['attributes']['TEXCOORD_0']]
    view=model['bufferViews'][accessor['bufferView']]
    return np.ndarray((accessor['count'],2),dtype='<f4',buffer=binary,
        offset=view.get('byteOffset',0)+accessor.get('byteOffset',0),
        strides=(view.get('byteStride',8),4))

def donor_tables(path,attribute='POSITION'):
    m,b=load(path);tables={}
    for node in m['nodes']:
        if 'mesh' not in node:continue
        mesh=m['meshes'][node['mesh']];names=mesh.get('extras',{}).get('targetNames',[])
        if not all(n in names for n in NAMES):continue
        table={}
        for p in mesh['primitives']:
            pos=accessor_array(m,b,p['attributes']['POSITION'])
            ds=np.stack([accessor_array(m,b,p['targets'][names.index(n)][attribute]) for n in NAMES],axis=1)
            if key(node)[0]=='clothes':ds[:]=0
            if attribute=='NORMAL' and key(node)[0]!='body':
                # Repair facial lighting only; keep existing accessory shading.
                ds[:,len(NEW_NAMES):,:]=0
            base_normals=accessor_array(m,b,p['attributes']['NORMAL']) if attribute=='NORMAL' else None
            uv=uv_array(m,b,p) if attribute=='NORMAL' else None
            for vi,(v,d) in enumerate(zip(pos,ds)):
                k=tuple(np.round(v,5))
                if base_normals is not None:k+=tuple(np.round(base_normals[vi],4))+tuple(np.round(uv[vi],6))
                if k in table:assert np.allclose(table[k],d,atol=1e-6)
                table[k]=d
        tables[key(node)]=table
    return tables

def upgrade(path,dest,tables,normals=None):
    m,b=load(path);done=set()
    def store(d):
        d=d.astype('<f4');b.extend(b'\0'*(-len(b)%4));offset=len(b);b.extend(d.tobytes())
        vi=len(m['bufferViews']);m['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':d.nbytes})
        ai=len(m['accessors']);m['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(d),'type':'VEC3','min':d.min(axis=0).tolist(),'max':d.max(axis=0).tolist()});return ai
    for node in m['nodes']:
        if 'mesh' not in node or node['mesh'] in done:continue
        done.add(node['mesh']);mesh=m['meshes'][node['mesh']];names=mesh.get('extras',{}).get('targetNames',[])
        if not names:continue
        assert not any(n in names for n in NEW_NAMES)
        assert all(n in names for n in REPAIR_NAMES)
        category=key(node)[0];table=tables.get(key(node))
        assert category in ['clothes','hair','beard'] or table is not None,key(node)
        face_floor=min((v[1] for v,d in table.items() if abs(d).max()>1e-6),default=float('inf')) if table else 0
        for p in mesh['primitives']:
            pos=accessor_array(m,b,p['attributes']['POSITION'])
            ds=np.zeros((len(pos),len(NAMES),3),dtype='<f4')
            if category!='clothes' and table is not None:
                for i,v in enumerate(pos):
                    k=tuple(np.round(v,5))
                    if k in table:ds[i]=table[k]
                    else:
                        # Outfit coverage removes different BODY triangles;
                        # unmatched vertices below the neck cannot carry these targets.
                        assert category=='body' and v[1]<face_floor-1e-4,(key(node),v.tolist())
            target_indices={}
            for j,name in enumerate(NAMES):
                if name in REPAIR_NAMES:
                    index=names.index(name)
                    assert np.allclose(accessor_array(m,b,p['targets'][index]['POSITION']),ds[:,j,:],atol=1e-7),(name,key(node))
                else:
                    index=len(p['targets']);p['targets'].append({'POSITION':store(ds[:,j,:])})
                target_indices[name]=index
            if normals is not None:
                normal_table=normals.get(key(node),{})
                normal_deltas=np.zeros_like(ds)
                base_normals=accessor_array(m,b,p['attributes']['NORMAL']);uv=uv_array(m,b,p)
                for i,v in enumerate(pos):
                    value=normal_table.get(tuple(np.round(v,5))+tuple(np.round(base_normals[i],4))+tuple(np.round(uv[i],6)))
                    if value is not None:normal_deltas[i]=value
                for j,name in enumerate(NAMES):
                    if name in REPAIR_NAMES and category!='body':continue
                    normal_delta=normal_deltas[:,j,:]
                    assert normal_delta.shape==(len(pos),3)
                    p['targets'][target_indices[name]]['NORMAL']=store(normal_delta)
        names.extend(NEW_NAMES)
        if 'weights' in mesh:mesh['weights'].extend([0]*len(NEW_NAMES))
    for node in m['nodes']:
        if 'mesh' in node and 'weights' in node:
            n=len(m['meshes'][node['mesh']].get('extras',{}).get('targetNames',[]));node['weights'].extend([0]*(n-len(node['weights'])))
    m['buffers'][0]['byteLength']=len(b);j=json.dumps(m,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
    dest.write_bytes(struct.pack('<IIIII',0x46546c67,2,28+len(j)+len(b),len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b)

def main():
    folder=ROOT/'scratch/avatar-shape-range';tables=donor_tables(folder/'donor.glb');normals=donor_tables(folder/'donor.glb','NORMAL')
    catalog_path=ROOT/'room/avatar_starters.json';catalog=json.loads((folder/'catalog-before.json').read_text()) if (folder/'catalog-before.json').exists() else json.loads(catalog_path.read_text())
    backup=folder/'catalog-before.json'
    if not backup.exists():backup.write_text(json.dumps(catalog,indent=2))
    root=ROOT/'scratch/body_candidates';receipt=folder/'upgrades-with-normals.json';ids=json.loads(receipt.read_text()) if receipt.exists() else {}
    for entry in catalog['starters']:
        old=entry['candidate_id']
        if old in ids.values():continue
        if old not in ids:
            dest=folder/'upgraded.glb';upgrade(root/old/'body.glb',dest,tables,normals)
            checked,raw=load(dest)
            for mesh in checked['meshes']:
                names=mesh.get('extras',{}).get('targetNames',[])
                if not all(n in names for n in NAMES):continue
                for primitive in mesh['primitives']:
                    count=checked['accessors'][primitive['attributes']['POSITION']]['count']
                    for name in NAMES:
                        for attribute in ['POSITION','NORMAL']:
                            target=primitive['targets'][names.index(name)]
                            if attribute=='NORMAL' and name in REPAIR_NAMES and attribute not in target:continue
                            index=target[attribute]
                            accessor=checked['accessors'][index]
                            values=accessor_array(checked,raw,index)
                            assert accessor['type']=='VEC3' and values.shape==(count,3) and np.isfinite(values).all()
            adapter=json.loads((root/old/'adapter.json').read_text())
            stage=CandidateStager(root,entry['name']+' eye silhouette.glb','testy_mcprototype')
            with dest.open('rb') as f:
                while block:=f.read(1024*1024):stage.write(block)
            stage.finalize();save_candidate_mapping(root,stage.candidate_id,'testy_mcprototype',{k:adapter[k] for k in ['roles','expressions','optical_origin']})
            ids[old]=stage.candidate_id;receipt.write_text(json.dumps(ids,indent=2))
        from tools.compact_avatar_preview import compact
        target=root/ids[old]
        if not (target/'preview-compact-v2.glb').exists():compact(target/'body.glb',target/'preview-compact-v2.glb')
        entry['candidate_id']=ids[old];print(entry['name'],entry['candidate_id'],flush=True)
    temp=catalog_path.with_suffix('.partial');temp.write_text(json.dumps(catalog,indent=2));temp.replace(catalog_path)

if __name__=='__main__':main()
