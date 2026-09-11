import * as THREE from './vendor/three.module.js';

// Solid leaf silhouettes, no transparent cards or per-leaf objects.
// A flowering patch costs 28 triangles; the existing grass clump costs 27.
export function leafCarpetGeometry(flowers=false){
  const p=[],c=[],uv=[];
  function tri(vertices,colour){for(const [i,v] of vertices.entries()){p.push(...v);c.push(...colour);uv.push(i===1?1:0,i===2?1:0);}}
  for(let i=0;i<9;i++){
    const angle=i*2.399,r=.12+Math.sqrt(i/9)*.38,x=Math.cos(angle)*r,z=Math.sin(angle)*r;
    const length=.22+(i%3)*.035,width=length*.53,y=.10+(i%4)*.07;
    const along=[Math.cos(angle+.6),Math.sin(angle+.6)],across=[-along[1],along[0]];
    const base=[x-along[0]*length*.45,y*.65,z-along[1]*length*.45],tip=[x+along[0]*length*.55,y,z+along[1]*length*.55];
    const left=[x+across[0]*width,y*.76,z+across[1]*width],right=[x-across[0]*width,y*.76,z-across[1]*width];
    const colour=[.19+(i%3)*.025,.35+(i%4)*.018,.11+(i%2)*.025];
    tri([base,left,tip],colour);tri([base,tip,right],colour.map(v=>v*.88));
  }
  if(flowers)for(let i=0;i<2;i++){
    const x=i?.21:-.24,z=i?-.15:.12,y=.39+i*.08;
    for(let j=0;j<5;j++){
      const angle=j*Math.PI*2/5,a=angle-.42,b=angle+.42,r=.07;
      tri([[x,y-.015,z],[x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r]],[.64,.39,.84]);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  // Upward-facing leaf lighting on both faces, matching the grass material.
  const n=g.attributes.normal;for(let i=0;i<n.count;i++){const v=new THREE.Vector3(n.getX(i),Math.abs(n.getY(i))+.5,n.getZ(i)).normalize();n.setXYZ(i,v.x,v.y,v.z);}
  g.computeBoundingSphere();return g;
}
export function coverKind(site,world){
  if(['desert','craggy','savanna'].includes(world.style))return 'grass';
  const phase=(world.seed%997)*.017;
  const patch=Math.sin(site.x*.17+phase)*Math.cos(site.z*.13-phase)+.38*Math.sin(site.x*.43+site.z*.27+phase);
  if(patch<-.18)return 'grass';
  return patch>.65&&site.tint>.75?'flowers':'leaves';
}
