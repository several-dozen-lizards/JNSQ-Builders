import * as THREE from './vendor/three.module.js';
import {heightAt,localPoint} from './terrain.mjs?caves=retired';
import {FINISHES,validateTextures} from './building-finishes.mjs';
import {ARCHITECTURES,styleDefaults} from './architecture.mjs';
import {installPoolControls,excavatePool} from './pools.mjs?caves=retired';
import {installPavilionControls} from './column-editor.mjs?caves=retired';
import {footprint,validateStructures,prepareSite,makeStructure,disposeStructure} from './structures.mjs?caves=retired';
import {OPENING_SHAPES} from './opening-shapes.mjs';
import {squareFootprintCorner} from './structures.mjs?caves=retired';
import {snapInteriorEndpoint,interiorSurfacePoint} from './interior-snap.mjs';
import {installComponentEditor} from './component-editor.mjs';
import {resizeStoreys,defaultOpeningShape} from './building-components.mjs';

export function installBuildingEditor({scene,world,remember,rebuild,changed,status,chooseTool,frameBuilding,onSelected=()=>{}}){
  let squareConstraint=false;
  const $=id=>document.getElementById(id),section=document.createElement('section');
  section.innerHTML=`<h2>04 / Build a home</h2><p>Mark opposite corners of a rectangle or the bounds of an oval. Walls include an entrance and open windows.</p>
  <label for="buildingShape">Footprint</label><select id="buildingShape"><option value="rectangle">Square / rectangular</option><option value="round">Round / oval</option></select>
  <button id="drawBuilding" class="wide">Mark structure edges</button>
  <label for="buildingList">Selected structure</label><select id="buildingList"><option value="">No structures yet</option></select>
  <div class="row"><div><label for="buildingWidth">Width (m)</label><input id="buildingWidth" type="number" min="10" max="40" step=".1" value="18"></div><div><label for="buildingDepth">Depth (m)</label><input id="buildingDepth" type="number" min="10" max="40" step=".1" value="18"></div></div>
  <div class="row"><div><label for="buildingFloors">Floors</label><select id="buildingFloors"><option>1</option><option>2</option><option>3</option><option>4</option></select></div><div><label for="buildingMaterial">Walls</label><select id="buildingMaterial"><option value="plaster">Lime plaster</option><option value="timber">Timber boards</option><option value="stone">Stone masonry</option></select></div></div>
  <label for="buildingRoof">Roof</label><select id="buildingRoof"><option value="auto">Automatic hip / cone</option><option value="flat">Flat roof</option><option value="none">No roof</option></select>
  <label for="buildingRotation">Rotation (degrees)</label><input id="buildingRotation" type="number" min="-360" max="360" step="15" value="0">
  <label><input id="buildingStairs" type="checkbox" checked> Add stairs between floors</label>
  <label><input id="buildingSite" type="checkbox" checked> Level site & clear scenery when placing or reshaping</label>
  <button id="applyBuilding" class="wide">Apply to selected structure</button><button id="frameBuilding" class="wide">Frame selected structure</button><div class="row"><button id="moveBuilding" class="wide">Move</button><button id="deleteBuilding" class="wide">Remove</button></div>
  <label for="buildingCutaway">Interior view</label><select id="buildingCutaway"><option value="all">Whole building</option><option value="0">Ground floor</option><option value="1">Through floor 2</option><option value="2">Through floor 3</option><option value="3">Through floor 4</option></select>
  <p id="buildingHint">Rectangles: 10–40 m per side. Round footprints: 14–40 m. Escape cancels placement. Cutaways only change the view.</p>`;
  document.querySelector('aside section:last-child').before(section);
  section.id='build-home';
  const pavilion=installPavilionControls(section);
  const pool=installPoolControls(section);
  const buildbar=document.createElement('div');buildbar.id='houseTools';buildbar.setAttribute('role','group');buildbar.setAttribute('aria-label','House building');
  buildbar.innerHTML='<button id="buildHouse" class="primary">Build house</button><button id="removeHouse">Remove a building</button><button id="houseSettings">House settings</button>';
  $('stage').before(buildbar);
  const barStyle=document.createElement('style');barStyle.textContent='#houseTools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;background:var(--panel);border-bottom:1px solid var(--line)}#houseTools label{margin:0;color:var(--gold)}#houseTools select{width:auto;flex:1;min-width:145px;max-width:290px}#houseTools button{white-space:nowrap}';document.head.append(barStyle);
  $('buildHouse').onclick=()=>$('drawBuilding').click();
  const editParts=document.createElement('button');editParts.textContent='Walls, doors & windows';buildbar.append(editParts);editParts.onclick=()=>document.getElementById('buildingComponents').scrollIntoView({block:'start'});
  $('houseSettings').onclick=()=>{section.scrollIntoView({block:'start'});$('buildingArchitecture').focus({preventScroll:true});};
  const architectureControls=document.createElement('div');architectureControls.innerHTML='<label for="buildingArchitecture">Architecture</label><select id="buildingArchitecture"></select><p id="architectureHint"></p><p><a href="./architecture-gallery.html" target="_blank" rel="noopener">Browse the 16 architectural styles ↗</a></p>';
  section.querySelector('label[for="buildingShape"]').before(architectureControls);
  $('buildingArchitecture').replaceChildren(...Object.entries(ARCHITECTURES).map(([id,a])=>new Option(a.name,id)));
  const styleHint=()=>{$('architectureHint').textContent=ARCHITECTURES[$('buildingArchitecture').value].description+' Choose a style for a new footprint or Apply to selected. Click an existing building to edit its finishes.';};styleHint();
  $('buildingArchitecture').onchange=()=>{const defaults=styleDefaults($('buildingArchitecture').value);for(const [key,id] of Object.entries({roof:'buildingRoof',material:'buildingMaterial',floorMaterial:'floorMaterial',roofMaterial:'roofMaterial',trimMaterial:'trimMaterial'}))$(id).value=defaults[key];$('openingFrames').checked=true;$('windowShape').value=defaultOpeningShape({architecture:$('buildingArchitecture').value});$('doorShape').value=defaultOpeningShape({architecture:$('buildingArchitecture').value},true);styleHint();};
  $('buildingRoof').options[0].textContent='Automatic / chosen architectural style';
  const finishes=document.createElement('div');finishes.innerHTML=`<label for="floorMaterial">Floor finish</label><select id="floorMaterial"></select><label for="roofMaterial">Roof finish</label><select id="roofMaterial"></select><label for="trimMaterial">Door & window frame finish</label><select id="trimMaterial"></select><label><input type="checkbox" id="openingFrames" checked> Frame doors and windows</label><label for="textureRepeat">Custom texture repeat (metres)</label><input type="number" id="textureRepeat" min=".25" max="12" step=".25" value="2"><label for="customSurface">Upload a custom surface</label><input id="customSurface" type="file" accept="image/png,image/jpeg,image/webp"><p>Recommended: seamless 1024 × 1024 JPG, PNG or WebP, with even lighting. Images repeat over the surface. Uploads are resized locally to at most 1024 pixels and compressed; four images per island, 10 MB per source. Images travel with saved/exported islands. Choose the uploaded image in a finish menu, then Apply.</p>`;
  $('buildingRoof').after(finishes);
  const wallLabel=section.querySelector('label[for="buildingMaterial"]'),wallMenu=$('buildingMaterial'),wallCell=wallLabel.parentElement;
  finishes.prepend(wallLabel,wallMenu);wallCell.remove();
  const applyFinishes=document.createElement('button');applyFinishes.id='applyFinishes';applyFinishes.className='wide';applyFinishes.textContent='Apply materials, frames & shapes';finishes.append(applyFinishes);
  applyFinishes.onclick=()=>{try{const b=current();if(!b)return;const next={...b,windowShape:$('windowShape').value,doorShape:$('doorShape').value,frames:$('openingFrames').checked,material:$('buildingMaterial').value,floorMaterial:$('floorMaterial').value,roofMaterial:$('roofMaterial').value,trimMaterial:$('trimMaterial').value,tileMetres:Number($('textureRepeat').value)};validateStructures([next],world().size);remember();Object.assign(b,next);rebuild();changed('Building materials & textures updated · Undo restores the previous finishes');}catch(e){status(e.message,true);}};
  const openingMenus=document.createElement('div');
  for(const [id,label] of [['windowShape','Window shape'],['doorShape','Doorway shape']]){
    const l=document.createElement('label');l.htmlFor=id;l.textContent=label;const s=document.createElement('select');s.id=id;
    s.replaceChildren(...OPENING_SHAPES.map(key=>new Option(({rectangle:'Rectangle',arched:'Arched',circle:'Circle',oval:'Oval',rounded:'Rounded rectangle',diamond:'Diamond',triangle:'Triangle',rhomboid:'Rhomboid'})[key],key)));openingMenus.append(l,s);
  }
  finishes.prepend(openingMenus);
  const interiors=document.createElement('div');interiors.innerHTML=`<label for="partitionFloor">Interior wall floor</label><select id="partitionFloor"><option value="0">Ground floor</option></select><label><input type="checkbox" id="partitionDoor" checked> Include a doorway</label><button id="drawPartition" class="wide">Draw interior wall</button><label for="partitionList">Interior walls</label><select id="partitionList"></select><button id="removePartition" class="wide">Remove selected interior wall</button><p>Choose a structure and floor, then click two endpoints inside it. Escape cancels. Doorways need at least 1.6 m of wall. Stairs and landings stay clear.</p>`;
  $('buildingCutaway').after(interiors);
  const partitionEdit=document.createElement('div');partitionEdit.innerHTML='<label for="partitionLeaf">Interior door</label><select id="partitionLeaf"><option value="none">No door leaf</option><option value="solid">Solid door</option></select><label for="partitionAngle">Door opening angle</label><input id="partitionAngle" type="number" min="0" max="120" step="15" value="0"><label><input id="partitionFrames" type="checkbox" checked> Doorframe</label><button id="applyPartition" class="wide">Update selected interior wall / doorway</button>';interiors.append(partitionEdit);const partitionFeedback=document.createElement('p');partitionFeedback.id='partitionFeedback';partitionFeedback.setAttribute('role','status');interiors.append(partitionFeedback);
  $('applyPartition').onclick=()=>{try{const b=current(),id=$('partitionList').value;if(!b||!id)return;const next={...b,partitions:b.partitions.map(p=>p.id===id?{...p,door:$('partitionDoor').checked,doorLeaf:$('partitionLeaf').value,doorAngle:Number($('partitionAngle').value),frames:$('partitionFrames').checked}:p)};validateStructures([next],world().size);remember();Object.assign(b,next);rebuild();changed('Interior wall and doorway updated · Undo available');}catch(e){status(e.message,true);}};
  $('partitionList').onchange=()=>{const p=current()?.partitions?.find(p=>p.id===$('partitionList').value);if(p){$('partitionDoor').checked=p.door;$('partitionLeaf').value=p.doorLeaf||'none';$('partitionAngle').value=p.doorAngle||0;$('partitionFrames').checked=p.frames!==false;}};

  const finishMenus=['buildingMaterial','floorMaterial','roofMaterial','trimMaterial'];
  function textureMenus(){for(const id of finishMenus){const old=$(id).value,fallback={floorMaterial:'timber',roofMaterial:'roof',trimMaterial:'timber'}[id]||'plaster';$(id).replaceChildren(...Object.entries(FINISHES).map(([key,name])=>new Option(name,key)),...(world().textures||[]).map(t=>new Option('Custom · '+t.name,t.id)));$(id).value=old||fallback;if(!$(id).value)$(id).value=fallback;}}
  textureMenus();
  const removeTexture=document.createElement('div');removeTexture.innerHTML='<label for="textureList">Uploaded surfaces</label><select id="textureList"></select><button id="deleteTexture" class="wide">Remove unused texture</button>';finishes.append(removeTexture);
  function textureList(){const selected=$('textureList').value;$('textureList').replaceChildren(...(world().textures||[]).map(t=>new Option(t.name,t.id)));if((world().textures||[]).some(t=>t.id===selected))$('textureList').value=selected;$('deleteTexture').disabled=!(world().textures||[]).length;}
  textureList();
  $('deleteTexture').onclick=()=>{const id=$('textureList').value;if(!id)return;if((world().structures||[]).some(b=>['material','floorMaterial','roofMaterial','trimMaterial'].some(k=>b[k]===id)||b.wallEdits?.some(w=>w.openings.some(o=>o.image===id)))){status('Choose another finish on buildings using this image, Apply, then remove it.',true);return;}remember();world().textures=world().textures.filter(t=>t.id!==id);textureMenus();textureList();changed('Unused custom texture removed');};
  $('customSurface').onchange=async()=>{
    const file=$('customSurface').files[0],target=world();if(!file)return;
    try{
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10000000)throw Error('Choose a JPG, PNG or WebP up to 10 MB.');
      if((target.textures||[]).length>=4)throw Error('This island already has four custom images.');
      const bitmap=await createImageBitmap(file);
      let data;try{const canvas=document.createElement('canvas'),scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#ddd';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);for(const quality of [.86,.72,.55,.35]){data=canvas.toDataURL('image/jpeg',quality);if(data.length<=250000)break;}}finally{bitmap.close();}
      if(world()!==target)throw Error('The island changed during upload. Please choose the image again.');
      const texture={id:'custom_'+crypto.randomUUID(),name:file.name.slice(0,80),data};validateTextures([...(target.textures||[]),texture]);remember();(target.textures??=[]).push(texture);textureMenus();textureList();changed('Custom texture added · choose it in a finish menu and Apply');
    }catch(e){status(e.message,true);}finally{$('customSurface').value='';}
  };
  const group=new THREE.Group();scene.add(group);
  const selectionBox=new THREE.BoxHelper(new THREE.Object3D(),0xffdc86);selectionBox.visible=false;scene.add(selectionBox);let showSelection=false;
  function highlightSelection(){const model=group.children.find(n=>n.userData.structureId===selected);selectionBox.visible=showSelection&&!!model;if(selectionBox.visible)selectionBox.setFromObject(model);}
  const preview=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffdc86,depthTest:false}));preview.renderOrder=11;preview.visible=false;scene.add(preview);
  let anchor=null,lastHover=null,selected='',mode=null,selectionSignature='';
const options=()=>({...pool.read(),...pavilion.read(),windowShape:$('windowShape').value,doorShape:$('doorShape').value,architecture:$('buildingArchitecture').value,floors:Number($('buildingFloors').value),roof:$('buildingRoof').value,material:$('buildingMaterial').value,floorMaterial:$('floorMaterial').value,roofMaterial:$('roofMaterial').value,trimMaterial:$('trimMaterial').value,frames:$('openingFrames').checked,tileMetres:Number($('textureRepeat').value),rotation:Number($('buildingRotation').value)*Math.PI/180,stairs:$('buildingStairs').checked});
  const current=()=>world().structures?.find(b=>b.id===selected);
  const components=installComponentEditor({section,current,world,status,showFloor:floor=>{$('buildingCutaway').value=String(floor);visibility();frameBuilding(current());},commit:(next,message)=>{validateStructures([next],world().size);remember();Object.assign(current(),next);rebuild();changed(message+' · Undo available');}});
  function select(){const b=current();if(!b)return;pavilion.select(b);pool.select(b);$('buildingArchitecture').value=b.architecture||'plain';styleHint();$('buildingShape').value=b.shape;$('buildingWidth').value=b.width.toFixed(2);$('buildingDepth').value=b.depth.toFixed(2);$('buildingFloors').value=b.floors;$('buildingRoof').value=b.roof;$('buildingMaterial').value=b.material;$('buildingRotation').value=Math.round(b.rotation*180/Math.PI);$('buildingStairs').checked=b.stairs;$('floorMaterial').value=b.floorMaterial||'timber';$('roofMaterial').value=b.roofMaterial||'roof';$('trimMaterial').value=b.trimMaterial||'timber';$('openingFrames').checked=b.frames!==false;$('textureRepeat').value=b.tileMetres||2;partitionMenus();components.refresh();}
  function partitionMenus(){const b=current(),floor=$('partitionFloor').value,part=$('partitionList').value;$('windowShape').value=b?defaultOpeningShape(b):'rectangle';$('doorShape').value=b?defaultOpeningShape(b,true):'rectangle';$('partitionFloor').replaceChildren(...Array.from({length:b?.floors||1},(_,i)=>new Option(i?'Floor '+(i+1):'Ground floor',i)));$('partitionFloor').value=Number(floor)<(b?.floors||1)?floor:'0';$('partitionList').replaceChildren(...(b?.partitions||[]).map((p,i)=>new Option(`${i+1}. Floor ${p.floor+1} · ${p.door?'doorway':'solid wall'}`,p.id)));if(b?.partitions?.some(p=>p.id===part))$('partitionList').value=part;$('removePartition').disabled=!b?.partitions?.length;$('applyPartition').disabled=!b?.partitions?.length;$('partitionList').onchange();}
  function visibility(){const value=$('buildingCutaway').value;for(const building of group.children)for(const mesh of building.children)mesh.visible=value==='all'||(!mesh.userData.roof&&mesh.userData.level<=Number(value));}
  function refresh(){
    textureMenus();textureList();
    while(group.children.length){const g=group.children[0];group.remove(g);disposeStructure(g);}
    const buildings=world().structures||[];for(const b of buildings){const model=makeStructure(b,world().textures);model.userData.structureId=b.id;group.add(model);}
    // null is an explicit deselection; rebuilding scenery must not undo it.
    if(selected!==null&&!buildings.some(b=>b.id===selected))selected=buildings[0]?.id||'';
    $('buildingList').replaceChildren(new Option(buildings.length?'No structure selected':'No structures yet',''),...buildings.map((b,i)=>new Option(`${i+1}. ${b.shape==='round'?'Round':'Rectangular'} · ${Math.round(b.width)} × ${Math.round(b.depth)} m · ${b.floors} floor${b.floors>1?'s':''}`,b.id)));$('buildingList').value=selected||'';
    selectionControls();
    partitionMenus();
    const signature=JSON.stringify(current());if(signature!==selectionSignature){select();selectionSignature=signature;}components.refresh();visibility();highlightSelection();
  }
  function cancel(){anchor=null;lastHover=null;mode=null;preview.visible=false;}
  function selectionControls(){for(const id of ['applyBuilding','applyFinishes','moveBuilding','deleteBuilding','frameBuilding','drawPartition','removeHouse'])$(id).disabled=!current();}
  function deselectBuilding(){if(selected===null)return;cancel();selected=null;selectionSignature=undefined;showSelection=false;$('buildingList').value='';selectionControls();partitionMenus();components.refresh();highlightSelection();partitionFeedback.textContent='Select a building to edit its interior walls.';status('Building deselected · click a building to select it.');}
  function start(value){cancel();mode=value;const hint=value==='move'?'Click the new centre for the selected structure.':'Mark opposite corners. Wheel rotates; Ctrl-wheel rotates finely; hold Shift for a square (or circle). Alt-wheel zooms.';chooseTool('build',hint+' Escape cancels.');status(hint);}
  $('drawBuilding').onclick=()=>start('draw');$('moveBuilding').onclick=()=>start('move');
  $('removeHouse').onclick=()=>{cancel();mode='remove';const hint='Click a building to remove it. Undo restores the whole structure. Escape cancels.';chooseTool('build',hint);status(hint);};
  $('drawPartition').onclick=()=>{if(!current())return;cancel();mode='partition';$('buildingCutaway').value=$('partitionFloor').value;visibility();frameBuilding(current());chooseTool('build','Click two interior wall endpoints. Escape cancels.');partitionFeedback.textContent='Click two endpoints on the floor. Hold Shift to align with this building’s walls.';status(partitionFeedback.textContent);};
  $('removePartition').onclick=()=>{const b=current(),id=$('partitionList').value;if(!b||!id)return;remember();b.partitions=b.partitions.filter(p=>p.id!==id);rebuild();changed('Interior wall removed · Undo restores it');};
  $('buildingList').onchange=()=>selectBuilding($('buildingList').value);
  function selectBuilding(id){if(!id){deselectBuilding();return;}if(!world().structures?.some(b=>b.id===id))return;cancel();selected=id;$('buildingList').value=id;selectionControls();select();selectionSignature=JSON.stringify(current());showSelection=true;highlightSelection();chooseTool('orbit');onSelected();status('Building selected · House settings includes interior walls, storeys, roof sections, windows, doors and glass. Undo restores changes.');}
  function pickStructure(ray){const meshes=[];group.traverseVisible(n=>{if(n.isMesh)meshes.push(n);});const hit=ray.intersectObjects(meshes,false)[0];if(!hit)return null;let node=hit.object;while(node.parent!==group)node=node.parent;return node.userData.structureId;}
  $('partitionFloor').onchange=()=>{cancel();chooseTool('orbit');};
  $('frameBuilding').onclick=()=>{if(current())frameBuilding(current());};
  $('buildingCutaway').onchange=()=>{visibility();rebuild(false);};
  function check(b){validateStructures([b],world().size);for(let i=0;i<32;i++){const a=i/32*Math.PI*2;let x,z;if(b.shape==='round'){x=Math.cos(a)*b.width/2;z=Math.sin(a)*b.depth/2;}else{const t=i%8/8,s=Math.floor(i/8);[x,z]=s===0?[-b.width/2+t*b.width,-b.depth/2]:s===1?[b.width/2,-b.depth/2+t*b.depth]:s===2?[b.width/2-t*b.width,b.depth/2]:[-b.width/2,b.depth/2-t*b.depth];}const c=Math.cos(b.rotation),s=Math.sin(b.rotation);if(heightAt(world(),b.x+c*x+s*z,b.z-s*x+c*z)<.1)throw Error('Place the whole footprint on dry land.');}}
  $('applyBuilding').onclick=()=>{try{const b=current();if(!b)return;const next={...resizeStoreys(b,Number($('buildingFloors').value)),...options(),shape:$('buildingShape').value,width:Number($('buildingWidth').value),depth:Number($('buildingDepth').value)};check(next);const reshaped=next.shape!==b.shape||next.width!==b.width||next.depth!==b.depth||next.rotation!==b.rotation;remember();Object.assign(b,next);if(reshaped&&$('buildingSite').checked)prepareSite(world(),b);excavatePool(world(),b);rebuild();changed('Structure updated');}catch(e){status(e.message,true);}};
  function removeStructure(id){if(!world().structures?.some(b=>b.id===id))return;remember();world().structures=world().structures.filter(b=>b.id!==id);cancel();refresh();chooseTool('orbit');changed('Structure removed · Undo restores it, including its floors and interior walls');}
  $('deleteBuilding').textContent='Remove selected structure';
  $('deleteBuilding').onclick=()=>removeStructure(selected);
  function hover(p,event={shiftKey:squareConstraint}){lastHover=p.clone();squareConstraint=!!event.shiftKey;if(anchor&&mode==='draw'&&squareConstraint)p=new THREE.Vector3().copy(squareFootprintCorner(anchor,p));if(!anchor)return;if(mode==='partition'){try{p=new THREE.Vector3().copy(interiorSurfacePoint(current(),p));}catch{}if(squareConstraint)p=new THREE.Vector3().copy(snapInteriorEndpoint(current(),anchor,p));preview.geometry.dispose();preview.geometry=new THREE.BufferGeometry().setFromPoints([anchor.clone().add(new THREE.Vector3(0,.15,0)),p.clone().add(new THREE.Vector3(0,.15,0))]);preview.visible=true;return;}if(mode!=='draw')return;const minX=Math.min(anchor.x,p.x),maxX=Math.max(anchor.x,p.x),minZ=Math.min(anchor.z,p.z),maxZ=Math.max(anchor.z,p.z),round=$('buildingShape').value==='round';const points=round?Array.from({length:64},(_,i)=>{const a=i/64*Math.PI*2,x=(minX+maxX)/2+Math.cos(a)*(maxX-minX)/2,z=(minZ+maxZ)/2+Math.sin(a)*(maxZ-minZ)/2;return new THREE.Vector3(x,0,z);}):[[minX,minZ],[maxX,minZ],[maxX,maxZ],[minX,maxZ]].map(([x,z])=>new THREE.Vector3(x,0,z));
    const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,angle=Number($('buildingRotation').value)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    for(const point of points){const x=point.x-cx,z=point.z-cz;point.x=cx+c*x+s*z;point.z=cz-s*x+c*z;point.y=heightAt(world(),point.x,point.z)+.3;}
    preview.geometry.dispose();preview.geometry=new THREE.BufferGeometry().setFromPoints(points);preview.visible=true;
  }
  function rotatePlacement(event){
    if(mode!=='draw'||event.altKey||!event.deltaY)return false;
    const degrees=Number($('buildingRotation').value)||0,step=event.ctrlKey?1:15;
    $('buildingRotation').value=((degrees+Math.sign(event.deltaY)*step+540)%360)-180;
    if(lastHover)hover(lastHover,event);
    status(`Footprint rotation: ${$('buildingRotation').value}° · Wheel rotates · Ctrl-wheel: fine · Shift: square · Alt-wheel: zoom`);
    return true;
  }
  function click(p,event={}){try{
    if(mode==='remove'){removeStructure(p.structureId);return;}
    if(mode==='partition'){const b=current();if(!b)return;p=new THREE.Vector3().copy(interiorSurfacePoint(b,p));if(!anchor){anchor=p.clone();partitionFeedback.textContent='Click the other endpoint. Hold Shift to align with this building’s walls.';status(partitionFeedback.textContent);return;}if(event.shiftKey)p=new THREE.Vector3().copy(snapInteriorEndpoint(b,anchor,p));const a=localPoint(b,anchor.x,anchor.z),c=localPoint(b,p.x,p.z),wall={id:crypto.randomUUID(),floor:Number($('partitionFloor').value),ax:a.x,az:a.z,bx:c.x,bz:c.z,door:$('partitionDoor').checked,doorLeaf:$('partitionLeaf').value,doorAngle:Number($('partitionAngle').value),frames:$('partitionFrames').checked};validateStructures([{...b,partitions:[...(b.partitions||[]),wall]}],world().size);remember();(b.partitions??=[]).push(wall);cancel();rebuild();partitionFeedback.textContent='Interior wall added. Draw another wall or select one below to edit.';changed('Interior wall added · Undo restores the previous layout');chooseTool('orbit');return;}
    if(mode==='move'){const b=current();if(!b)return;const next={...b,x:p.x,z:p.z,y:p.y+.12};check(next);remember();Object.assign(b,next);if($('buildingSite').checked)prepareSite(world(),b);excavatePool(world(),b);cancel();rebuild();changed('Structure moved · Undo restores its previous site');chooseTool('orbit');return;}
    if(mode!=='draw')return;
    if(!anchor){if(p.y<.1)throw Error('Start on dry land.');anchor=p.clone();status('Now click the opposite footprint corner. Escape cancels.');return;}
    if((world().structures||[]).length>=80)throw Error('This island has reached its 80-structure limit.');
    const b=footprint(anchor,event.shiftKey?squareFootprintCorner(anchor,p):p,$('buildingShape').value,options());b.y=heightAt(world(),b.x,b.z)+.12;check(b);remember();(world().structures??=[]).push(b);selected=b.id;
    if($('buildingSite').checked)prepareSite(world(),b);excavatePool(world(),b);cancel();rebuild();select();changed('Home built · select it below to change floors, stairs or roof');chooseTool('orbit');
  }catch(e){if(mode==='partition')partitionFeedback.textContent=e.message+' Move the endpoint and click again, or press Escape to restart.';status(e.message,true);}}
  refresh();return {pickStructure,selectBuilding,refresh,cancel,hover,click,rotatePlacement,updateConstraint(shiftKey){squareConstraint=shiftKey;if((mode==='draw'||mode==='partition')&&lastHover){hover(lastHover,{shiftKey});return true;}return false;},surfaceHit:ray=>{
    if(mode==='remove'){
      const meshes=[];group.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});
      const hit=ray.intersectObjects(meshes,false)[0];if(!hit)return null;
      let model=hit.object;while(model.parent!==group)model=model.parent;
      return Object.assign(hit.point,{structureId:model.userData.structureId});
    }
    let y;if(mode==='partition'&&current())y=current().y+Number($('partitionFloor').value)*3.2;if(y===undefined)return undefined;return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),new THREE.Vector3());}};
}
