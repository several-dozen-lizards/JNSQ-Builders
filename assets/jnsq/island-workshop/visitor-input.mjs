export function walkingDirection(keys,yaw){
 const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
 const right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
 const length=Math.hypot(forward,right);
 if(!length)return null;
 return {x:(-Math.sin(yaw)*forward+Math.cos(yaw)*right)/length,z:(-Math.cos(yaw)*forward-Math.sin(yaw)*right)/length};
}
// Queue one stride at a time, advancing when the host's motion completes.
export function createWalkInput({step,motionEnd,now=()=>Date.now()/1000}){
 const keys=new Set();let pending=false,blocked=false;
 return {keys,press(code){keys.add(code);blocked=false;},release(code){keys.delete(code);blocked=false;},clear(){keys.clear();blocked=false;},
 async tick(yaw){const direction=walkingDirection(keys,yaw);if(!direction||pending||blocked||now()<motionEnd())return;pending=true;
  try{blocked=!!(await step(direction,keys.has('ShiftLeft')||keys.has('ShiftRight')));}catch{blocked=true;}finally{pending=false;}
 }};
}
