/* Rest-pose body height in glTF metres. Hair, clothing and preview zoom are excluded. */
function createAvatarHeightProfile(buffer, controls){
  const view=new DataView(buffer),doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,view.getUint32(12,true))));
  const bin=20+view.getUint32(12,true)+8;
  const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const mul=(a,b)=>Array.from({length:16},(_,i)=>[0,1,2,3].reduce((s,k)=>s+a[k*4+i%4]*b[Math.floor(i/4)*4+k],0));
  function local(n){
    if(n.matrix)return n.matrix;
    const [x,y,z,w]=n.rotation||[0,0,0,1],s=n.scale||[1,1,1],t=n.translation||[0,0,0];
    return [(1-2*y*y-2*z*z)*s[0],(2*x*y+2*z*w)*s[0],(2*x*z-2*y*w)*s[0],0,(2*x*y-2*z*w)*s[1],(1-2*x*x-2*z*z)*s[1],(2*y*z+2*x*w)*s[1],0,(2*x*z+2*y*w)*s[2],(2*y*z-2*x*w)*s[2],(1-2*x*x-2*y*y)*s[2],0,...t,1];
  }
  const matrices=new Map();function walk(i,parent){const n=doc.nodes[i],m=mul(parent,local(n));matrices.set(i,m);for(const c of n.children||[])walk(c,m);}
  for(const root of doc.scenes[doc.scene||0].nodes)walk(root,identity());
  const rows=[];
  function heights(index,m,delta=false){
    const a=doc.accessors[index];if(a.componentType!==5126||a.type!=='VEC3')throw Error('Unsupported body position format');
    const result=new Float64Array(a.count);if(!delta)result.fill(m[13]);
    const y=p=>m[1]*view.getFloat32(p,true)+m[5]*view.getFloat32(p+4,true)+m[9]*view.getFloat32(p+8,true)+(delta?0:m[13]);
    if(a.bufferView!==undefined){const b=doc.bufferViews[a.bufferView];if(b.buffer!==0)throw Error('External body buffer');const start=bin+(b.byteOffset||0)+(a.byteOffset||0),stride=b.byteStride||12;for(let i=0;i<a.count;i++)result[i]=y(start+i*stride);}
    if(a.sparse){const sp=a.sparse,ib=doc.bufferViews[sp.indices.bufferView],vb=doc.bufferViews[sp.values.bufferView],start=bin+(ib.byteOffset||0)+(sp.indices.byteOffset||0),values=bin+(vb.byteOffset||0)+(sp.values.byteOffset||0);const type=sp.indices.componentType,bytes={5121:1,5123:2,5125:4}[type];if(!bytes)throw Error('Unsupported sparse index');for(let j=0;j<sp.count;j++){const at=start+j*bytes,i=bytes===1?view.getUint8(at):bytes===2?view.getUint16(at,true):view.getUint32(at,true);result[i]=y(values+j*12);}}
    return result;
  }
  for(const [i,m] of matrices){const node=doc.nodes[i];if(node.mesh===undefined)continue;
    const mesh=doc.meshes[node.mesh];
    const body=node.extras?.MPFB_GEN_object_type==='Basemesh'||node.extras?.MhObjectType==='Basemesh';
    for(const p of mesh.primitives||[]){const name=(doc.materials?.[p.material]?.name||'').toLowerCase();if(!body&&!/^(human\.body|jnsq\.skin\.|jnaiq\.skin\.)/.test(name))continue;
      const names=(mesh.extras?.targetNames||[]).map(n=>n.replace(/^JNSQ_/,'JNAIQ_'));
      rows.push({base:heights(p.attributes.POSITION,m),targets:(p.targets||[]).map((t,j)=>({name:names[j],weight:mesh.weights?.[j]||0,ys:t.POSITION===undefined?null:heights(t.POSITION,m,true)}))});
    }
  }
  if(!rows.length)throw Error('This model has no identified body mesh');
  function measure(values){
    const weights=new Map();for(const [id,,low,high] of controls){const value=Number(values[id]??.5),gate=['fangs_protrusion','tusks_protrusion'].includes(id)?Math.max(0,(Number(values[id.replace('_protrusion','')]??.5)-.5)*2):['ear_tip_angle','ear_tip_spread'].includes(id)?Math.max(0,(Number(values.ear_point??.5)-.5)*2):id.startsWith('fat_')?Math.max(0,(Number(values.body_adiposity??.5)-.5)*2):id.startsWith('fullness_')?Math.max(0,(Number(values.face_neck_fullness??.5)-.5)*2):1;weights.set(low,Math.max(0,(.5-value)*2)*gate);weights.set(high,Math.max(0,(value-.5)*2)*gate);}
    const anchors=controls.filter(([id])=>id.startsWith('character_')&&id!=='character_age').map(row=>row[3]);const total=Math.max(1,anchors.reduce((sum,key)=>sum+(weights.get(key)||0),0));for(const key of anchors)weights.set(key,(weights.get(key)||0)/total);
    let lo=Infinity,hi=-Infinity;for(const row of rows){const active=row.targets.map(t=>({...t,weight:weights.has(t.name)?weights.get(t.name):t.weight})).filter(t=>t.ys&&t.weight);for(let i=0;i<row.base.length;i++){let y=row.base[i];for(const t of active)y+=t.ys[i]*t.weight;lo=Math.min(lo,y);hi=Math.max(hi,y);}}
    return hi-lo;
  }
  function solve(metres,values){
    const low=measure({...values,stature:0}),high=measure({...values,stature:1});
    if(!Number.isFinite(metres)||metres<low-1e-7||metres>high+1e-7)throw Error(`Choose a height from ${(low*100).toFixed(1)} to ${(high*100).toFixed(1)} cm for these proportions.`);
    let a=0,b=1;for(let i=0;i<24;i++){const mid=(a+b)/2;if(measure({...values,stature:mid})<metres)a=mid;else b=mid;}return (a+b)/2;
  }
  return {measure,solve};
}
function avatarHeightImperial(metres){const total=Math.round(metres/.0254*10)/10;return {feet:Math.floor(total/12),inches:Number((total%12).toFixed(1))};}
