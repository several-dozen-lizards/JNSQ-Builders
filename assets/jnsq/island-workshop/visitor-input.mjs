export function walkingDirection(keys,yaw){
 const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
 const right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
 const length=Math.hypot(forward,right);
 if(!length)return null;
 return {x:(-Math.sin(yaw)*forward+Math.cos(yaw)*right)/length,z:(-Math.cos(yaw)*forward-Math.sin(yaw)*right)/length};
}
// Keep one request in flight. Start the next collision-checked stride near the
// end of this one, using observed network travel time rather than a timer.
export function createWalkInput({step,motionEnd,motionDuration=()=>0,now=()=>Date.now()/1000}){
 const keys=new Set();let pending=false,blocked=false,roundTrip=0;
 return {keys,press(code){keys.add(code);blocked=false;},release(code){keys.delete(code);blocked=false;},clear(){keys.clear();blocked=false;},
 async tick(yaw){const direction=walkingDirection(keys,yaw),lead=Math.min(roundTrip/2,motionDuration()/2);if(!direction||pending||blocked||now()<motionEnd()-lead)return;pending=true;const sent=now();
  try{blocked=!!(await step(direction,keys.has('ShiftLeft')||keys.has('ShiftRight')));}catch{blocked=true;}finally{roundTrip=Math.max(0,now()-sent);pending=false;}
 }};
}
