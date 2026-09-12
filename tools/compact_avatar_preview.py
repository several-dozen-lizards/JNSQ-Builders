"""Preview GLB packing: omit sub-micrometre numerical noise, share binary blocks.
Full candidate models are never modified.
"""
import hashlib,json,struct,sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from tools.mix_avatar_clothes import load
from tools.optimize_avatar_textures import accessor_array

def compact(source,dest):
    m,b=load(source)
    if any(channel.get('target',{}).get('path')=='weights' for anim in m.get('animations',[]) for channel in anim.get('channels',[])):
        raise ValueError('Animated morph tracks require target remapping; use the original model')
    retained={}
    for mi,mesh in enumerate(m.get('meshes',[])):
        names=mesh.get('extras',{}).get('targetNames',[])
        if not names:continue
        # Ignore only whole targets beneath float32-scale numerical noise.
        # Retained targets remain bit-for-bit unchanged.
        keep=[i for i in range(len(names)) if any(np.any(np.abs(accessor_array(m,b,a)) > (1e-7 if semantic=='POSITION' else 1e-6)) for p in mesh['primitives'] for semantic,a in p['targets'][i].items())]
        retained[mi]=keep
        mesh['extras']['targetNames']=[names[i] for i in keep]
        if 'weights' in mesh:mesh['weights']=[mesh['weights'][i] for i in keep]
        for p in mesh['primitives']:p['targets']=[p['targets'][i] for i in keep]
    for node in m.get('nodes',[]):
        if 'weights' in node and node.get('mesh') in retained:node['weights']=[node['weights'][i] for i in retained[node['mesh']]]
    def block(data):
        b.extend(b'\0'*(-len(b)%4));off=len(b);b.extend(data)
        m['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(data)})
        return len(m['bufferViews'])-1
    targets={a for mesh in m.get('meshes',[]) for p in mesh['primitives'] for t in p.get('targets',[]) for a in t.values()}
    for i in targets:
        a=m['accessors'][i]
        if a['componentType']!=5126 or a['type']!='VEC3':continue
        d=accessor_array(m,b,i);idx=np.flatnonzero(np.any(d!=0,axis=1))
        if len(idx)*16>=d.nbytes:continue
        for k in ['bufferView','byteOffset','sparse']:a.pop(k,None)
        if len(idx):
            a['sparse']={'count':len(idx),'indices':{'bufferView':block(idx.astype('<u4').tobytes()),'componentType':5125},'values':{'bufferView':block(d[idx].astype('<f4').tobytes())}}
    # Keep accessor indices stable but release accessors of omitted zero targets.
    # Accessors no longer used by any mesh/skin/animation need no backing bytes.
    used_accessors=set()
    for mesh in m.get('meshes',[]):
        for p in mesh['primitives']:
            used_accessors.update(p['attributes'].values())
            if 'indices' in p:used_accessors.add(p['indices'])
            for t in p.get('targets',[]):used_accessors.update(t.values())
    for skin in m.get('skins',[]):
        if 'inverseBindMatrices' in skin:used_accessors.add(skin['inverseBindMatrices'])
    for animation in m.get('animations',[]):
        for sampler in animation['samplers']:used_accessors.update([sampler['input'],sampler['output']])
    for i,a in enumerate(m.get('accessors',[])):
        if i not in used_accessors:
            for k in ['bufferView','byteOffset','sparse']:a.pop(k,None)
    # Keep accessor indices stable; drop binary views with no remaining references.
    refs=[]
    for a in m.get('accessors',[]):
        if 'bufferView' in a:refs.append(a)
        if 'sparse' in a:refs.extend([a['sparse']['indices'],a['sparse']['values']])
    refs.extend(im for im in m.get('images',[]) if 'bufferView' in im)
    used=sorted({r['bufferView'] for r in refs});out=bytearray();views=[];remap={};shared={}
    for i in used:
        v=m['bufferViews'][i];data=b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
        shape={k:v for k,v in v.items() if k not in ['buffer','byteOffset']}
        key=(hashlib.sha256(data).digest(),json.dumps(shape,sort_keys=True))
        if key not in shared:
            out.extend(b'\0'*(-len(out)%4));shared[key]=len(views);views.append({**shape,'buffer':0,'byteOffset':len(out)});out.extend(data)
        remap[i]=shared[key]
    for r in refs:r['bufferView']=remap[r['bufferView']]
    out.extend(b'\0'*(-len(out)%4));m['bufferViews']=views;m['buffers']=[{'byteLength':len(out)}]
    j=json.dumps(m,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(struct.pack('<IIIII',0x46546c67,2,28+len(j)+len(out),len(j),0x4e4f534a)+j+struct.pack('<II',len(out),0x004e4942)+out)
    return source.stat().st_size,dest.stat().st_size

if __name__=='__main__':
    entries=json.loads((ROOT/'room/avatar_starters.json').read_text())['starters']
    if len(sys.argv)>1:entries=entries[:int(sys.argv[1])]
    for e in entries:
        source=ROOT/'scratch/body_candidates'/e['candidate_id']/'body.glb';dest=source.with_name('preview-compact-v1.glb')
        print(e['name'],compact(source,dest),flush=True)
