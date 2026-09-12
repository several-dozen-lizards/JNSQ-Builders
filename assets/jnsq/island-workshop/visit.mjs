import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {N,heightAt,slopeAt,clamp} from './terrain.mjs?caves=retired';
import {islandMaterials} from './materials.mjs?natural=1';
import {PLANT_IDS,specimenVariant} from './plants.mjs?crystals=2';
import {createFlora} from './flora-render.mjs?crystals=2';
import {objectHeight} from './geology.mjs?caves=retired';
import {createAtmosphere} from './atmosphere.mjs?realism=1';
import {createWorldLighting} from './world-lighting.mjs';
import {createSkyIllumination} from './sky-illumination.mjs';

import {daylight,localClockHour,advanceHour} from './daylight.mjs?lava=1';
import {weatherProfile} from './weather.mjs?spacefx=1';
import {createLandscapeFeatures} from './feature-render.mjs?ice=1';
import {createStepSurfaces} from './step-routes.mjs';
import {createGroundCover} from './ground-cover.mjs?visitor=1';
import {makeStructure} from './structures.mjs?caves=retired';
import {columnPositions,columnGeometry} from './columns.mjs';
import {buildingMaterial} from './building-materials.mjs';
import {sculptGeometry} from './rock-sculpt.mjs?types=1';
import {weatherStone} from './stone-surface.mjs?types=1';
import {installVisitor} from './visitor.mjs?direct=1';
import {renderRecovery,graphicsRecoveryPanel} from './render-recovery.mjs';
const $=id=>document.getElementById(id);
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
const id=new URLSearchParams(location.search).get('visit');
async function stage(message){status(message);$('loading')?.querySelector('p')?.replaceChildren(message);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
async function start(){
  if(!/^[a-f0-9]{32}$/.test(id||''))throw Error('This published location link is invalid.');
  const response=await fetch('/api/world-destinations/'+encodeURIComponent(id));
  if(!response.ok)throw Error('This published location is unavailable.');
  const published=await response.json(),world=published.world;
  if(!world||world.heights?.length!==(N+1)**2)throw Error('The published landscape is incomplete.');
  document.title=world.name+' · JNSQ';$('loading-title').textContent='Entering '+world.name+'…';
  let dirtyFrame=true,waterTime=0,renderer;
  window.addEventListener('island-texture-ready',()=>dirtyFrame=true);
  const state={hour:localClockHour(),followLocalTime:true,playing:false,minutes:15,environment:'clouds',weather:'scattered',strength:.65,cloudShadows:true,sunRays:true,nebulaClouds:false,cavernLighting:'natural',landBrightness:1,lightingColor:'#ffffff',water:{surface:'visible',color:'#087f91',glow:.35,ripples:1},customSky:null,...world.atmosphere};
  const daylightControl={state,tick(delta){if(state.followLocalTime)state.hour=localClockHour();else if(state.playing)state.hour=advanceHour(state.hour,delta,state.minutes);return daylight(state.hour);}};
try{renderer=new THREE.WebGLRenderer({canvas:$('viewport'),antialias:true});}catch(e){status('The 3D view could not start. Enable hardware acceleration and reload.',true);throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x88adb2);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
const recoveryPanel=graphicsRecoveryPanel($('stage'));
const graphics=renderRecovery(renderer.domElement,{
  onLost:()=>recoveryPanel.show('The 3D graphics connection was interrupted. Waiting for it to recover…'),
  onRestored:()=>{renderer.shadowMap.needsUpdate=true;dirtyFrame=true;recoveryPanel.hide();},
  onFailure:error=>{console.error('Island render failed',error);recoveryPanel.show('The 3D view could not draw this scene. Reload the view to try again.');},
});
let drawing=true;window.addEventListener('pagehide',()=>{drawing=false;graphics.dispose();},{once:true});
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const naturalMaterials=islandMaterials(renderer,()=>dirtyFrame=true,message=>status(message,true));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(43,1,.03,12000),controls=new OrbitControls(camera,renderer.domElement);
// Placement handlers reserve only unmodified left-clicks; camera gestures stay available.
controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
controls.mouseButtons.MIDDLE=THREE.MOUSE.ROTATE;
controls.maxPolarAngle=Math.PI*.48;controls.minDistance=.35;controls.maxDistance=500;controls.enableDamping=false;
controls.addEventListener('change',()=>dirtyFrame=true);
const lighting=createWorldLighting({scene,renderer,camera,controls,naturalMaterials,invalidate:()=>dirtyFrame=true});
const sunlight=lighting.sunlight;
const atmosphere=createAtmosphere(scene,naturalMaterials.rock,sunlight.uniforms);
const skyIllumination=createSkyIllumination(renderer,scene,atmosphere,()=>dirtyFrame=true);
lighting.mountQuality(document.querySelector("footer"));
window.addEventListener("pagehide",()=>{skyIllumination.dispose();lighting.dispose();},{once:true});
const landscapeFeatures=createLandscapeFeatures(scene);
const grassCover=createGroundCover(scene,()=>dirtyFrame=true,document.querySelector("footer"));
const stepSurfaces=createStepSurfaces(scene,naturalMaterials.terrain);
function updateLighting(light){
  grassCover.update(waterTime);
  return lighting.update(light,daylightControl.state,waterTime,world.size);
}
const geometry=new THREE.BufferGeometry(),positions=new Float32Array((N+1)**2*3),colors=new Float32Array(positions.length),indices=[];
for(let j=0;j<N;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+1,c=a+N+1,d=c+1;indices.push(a,c,b,b,c,d);}
geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setIndex(indices);
const land=new THREE.Mesh(geometry,naturalMaterials.terrain);scene.add(land);
land.receiveShadow=true;land.castShadow=true;
const scenery=new THREE.Group();scene.add(scenery);
function updateScenery(){
  grassCover.rebuild(world);
  renderer.shadowMap.needsUpdate=true;
  while(scenery.children.length){const child=scenery.children[0];scenery.remove(child);child.dispose();}
  let visible=0;const matrix=new THREE.Object3D();
  for(const kind of PLANT_IDS)for(let variant=0;variant<3;variant++){
    const list=world.objects.filter(o=>o.kind===kind&&specimenVariant(o.id)===variant&&heightAt(world,o.x,o.z)>.1);
    visible+=list.length;if(!list.length)continue;
    for(const part of flora.parts(kind,variant,floraDetail)){
      const mesh=new THREE.InstancedMesh(part.geometry,part.material,list.length);
      mesh.userData.walkThrough=!part.solid;
      mesh.castShadow=true;mesh.receiveShadow=true;
      list.forEach((o,i)=>{matrix.position.set(o.x,objectHeight(world,o),o.z);matrix.rotation.set(0,o.rotation,0);matrix.scale.setScalar(o.scale);matrix.updateMatrix();mesh.setMatrixAt(i,matrix.matrix);});
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();scenery.add(mesh);
    }
  }
  $('stats').textContent=`${world.size} m across · ${visible} scenery objects`;
  dirtyFrame=true;
}
function updateGroundPaint(){
  
  const paint=new Float32Array((N+1)**2*4);
  if(world.groundPaint)world.groundPaint.forEach((v,i)=>paint[i]=v/255);
  geometry.setAttribute('groundPaint',new THREE.BufferAttribute(paint,4));
  for(let group=0;group<2;group++){
    const extra=new Float32Array((N+1)**2*4);
    if(world.groundPaintExtra)for(let i=0;i<(N+1)**2;i++)for(let c=0;c<4;c++)extra[i*4+c]=world.groundPaintExtra[i*8+group*4+c]/255;
    geometry.setAttribute('groundExtra'+group,new THREE.BufferAttribute(extra,4));
  }
  dirtyFrame=true;
}
function rebuild(){


  updateGroundPaint();
  landscapeFeatures.rebuild(world);
  stepSurfaces.rebuild(world);
  naturalMaterials.setStyle(world.style);
  atmosphere.updateTerrain(world);
  const sand=new THREE.Color(world.style==='tropical'?0xdacf9c:0xc9bf94),grass=new THREE.Color(world.style==='tropical'?0x769950:world.style==='highland'?0x73816a:0x7e9561),stone=new THREE.Color(0x8f9188),c=new THREE.Color();
  for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){
    const k=j*(N+1)+i,x=(i/N-.5)*world.size,z=(j/N-.5)*world.size,h=world.heights[k];
    positions[k*3]=x;positions[k*3+1]=h;positions[k*3+2]=z;
    c.copy(sand).lerp(grass,clamp((h-.6)/2.4,0,1)).lerp(stone,clamp((slopeAt(world,x,z)-.35)*1.35,0,.92));
    if(h>25)c.lerp(new THREE.Color(0xc1c5b5),clamp((h-25)/25,0,.7));
    colors[k*3]=c.r;colors[k*3+1]=c.g;colors[k*3+2]=c.b;
  }
geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();updateScenery();dirtyFrame=true;
}

const flora=createFlora(naturalMaterials),floraDetail='far';
await stage('Building landscape…');
rebuild();
await stage('Building structures…');
for(const building of world.structures||[])scene.add(makeStructure(building,world.textures));
for(const column of world.columns||[]){
 const points=columnPositions(column),mesh=new THREE.InstancedMesh(columnGeometry(column.style,column.height,column.radius),buildingMaterial(column.material),points.length);
 mesh.castShadow=true;mesh.receiveShadow=true;
 points.forEach((p,i)=>mesh.setMatrixAt(i,new THREE.Matrix4().makeRotationY(column.rotation).setPosition(p.x,heightAt(world,p.x,p.z),p.z)));scene.add(mesh);
}
await stage('Building sculpted stone…');
if(world.rockSculpt?.length){const stone=naturalMaterials.rock.clone();stone.color.setHex(0xffffff);stone.vertexColors=true;weatherStone(stone,{neutralColor:true});const mesh=new THREE.Mesh(sculptGeometry(world.rockSculpt),stone);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);}
await stage('Connecting to the shared room…');
let viewWidth=0,viewHeight=0;
const resize=()=>{const rect=$('stage').getBoundingClientRect(),width=Math.floor(rect.width),height=Math.floor(rect.height);if(width<1||height<1||(width===viewWidth&&height===viewHeight))return;viewWidth=width;viewHeight=height;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();dirtyFrame=true;};
new ResizeObserver(resize).observe($('stage'));resize();
let previous=performance.now();
function render(now){if(!drawing)return;requestAnimationFrame(render);const delta=Math.min((now-previous)/1000,.1);previous=now;if(document.hidden)return;const drawn=graphics.frame(()=>{waterTime+=delta;const light=daylightControl.tick(delta);const rig=updateLighting(light);landscapeFeatures.update(waterTime);atmosphere.update(camera,waterTime,light,state);skyIllumination.update(light,daylightControl.state,rig);rig.applySky();renderer.render(scene,camera);dirtyFrame=false;});if(drawn&&$('loading')){$('loading').remove();status('You are in '+world.name+'.');}}
async function prepareGraphics(){
  await stage('Preparing the sky and landscape graphics…');
  const light=daylightControl.tick(0);updateLighting(light);atmosphere.update(camera,waterTime,light,state);
  // Wait on KHR_parallel_shader_compile before the first draw can make a
  // synchronous driver query. The room and loading UI remain responsive.
  await renderer.compileAsync(scene,camera);
  if(!drawing)return;
  previous=performance.now();requestAnimationFrame(render);
}
// The visitor owns live membership and movement; no editable draft is read here.
installVisitor({scene,camera,controls,canvas:renderer.domElement,world,id,arrival:published.arrival,status,invalidate:(shadows=false)=>{dirtyFrame=true;if(shadows)renderer.shadowMap.needsUpdate=true;},applyEnvironment:value=>Object.assign(state,value),onReady:()=>{prepareGraphics().catch(showError);},onError:showError}).catch(showError);
}
function showError(error){const message=error.message||String(error);$('loading-title')?.replaceChildren('Unable to enter this location');$('loading')?.querySelector('p')?.replaceChildren(message);status(message,true);}
start().catch(showError);
