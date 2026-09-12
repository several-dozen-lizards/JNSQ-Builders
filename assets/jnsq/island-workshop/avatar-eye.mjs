import * as THREE from './vendor/three.module.js';

// The visitor camera follows authored anatomy in body-local coordinates. Keep
// this separate from the World Builder's free-roaming first-person controls.
export function eyeAnchor(model,root){
  model.updateWorldMatrix(true,true);
  const eyes=[];
  let head=null;
  model.traverse(node=>{
    if(!node.isBone)return;
    const name=node.name.toLowerCase().replace(/_([lr])$/,'.$1');
    if(['eyel','eyer','eye.l','eye.r','left_eye','right_eye','lefteye','righteye'].includes(name))eyes.push(node);
    if(name==='head')head=node;
  });
  const point=new THREE.Vector3();
  if(eyes.length){
    for(const eye of eyes)point.add(eye.getWorldPosition(new THREE.Vector3()));
    point.divideScalar(eyes.length);
  }else if(head){
    head.getWorldPosition(point);
  }else{
    const bounds=new THREE.Box3().setFromObject(model);
    if(bounds.isEmpty())return new THREE.Vector3(0,1.55,0);
    bounds.getCenter(point);
    point.y=bounds.min.y+(bounds.max.y-bounds.min.y)*.93;
  }
  return root.worldToLocal(point);
}
