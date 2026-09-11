import * as THREE from './vendor/three.module.js';
import {random} from './terrain.mjs?caves=retired';

// Displace shared positions consistently so facets meet without cracks.
export function makeRock(kind,variant=0){
  const rng=random(9031+variant*7919), pieces=[];
  function lump(x,y,z,sx,sy,sz,round=false){
    const g=new THREE.IcosahedronGeometry(1,round?3:2),p=g.attributes.position;
    const phase=rng()*7;
    for(let i=0;i<p.count;i++){
      const a=p.getX(i),b=p.getY(i),c=p.getZ(i);
      const coarse=Math.sin(a*4+phase)*Math.cos(b*5+c*3+phase);
      const chips=Math.sin(a*13+c*9+phase)*Math.cos(b*11-a*7);
      const noise=1+(round?.035:.18)*coarse+(round?.008:.055)*chips;
      p.setXYZ(i,x+a*sx*noise,y+b*sy*noise,z+c*sz*noise);
    }
    g.computeVertexNormals();
    if(round){
      // Average only coincident vertices of naturally rounded stones. Positions,
      // faces and sharp authored slate/basalt edges are unchanged.
      const normals=g.attributes.normal,groups=new Map();
      for(let i=0;i<p.count;i++){
        const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(',');
        if(!groups.has(key))groups.set(key,{normal:new THREE.Vector3(),indices:[]});
        const group=groups.get(key);group.normal.add(new THREE.Vector3().fromBufferAttribute(normals,i));group.indices.push(i);
      }
      for(const group of groups.values()){group.normal.normalize();for(const i of group.indices)normals.setXYZ(i,group.normal.x,group.normal.y,group.normal.z);}
    }
    pieces.push(g);
  }
  if(kind==='basalt_rock'){
    for(let i=0;i<7;i++){const a=i*2.4,h=2+rng()*3;const g=new THREE.CylinderGeometry(.48,.56,h,6);g.translate(Math.cos(a)*(i?1:0),h/2,Math.sin(a)*(i?1:0));pieces.push(g.toNonIndexed());g.dispose();}
  }else if(kind==='slate_rock'){
    for(let i=0;i<6;i++)lump((rng()-.5)*.4,.25+i*.38,0,2.1-i*.15,.32,1.5-i*.1);
  }else if(kind==='rock_cluster'){
    for(let i=0;i<6;i++){const s=.6+rng()*.7,a=i*2.4;lump(Math.cos(a)*1.4,s*.65,Math.sin(a)*1.2,s,s*.85,s*.8);}
  }else if(kind==='standing_rock')lump(.15,2.4,0,.9+rng()*.3,2.65, .65);
  else if(kind==='river_rock')lump(0,.5,0,1.5+rng()*.3,.65,1.2,true);
  else lump(0,.95,0,1.3+rng()*.5,1.2+rng()*.25,1+rng()*.5);
  const g=new THREE.BufferGeometry();
  for(const name of ['position','normal','uv']){
    const size=name==='uv'?2:3,arrays=pieces.map(p=>p.attributes[name].array),out=new Float32Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;
    for(const a of arrays){out.set(a,offset);offset+=a.length;}g.setAttribute(name,new THREE.BufferAttribute(out,size));
  }
  g.computeBoundingBox();g.translate(0,-g.boundingBox.min.y-.08,0);g.computeBoundingBox();g.computeBoundingSphere();pieces.forEach(p=>p.dispose());return g;
}
