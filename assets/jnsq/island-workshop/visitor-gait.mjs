import * as THREE from './vendor/three.module.js';

// Same measured joint-frame transfer as studio_motion.gd. The clip supplies
// articulated walking; contact correction below seats feet on actual treads.
export function createGait(model,root,clip,ground){
  const bones=[];model.traverse(o=>{if(o.isBone)bones.push(o);});
  const canonical=bone=>bone.name.replace(/_([LR])$/,'.$1');
  const names=new Map(bones.map(b=>[canonical(b),b]));
  const mapping={root:'Hips',spine03:'Spine',spine02:'Chest',spine01:'UpperChest',neck01:'Neck',head:'Head'};
  for(const side of ['L','R'])for(const [a,b] of [['clavicle','Shoulder'],['upperarm01','UpperArm'],['lowerarm01','LowerArm'],['wrist','Hand'],['upperleg01','UpperLeg'],['lowerleg01','LowerLeg'],['foot','Foot'],['toe1-1','Toes']])mapping[a+'.'+side]=(side==='L'?'Left':'Right')+b;
  root.updateMatrixWorld(true);
  const q=()=>new THREE.Quaternion(),v=()=>new THREE.Vector3(),rootInverse=model.getWorldQuaternion(q()).invert(),pairs=[];
  for(const bone of bones){
    const name=canonical(bone);
    const index=clip.bones.findIndex(s=>s.name===(mapping[name]||name));if(index<0)continue;
    const source=clip.bones[index],rest=bone.getWorldQuaternion(q()).premultiply(rootInverse),alignment=q();
    const nextName=name.replace('upperarm01','lowerarm01').replace('lowerarm01','wrist');
    let next=names.get(name.startsWith('upperarm01')?name.replace('upperarm01','lowerarm01'):nextName);
    if(name.startsWith('upperleg01'))next=names.get(name.replace('upperleg01','lowerleg01'));
    if(name.startsWith('lowerleg01'))next=names.get(name.replace('lowerleg01','foot'));
    if(next&&source.direction){const direction=next.getWorldPosition(v()).sub(bone.getWorldPosition(v())).normalize().applyQuaternion(rootInverse);alignment.setFromUnitVectors(direction,v().fromArray(source.direction).normalize());}
    pairs.push({bone,index,rest,alignment,inverse:q().fromArray(source.rest).invert()});
  }
  const legs=[];
  for(const side of ['L','R']){const hip=names.get('upperleg01.'+side),knee=names.get('lowerleg01.'+side),foot=names.get('foot.'+side);if(!hip||!knee||!foot)continue;
    const p=foot.getWorldPosition(v());legs.push({hip,knee,foot,ankle:Math.max(.04,p.y-root.getWorldPosition(v()).y)});
  }
  const hips=clip.hips,travel=hips?Math.max(.4,v().fromArray(hips.at(-1)).sub(v().fromArray(hips[0])).length()):1.1;
  let distance=0,previous=root.position.clone();
  return {update(moving){
    distance+=root.position.distanceTo(previous);previous.copy(root.position);
    const cursor=(distance/travel%1)*clip.frames.length,first=Math.floor(cursor),second=(first+1)%clip.frames.length;
    const rootQ=model.getWorldQuaternion(q());
    for(const p of pairs){const rotation=q().fromArray(clip.frames[first][p.index]).slerp(q().fromArray(clip.frames[second][p.index]),cursor-first);
      const desired=rootQ.clone().multiply(rotation).multiply(p.inverse).multiply(p.alignment).multiply(p.rest);
      p.bone.quaternion.copy(p.bone.parent.getWorldQuaternion(q()).invert().multiply(desired));p.bone.updateWorldMatrix(false,true);
    }
    for(const leg of legs){
      const current=leg.foot.getWorldPosition(v()),height=ground(current.x,current.z,root.position.y);
      if(height===null)continue;
      const target=current.clone();target.y=moving?Math.max(current.y,height+leg.ankle):height+leg.ankle;
      solveLeg(leg.hip,leg.knee,leg.foot,target,rootQ);
    }
  }};
}

export function solveLeg(hip,knee,foot,target,rootQ=new THREE.Quaternion()){
  const v=()=>new THREE.Vector3(),q=()=>new THREE.Quaternion();
  const a=hip.getWorldPosition(v()),b=knee.getWorldPosition(v()),c=foot.getWorldPosition(v());
  const upper=a.distanceTo(b),lower=b.distanceTo(c),delta=target.clone().sub(a),distance=Math.max(.001,Math.min(upper+lower-.0001,delta.length()));
  const along=delta.normalize(),forward=new THREE.Vector3(0,0,1).applyQuaternion(rootQ);
  const bend=forward.addScaledVector(along,-forward.dot(along)).normalize();
  const projection=(upper*upper+distance*distance-lower*lower)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-projection*projection));
  const desiredKnee=a.clone().addScaledVector(along,projection).addScaledVector(bend,height);
  function aim(bone,child,target){const origin=bone.getWorldPosition(v()),from=child.getWorldPosition(v()).sub(origin).normalize(),to=target.clone().sub(origin).normalize();
    const desired=q().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(q()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(q()).invert().multiply(desired));bone.updateWorldMatrix(false,true);
  }
  aim(hip,knee,desiredKnee);aim(knee,foot,target);
}
