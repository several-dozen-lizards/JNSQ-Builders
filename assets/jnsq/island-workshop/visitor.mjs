import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createGait} from './visitor-gait.mjs';
import {alignAvatarFacing} from './avatar-facing.mjs';
import {furnitureLayer} from './furniture.mjs';
import {heightAt} from './terrain.mjs';
import {nearbyTeleporters} from './teleporter-model.mjs';
import {installRoomChat} from './room-chat.mjs';
import {createWalkInput} from './visitor-input.mjs';
import {eyeAnchor} from './avatar-eye.mjs';
import {createEyeFollower} from './visitor-camera.mjs';
import {roomJson,watchRoomConnection} from './visitor-connection.mjs';
import {walkingSurfaces} from './visitor-surfaces.mjs';
import {avatarHeightSetting,fitAvatarHeight} from './avatar-height.mjs';

export async function installVisitor({scene,camera,controls,canvas,world,restore,invalidate,status,arrival,id,applyEnvironment,onReady,onError}){
  const member=new URLSearchParams(location.search).get('member')||'Re',rid='workshop_'+id;
  installRoomChat(member);
  async function refreshEnvironment(){
    const data=await json('/tuning'),patch=data.rooms?.[rid]||{};
    const atmosphere={...world.atmosphere};
    for(const key of ['environment','landBrightness','strength','followLocalWeather','water','customSky'])if(key in patch)atmosphere[key]=patch[key];
    if('weather' in patch)atmosphere.weather=patch.weather==='cloudy'?'overcast':patch.weather;
    if('hour_override' in patch){atmosphere.followLocalTime=patch.hour_override<0;if(patch.hour_override>=0)atmosphere.hour=patch.hour_override;}
    weatherLabel.textContent='Weather · '+(atmosphere.weather||'scattered');
    applyEnvironment?.(atmosphere);invalidate();
  }
  document.body.classList.add('visiting');
  document.title=world.name+' · JNSQ';
  document.querySelector('header h1').textContent=world.name;
  document.querySelector('header small').textContent='JNSQ / VISITING';
  document.querySelector('header .actions').replaceChildren();
  const bar=document.querySelector('header .actions');
  const weatherLabel=document.createElement('span');weatherLabel.style.cssText='font-size:12px;color:#b9d5cb';bar.append(weatherLabel);
  const grassControl=document.getElementById('groundCover');if(grassControl)bar.append(grassControl.parentElement);
  function button(label,run){const b=document.createElement('button');b.textContent=label;b.onclick=run;bar.append(b);return b;}
  const style=document.createElement('style');style.textContent='.visiting aside,.visiting #workspace>*:not(#stage),.visiting #viewbar,.visiting footer>span:not(#status){display:none!important}.visiting main{display:block}.visiting #workspace{height:100%}.visiting header .actions{flex-wrap:wrap}.visiting #help{pointer-events:none}';document.head.append(style);
  const label=document.createElement('span');label.style.cssText='color:#b9d5cb;font-size:12px';bar.append(label);
  let snapshot=null,first=true,firstPerson=true,stopped=false,connected=false,started=false;
  const lifetime=new AbortController();
  // Register before awaiting the long-lived subscription, not after it exits.
  window.addEventListener('pagehide',()=>{stopped=true;lifetime.abort();},{once:true});
  const furniture=furnitureLayer({scene,invalidate:()=>invalidate(true),status,ground:(x,z)=>heightAt(world,x,z)});
  controls.enabled=false;
  const bodies=new Map(),loader=new GLTFLoader();
  const avatarSettings=json('/tuning');
  const clipPromise=fetch('/api/world-walk-clip').then(r=>r.ok?r.json():null).catch(()=>null);
  const idlePromise=fetch(new URL('./visitor-idle.json',import.meta.url)).then(r=>r.ok?r.json():null).catch(()=>null);
  const footRay=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  const ground=(x,z,y)=>{footRay.set(new THREE.Vector3(x,y+.45,z),down);footRay.far=.9;
    const hit=footRay.intersectObjects(walkingSurfaces(scene.children),false).find(h=>h.face?.normal.y>.5);return hit?hit.point.y:null;};
  async function json(url,options={}){return roomJson(url,{...options,signal:lifetime.signal,timeoutMs:url.includes('/events/wait')?35000:15000});}
  async function act(action,payload={}){return json('/api/act',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({member,action,payload,...(action==='walk'?{to:payload.to,heading_deg:((yaw*180/Math.PI)%360+360)%360}:{})})});}
  async function chooseDestination(){
    try{
      const me=snapshot?.members[member];if(!me)return;
      await refresh();const source=nearbyTeleporters(snapshot,pose(snapshot.members[member]))[0]||'';
      if(document.pointerLockElement===canvas)document.exitPointerLock();
      const offer={portal:source,destinations:snapshot.portal_menu?.destinations||[]};
      document.getElementById('destination-menu')?.remove();
      const menu=document.createElement('dialog');menu.id='destination-menu';
      const title=document.createElement('h2');title.textContent='Where to?';menu.append(title);
      for(const dest of offer.destinations||[]){
        const b=document.createElement('button');b.textContent=dest.name;b.style.display='block';
        b.onclick=async()=>{const buttons=[...menu.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);title.textContent='Travelling…';try{const result=await act('portal',{source:offer.portal,to:dest.destination||dest.room});if(result.to===rid){await refresh();menu.close();focus();}else location.replace('/3d/?member='+encodeURIComponent(member));}catch(e){title.textContent=e.message;buttons.forEach(b=>b.disabled=false);}};menu.append(b);
      }
      const stay=document.createElement('button');stay.textContent='Stay';stay.onclick=()=>menu.close();menu.append(stay);
      menu.addEventListener('close',()=>menu.remove());document.body.append(menu);menu.showModal();
    }catch(e){status(e.message,true);}
  }
  const returnButton=document.createElement('span');bar.append(returnButton);
  const viewButton=button('First person · switch to orbit',()=>{walkInput.clear();firstPerson=!firstPerson;viewButton.textContent=firstPerson?'First person · switch to orbit':'Orbit · return to first person';controls.enabled=!firstPerson;focus();});
  button('Find me',focus);
  button('Room settings',()=>location.assign('/?room='+encodeURIComponent(rid)+'&member='+encodeURIComponent(member)));
  const editor=document.createElement('a');editor.className='action';editor.textContent='World Builder';editor.href='/island-workshop';editor.target='_blank';bar.append(editor);
  document.querySelector('#help').textContent='Hold W / S to walk forward or back · A / D to strafe · Shift to run. Click the view and move the mouse to look. Double-click ground to walk there. Press E for destinations. Walk to a glowing portal to travel.';
  function pose(rec,now=Date.now()/1000){
    const p=new THREE.Vector3(rec.position_m[0],rec.height_m||0,-rec.position_m[1]),motion=rec.movement;
    if(!motion?.path_xyz)return p;
    let t=Math.max(0,Math.min(1,(now-motion.started_at-motion.turn_duration_s)/motion.move_duration_s));
    if(motion.interpolation!=='linear')t=t<.5?2*t*t:1-(-2*t+2)**2/2;
    const path=motion.path_xyz,k=t*(path.length-1),i=Math.min(path.length-2,Math.floor(k));
    return p.fromArray(path[i]).lerp(new THREE.Vector3().fromArray(path[i+1]),k-i);
  }
  let yaw=0,pitch=0;
  const eyeFollower=createEyeFollower();
  function eyePosition(p){return p.clone().add((bodies.get(member)?.eye||new THREE.Vector3(0,1.55,0)).clone().applyAxisAngle(new THREE.Vector3(0,1,0),yaw));}
  function focus(){const rec=snapshot?.members[member];if(!rec)return;const p=pose(rec);
    if(firstPerson){camera.position.copy(eyeFollower.reset(eyePosition(p)));camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0);}
    else{controls.target.copy(p).add(new THREE.Vector3(0,1,0));camera.position.copy(p).add(new THREE.Vector3(2,1.8,3));controls.update();}invalidate();}
  async function body(name,rec){
    const root=new THREE.Group();root.userData.visitorBody=true;scene.add(root);const marker=new THREE.Mesh(new THREE.CapsuleGeometry(.22,1.15,6,10),new THREE.MeshStandardMaterial({color:name===member?0xffce80:0x80d6b6}));marker.position.y=.8;root.add(marker);
    const entry={root,rec,marker};bodies.set(name,entry);
    try{
      let url='/avatars/'+encodeURIComponent(name.toLowerCase())+'.glb';
      if(rec.avatar_package)url='/api/avatar-library/packages/'+encodeURIComponent(rec.avatar_package)+'/model';
      const [gltf,settings]=await Promise.all([loader.loadAsync(url),avatarSettings]);if(bodies.get(name)!==entry)return;
      // Normalize in model space before attaching to an elevated room body.
      // Skinned bounds after parenting can count the room elevation twice.
      alignAvatarFacing(gltf.scene);
      fitAvatarHeight(gltf.scene,avatarHeightSetting(settings,rid,name));
      root.remove(marker);root.add(gltf.scene);entry.model=gltf.scene;
      entry.eye=eyeAnchor(gltf.scene,root);
      gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      if(gltf.animations.length){entry.mixer=new THREE.AnimationMixer(gltf.scene);const walk=gltf.animations.find(a=>/walk/i.test(a.name));if(walk)entry.walk=entry.mixer.clipAction(walk).play();}
      const [clip,idle]=await Promise.all([clipPromise,idlePromise]);
      if(!entry.walk&&clip)entry.gait=createGait(gltf.scene,root,clip,ground,idle);
      invalidate(true);
    }catch(error){console.error(name+': avatar load failed',error);status(name+': avatar unavailable; showing a body marker.',true);}
  }
  function apply(s){snapshot=s;furniture.sync(s.objects||{});for(const [name,rec] of Object.entries(s.members)){if(!bodies.has(name))body(name,rec);else bodies.get(name).rec=rec;}
    for(const [name,entry] of bodies)if(!s.members[name]){scene.remove(entry.root);bodies.delete(name);}
    const me=s.members[member];if(!me){status('You are not in this world. Enter through the Nexus teleporter.',true);returnButton.disabled=true;return;}
    if(first){yaw=(me.heading_deg||0)*Math.PI/180;first=false;focus();}
    invalidate();
  }
  async function refresh(){apply(await json('/api/rooms/'+rid+'?member='+encodeURIComponent(member)));}
  async function walk(x,z,control){if(!connected)return true;try{const r=await act('walk',{to:[x,-z],control,expected_room:rid});status(r.blocked_by?'Stopped at '+r.blocked_by.replaceAll('_',' '):control==='run'?'Running':'Walking');const rec=snapshot?.members[member];if(rec&&r.motion){rec.movement=r.motion;rec.position_m=r.current_position_m||rec.position_m;}else await refresh();return !!r.blocked_by;}catch(e){status(e.message,true);return true;}}
  canvas.addEventListener('dblclick',e=>{e.preventDefault();e.stopImmediatePropagation();const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hits=ray.intersectObjects(walkingSurfaces(scene.children),false);const p=hits[0]?.point;if(p)walk(p.x,p.z);},true);
  let dragging=null;
  canvas.addEventListener('pointerdown',e=>{canvas.focus();if(firstPerson){dragging=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);if(document.pointerLockElement!==canvas)canvas.requestPointerLock?.()?.catch?.(()=>{});e.stopImmediatePropagation();}},true);
  canvas.addEventListener('pointermove',e=>{if(firstPerson){if(dragging&&document.pointerLockElement!==canvas){yaw-=(e.clientX-dragging[0])*.004;pitch=Math.max(-1.35,Math.min(1.35,pitch-(e.clientY-dragging[1])*.004));dragging=[e.clientX,e.clientY];camera.rotation.set(pitch,yaw,0);invalidate();}e.stopImmediatePropagation();}},true);
  document.addEventListener('mousemove',e=>{if(firstPerson&&document.pointerLockElement===canvas){yaw-=e.movementX*.004;pitch=Math.max(-1.35,Math.min(1.35,pitch-e.movementY*.004));camera.rotation.set(pitch,yaw,0);invalidate();}});
  canvas.addEventListener('pointerup',e=>{dragging=null;if(firstPerson)e.stopImmediatePropagation();},true);
  const walkInput=createWalkInput({motionEnd:()=>{const m=snapshot?.members[member]?.movement;return m?m.started_at+m.total_duration_s:0;},motionDuration:()=>snapshot?.members[member]?.movement?.total_duration_s||0,step:async (direction,running)=>{const rec=snapshot?.members[member];if(!rec)return true;const p=pose(rec);return walk(p.x+direction.x*.9,p.z+direction.z*.9,running?'run':'walk');}});
  canvas.tabIndex=0;
  const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight']);
  document.addEventListener('keydown',e=>{
    if(e.target.closest('#traveller-chat,input,textarea,select,[contenteditable]')||document.querySelector('dialog[open]')){walkInput.clear();return;}
    if(e.code==='KeyE'&&!e.repeat){walkInput.clear();e.preventDefault();e.stopImmediatePropagation();chooseDestination();return;}
    if(!movementKeys.has(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(!e.repeat)walkInput.press(e.code);
    walkInput.tick(yaw);
  },true);
  document.addEventListener('keyup',e=>walkInput.release(e.code),true);
  window.addEventListener('blur',()=>walkInput.clear());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)walkInput.clear();});
  document.addEventListener('focusin',e=>{if(e.target.closest('#traveller-chat,input,textarea,select,[contenteditable]'))walkInput.clear();});
  let previous=performance.now();
  function render(now){if(stopped)return;requestAnimationFrame(render);walkInput.tick(yaw);const delta=(now-previous)/1000;previous=now;let moving=false;
    for(const [name,entry] of bodies){const p=pose(entry.rec),motion=entry.rec.movement,isMoving=!!(motion&&Date.now()/1000<motion.started_at+motion.total_duration_s);entry.root.position.copy(p);entry.root.rotation.y=(entry.rec.heading_deg||0)*Math.PI/180;entry.root.visible=!(firstPerson&&name===member);if(entry.walk){entry.walk.paused=!isMoving;entry.mixer.update(delta);}if(entry.root.visible&&entry.gait?.update(isMoving,delta))moving=true;moving||=isMoving;}
    const me=snapshot?.members[member];if(me){const p=pose(me);label.textContent=`${member} · elevation ${p.y.toFixed(2)} m`;const near=nearbyTeleporters(snapshot,p);returnButton.textContent=near.length?'E · '+snapshot.objects[near[0]].name+' — destinations':'';if(firstPerson){camera.position.copy(eyeFollower.update(eyePosition(p),delta));camera.rotation.set(pitch,yaw,0);}if(moving||firstPerson)invalidate(moving);}
  }
  try{await watchRoomConnection({signal:lifetime.signal,
    connect:async()=>{await refresh();await refreshEnvironment();return snapshot.last_seq||0;},
    wait:seq=>json(`/api/rooms/${rid}/events/wait?since=${seq}&member=${encodeURIComponent(member)}`),
    apply:async(data,seq)=>{for(const e of data.events||[]){seq=Math.max(seq,e.seq);if(['environment_settings','weather_revision'].includes(e.kind))await refreshEnvironment();if(e.kind==='depart'&&e.member===member){lifetime.abort();location.replace('/3d/?member='+encodeURIComponent(member));return seq;}}if(data.events?.length)await refresh();return seq;},
    onConnect:()=>{connected=true;status('Visiting '+world.name);if(!started){started=true;onReady?.();requestAnimationFrame(render);}},
    onDisconnect:()=>{connected=false;walkInput.clear();status('Connection interrupted · reconnecting to the room…',true);},
  });}catch(e){connected=false;walkInput.clear();status(e.message+' · Reload the room view to reconnect.',true);onError?.(e);}
}

