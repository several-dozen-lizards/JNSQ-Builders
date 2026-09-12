"""Separate connected garment components and assemble compatible casual separates.

Only casual cuts 2-6 share the same trouser pattern and coverage. Keep other
garments out of the mixer until their seams and body coverage are verified.
"""
import copy,json,struct,sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from tools.optimize_avatar_textures import accessor_array
from core.body_candidates import CandidateStager,save_candidate_mapping

def load(path):
    raw=Path(path).read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+n]),bytearray(raw[28+n:])

def triangles(m,b,p):
    a=m['accessors'][p['indices']];v=m['bufferViews'][a['bufferView']]
    return np.frombuffer(b,dtype={5121:'u1',5123:'<u2',5125:'<u4'}[a['componentType']],count=a['count'],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3).copy()

def parts(m,b,p):
    v=accessor_array(m,b,p['attributes']['POSITION']);t=triangles(m,b,p);parent=np.arange(len(v))
    def find(x):
        while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
        return x
    weld={}
    for j,pos in enumerate(v):parent[j]=weld.setdefault(tuple(np.round(pos,5)),j)
    for tri in t:
        for j in tri[1:]:parent[find(j)]=find(tri[0])
    components={}
    for j,tri in enumerate(t):components.setdefault(find(tri[0]),[]).append(j)
    # Trouser components reach the ankles; shirt components do not. Never slice
    # a component across its waist, which would tear geometry during movement.
    lower=[];upper=[]
    for ids in components.values():
        points=v[t[ids].ravel()]
        (lower if points[:,1].min()<.2 else upper).extend(ids)
    assert lower and upper,'This outfit is not safely separable'
    assert v[t[lower].ravel(),1].max()<1.05,'Lower garment unexpectedly reaches torso'
    return t[upper],t[lower]

def index(m,b,t):
    data=np.asarray(t,dtype='<u4').tobytes();b.extend(b'\0'*(-len(b)%4))
    bv=len(m['bufferViews']);m['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':len(data),'target':34963});b.extend(data)
    ai=len(m['accessors']);m['accessors'].append({'bufferView':bv,'componentType':5125,'count':t.size,'type':'SCALAR'});return ai

def clothing(m):return next(n for n in m['nodes'] if n.get('extras',{}).get('jnsq_fit_category')=='clothes')

def material(m,p,slot):
    mat=copy.deepcopy(m['materials'][p['material']]);mat['name']='JNSQ.'+slot.title();mat.setdefault('extras',{})['jnsq_clothing_slot']=slot
    p['material']=len(m['materials']);m['materials'].append(mat)

def combine(top_path,bottom_path,dest):
    m,b=load(top_path);source,sb=load(bottom_path)
    node=clothing(m);mesh=m['meshes'][node['mesh']];p=mesh['primitives'][0]
    upper,_=parts(m,b,p);p['indices']=index(m,b,upper);material(m,p,'top')
    sn=clothing(source);sp=source['meshes'][sn['mesh']]['primitives'][0];_,lower=parts(source,sb,sp)
    # The two assemblies share the same human rig. Refuse mismatched skeletons.
    a=[m['nodes'][j]['name'] for j in m['skins'][node['skin']]['joints']]
    z=[source['nodes'][j]['name'] for j in source['skins'][sn['skin']]['joints']];assert a==z
    copied={}
    def move(kind,i):
        key=(kind,i)
        if key in copied:return copied[key]
        value=copy.deepcopy(source[kind][i])
        if kind=='bufferViews':
            off=value.get('byteOffset',0);data=sb[off:off+value['byteLength']];b.extend(b'\0'*(-len(b)%4));value['buffer']=0;value['byteOffset']=len(b);b.extend(data)
        elif kind=='accessors':
            if 'bufferView' in value:value['bufferView']=move('bufferViews',value['bufferView'])
            for component in value.get('sparse',{}).values():
                if isinstance(component,dict) and 'bufferView' in component:component['bufferView']=move('bufferViews',component['bufferView'])
        elif kind=='images':value['bufferView']=move('bufferViews',value['bufferView'])
        elif kind=='textures':
            value['source']=move('images',value['source'])
            if 'sampler' in value:value['sampler']=move('samplers',value['sampler'])
        elif kind=='materials':
            def visit(obj):
                for key,val in obj.items():
                    if isinstance(val,dict):
                        if key.endswith('Texture') and 'index' in val:val['index']=move('textures',val['index'])
                        else:visit(val)
            visit(value)
        result=len(m.setdefault(kind,[]));m[kind].append(value);copied[(kind,i)]=result;return result
    q=copy.deepcopy(sp);q['indices']=index(m,b,lower)
    q['attributes']={key:move('accessors',value) for key,value in q['attributes'].items()}
    # Match morphs by name, not compilation order. Newly added face shapes
    # have zero displacement on garments from an older compilation.
    source_names=source['meshes'][sn['mesh']]['extras']['targetNames']
    target_names=mesh['extras']['targetNames']
    targets=[]
    for name in target_names:
        if name in source_names:
            targets.append({key:move('accessors',value) for key,value in sp['targets'][source_names.index(name)].items()})
        else:
            count=m['accessors'][q['attributes']['POSITION']]['count']
            zero=len(m['accessors']);m['accessors'].append({'componentType':5126,'count':count,'type':'VEC3','min':[0,0,0],'max':[0,0,0]})
            targets.append({'POSITION':zero})
    q['targets']=targets
    q['material']=move('materials',q['material']);material(m,q,'bottom');mesh['primitives']=[p,q]
    m['buffers'][0]['byteLength']=len(b);data=json.dumps(m,separators=(',',':')).encode();data+=b' '*(-len(data)%4)
    Path(dest).write_bytes(struct.pack('<IIIII',0x46546c67,2,28+len(data)+len(b),len(data),0x4e4f534a)+data+struct.pack('<II',len(b),0x004e4942)+b)

def main():
    folder=ROOT/'scratch/avatar-separates';folder.mkdir(exist_ok=True)
    catalog_path=ROOT/'room/avatar_starters.json';catalog=json.loads(catalog_path.read_text())
    candidates=ROOT/'scratch/body_candidates';adapter=json.loads((candidates/'a5bbba7fd0df4fefaa8c9ecba8d0faea/adapter.json').read_text())
    existing={entry['name'] for entry in catalog['starters']}
    for top in range(2,7):
        for bottom in range(2,7):
            name=f'Separates — top {top}, trousers {bottom}'
            if name in existing:continue
            output=folder/f'top{top}-bottom{bottom}.glb'
            combine(ROOT/f'scratch/avatar-wardrobe-expanded/male_casualsuit{top:02}.glb',ROOT/f'scratch/avatar-wardrobe-expanded/male_casualsuit{bottom:02}.glb',output)
            stage=CandidateStager(candidates,name+'.glb','testy_mcprototype')
            with output.open('rb') as f:
                while block:=f.read(1024*1024):stage.write(block)
            stage.finalize();save_candidate_mapping(candidates,stage.candidate_id,'testy_mcprototype',{k:adapter[k] for k in ['roles','expressions','optical_origin']})
            catalog['starters'].append({'name':name,'candidate_id':stage.candidate_id,'group':'Mix and match','top':str(top),'bottom':str(bottom),'pieces':['top','bottom']})
            catalog_path.write_text(json.dumps(catalog,indent=2));print(name,stage.candidate_id,flush=True)

if __name__=='__main__':main()
