import * as THREE from './vendor/three.module.js';

// Smooth only the displayed eye position. Mouse look and the host's body/path
// remain immediate. Exponential response is stable across frame rates.
export function createEyeFollower({horizontalResponse=.055,verticalResponse=.10,snapDistance=3.1}={}){
  const position=new THREE.Vector3();let initialized=false;
  function reset(target){position.copy(target);initialized=true;return position;}
  return {reset,update(target,delta){
    if(!initialized||position.distanceTo(target)>snapDistance)return reset(target);
    const dt=Math.max(0,delta);
    const horizontal=-Math.expm1(-dt/horizontalResponse),vertical=-Math.expm1(-dt/verticalResponse);
    position.x+=(target.x-position.x)*horizontal;position.z+=(target.z-position.z)*horizontal;
    position.y+=(target.y-position.y)*vertical;return position;
  }};
}
