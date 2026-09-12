import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {normalizeImportedLights} from './imported-lighting.mjs';
import {wheelTransform} from './furniture-gestures.mjs';
import {furnitureGallery} from './furniture-gallery.mjs';
import {OBJECT_TYPES,filterObjects,chooseImportTypes} from './object-types.mjs';
import {teleporterModel,teleporterRecord} from './teleporter-model.mjs';

export async function request(url, body){
  const response=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value=await response.json();if(!response.ok||value.error)throw Error(value.error||`Request failed (${response.status})`);return value;
}
export function validateFurniture(objects={}){
  if(!objects||Array.isArray(objects)||typeof objects!=='object'||Object.keys(objects).length>1000)throw Error('Invalid furniture collection');
  for(const [id,o] of Object.entries(objects)){
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(id)||!o||typeof o.name!=='string'||!Array.isArray(o.position_m)||o.position_m.length!==2||![...o.position_m,o.size_m,o.rot_deg,o.y_off_m].every(Number.isFinite)||o.size_m<.02||o.size_m>240)throw Error('Invalid furniture: '+id);
  }
  for(const o of Object.values(objects)){const l=o.light_settings;if(l!=null){if(!/^#[0-9a-f]{6}$/i.test(l.color))throw Error('Invalid light colour');for(const [k,lo,hi] of [['intensity',0,100],['range_m',.2,30],['height_m',0,30]])if(!Number.isFinite(l[k])||l[k]<lo||l[k]>hi)throw Error('Invalid light '+k);}if(o.power!==undefined&&(!Number.isFinite(o.power)||o.power<0||o.power>1))throw Error('Invalid light power');}
  return objects;
}

// The same x/up/-y coordinates and largest-horizontal-extent fitting as Godot.
export function furnitureLayer({scene,invalidate=()=>{},status=()=>{},ground=()=>0}){
  const group=new THREE.Group();group.name='JNSQ furniture';scene.add(group);
  const entries=new Map(),cache=new Map(),loader=new GLTFLoader();let files=[];
  const reloadCatalog=()=>request('/api/room-workshop/catalog').then(c=>{files=c.files;return c;});
  const ready=reloadCatalog().catch(e=>{status(e.message,true);return {files:[],items:[]};});
  async function model(oid,o){
    if(o.kind==='local_light')return new THREE.Mesh(new THREE.SphereGeometry(.1,12,8),new THREE.MeshBasicMaterial({color:0xffdfad,wireframe:true}));
    if(o.capability==='portal')return teleporterModel();
    await ready;
    const filename=[oid,o.kind].filter(Boolean).flatMap(k=>['glb','png','jpg','jpeg'].map(ext=>k+'.'+ext)).find(f=>files.includes(f));
    if(!filename)return null;
    if(!cache.has(filename))cache.set(filename,(async()=>{
      const url='/api/room-workshop/assets/objects/'+encodeURIComponent(filename);
      if(filename.endsWith('.glb'))return normalizeImportedLights((await loader.loadAsync(url)).scene);
      const texture=await new THREE.TextureLoader().loadAsync(url);texture.colorSpace=THREE.SRGBColorSpace;
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,texture.image.height/texture.image.width),new THREE.MeshStandardMaterial({map:texture,side:THREE.DoubleSide}));return mesh;
    })());
    return (await cache.get(filename)).clone(true);
  }
  function place(objects){
    const done=new Set();
    function one(id,chain=new Set()){
      const e=entries.get(id),o=objects[id];if(!e||!o||done.has(id)||chain.has(id))return;chain.add(id);
      let y=o.support_surface==='free'?0:ground(o.position_m[0],-o.position_m[1],o.support_surface);
      if(o.support_surface==='object'&&entries.has(o.support_oid)){
        one(o.support_oid,chain);const parent=entries.get(o.support_oid);y=parent.root.position.y+parent.height;
      }
      e.root.position.set(o.position_m[0],y+o.y_off_m,-o.position_m[1]);e.root.rotation.y=o.rot_deg*Math.PI/180;
      const size=o.size_m/e.extent;e.visual.scale.setScalar(size);e.visual.position.set(-e.center.x*size,-e.minY*size,-e.center.z*size);e.height=e.rawHeight*size;done.add(id);
      if(o.capability==='light'||o.light_settings){
        if(!e.light){e.light=new THREE.PointLight(0xffdfad);e.root.add(e.light);}
        const l=o.light_settings||{};
        e.light.position.y=l.height_m??e.height*.8;e.light.color.set(l.color||'#ffdfad');e.light.intensity=Math.max(0,Math.min(1,o.power||0))*(l.intensity??12);e.light.distance=l.range_m??4;e.light.decay=2;
        e.visual.visible=o.kind!=='local_light'||!!group.userData.editor;
      }else if(e.light){e.root.remove(e.light);e.light=null;}
    }
    for(const id of entries.keys())one(id);invalidate();
  }
  let latest={};
  function sync(objects={}){
    latest=objects;
    for(const [id,e] of entries)if(!objects[id]){group.remove(e.root);entries.delete(id);}
    for(const [id,o] of Object.entries(objects)){
      const old=entries.get(id);if(old&&old.kind===o.kind)continue;
      if(old){group.remove(old.root);entries.delete(id);}
      const root=new THREE.Group(),visual=new THREE.Mesh(new THREE.BoxGeometry(1,.65,1),new THREE.MeshStandardMaterial({color:0xb89d75,roughness:.8}));
      root.add(visual);root.userData.furnitureId=id;group.add(root);
      const e={root,visual,kind:o.kind,extent:1,center:new THREE.Vector3(),minY:-.325,rawHeight:.65,height:.65};entries.set(id,e);
      model(id,o).then(loaded=>{
        if(!loaded||entries.get(id)!==e)return;
        const box=new THREE.Box3().setFromObject(loaded),extent=box.getSize(new THREE.Vector3());
        if(Math.max(extent.x,extent.z)<.0001)return;
        root.remove(e.visual);e.visual.geometry?.dispose();e.visual.material?.dispose();root.add(loaded);
        loaded.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
        Object.assign(e,{visual:loaded,extent:Math.max(extent.x,extent.z),center:box.getCenter(new THREE.Vector3()),minY:box.min.y,rawHeight:extent.y});place(latest);
      }).catch(()=>status(o.name+': model could not load; a labelled placeholder remains selectable.',true));
    }
    place(objects);
  }
  function pick(ray){for(const hit of ray.intersectObject(group,true)){let n=hit.object;while(n&&n!==group){if(n.userData.furnitureId)return n.userData.furnitureId;n=n.parent;}}return null;}
  return {group,entries,ready,sync,pick,reloadCatalog};
}

export function installFurnitureEditor({scene,camera,canvas,controls,panel,objects,commit,status,invalidate,ground=()=>0,activate=()=>{},isActive=()=>true}){
  const hiddenStyle=document.createElement('style');hiddenStyle.textContent='[hidden]{display:none!important}';document.head.append(hiddenStyle);
  const layer=furnitureLayer({scene,invalidate,status,ground});let selected=null,moving=false,catalog=[];
  layer.group.userData.editor=true;
  const highlight=new THREE.BoxHelper(new THREE.Object3D(),0xffdc88);highlight.visible=false;scene.add(highlight);
  panel.innerHTML=`<h2>Furniture & objects</h2><p>Drag an object to move it. Wheel rotates the selection; Shift-wheel adjusts height; Ctrl-wheel adjusts size. Escape clears selection so the wheel zooms again. Middle-drag orbits; right-drag pans.</p>
    <label>Find a model<input data-f="search" placeholder="Chair, lamp, desk…"></label><select data-f="catalog" aria-label="Object model"></select><button data-f="add">Add object</button><button data-f="importModel">Import model / picture</button><input data-f="modelFile" type="file" accept=".glb,.png,.jpg,.jpeg" hidden>
    <label>Objects in this world<select data-f="selection"><option value="">Select an object</option></select></label>
    <div data-f="fields" hidden><strong data-f="title"></strong><p data-f="meaning"></p>
    <div data-f="newMeaning"><label>Name<input data-f="name" maxlength="160"></label><label>Description<input data-f="description" maxlength="4000"></label><label>Use<select data-f="capability"><option value="">Ordinary physical object</option><option value="sitting">Seat</option><option value="writing">Shared writing desk</option><option value="private_writing">Private writing desk</option><option value="light">Switchable light</option><option value="portal">Teleporter</option></select></label><label>Owner (optional)<input data-f="owner" maxlength="100"></label></div>
    <div class="furniture-grid"><label>X (m)<input data-f="x" type="number" step=".1"></label><label>Z (m)<input data-f="z" type="number" step=".1"></label><label>Height offset (m)<input data-f="height" type="number" step=".05"></label><label>Rotation (°)<input data-f="rotation" type="number" step="5"></label><label>Size (m)<input data-f="size" type="number" min=".02" max="6" step=".05"></label><label>Support<select data-f="support"><option value="yurt_floor">Room floor</option><option value="island_ground">Ground below</option><option value="yurt_wall">Wall</option><option value="object">Another object</option><option value="free">Absolute height</option></select></label></div>
    <fieldset data-f="lighting" hidden><legend>Light</legend><label>On<input data-f="lightOn" type="checkbox"></label><label>Brightness<input data-f="lightIntensity" type="number" min="0" max="100" step="1"></label><label>Colour<input data-f="lightColor" type="color"></label><label>Reach (m)<input data-f="lightRange" type="number" min=".2" max="30" step=".1"></label><label>Bulb height above base (m)<input data-f="lightHeight" type="number" min="0" max="30" step=".05"></label></fieldset>
    <label data-f="parentLabel">Supporting object<select data-f="parent"></select></label>
    <button data-f="move">Place in view</button><button data-f="focus">Frame object</button><button data-f="duplicate">Duplicate</button><button data-f="remove" title="Remove selected object (Delete)">Remove</button></div>`;
  const $=key=>panel.querySelector(`[data-f="${key}"]`);
  const enableLight=document.createElement('button');enableLight.textContent='Make this object cast light';$('lighting').before(enableLight);
  enableLight.onclick=()=>change(next=>{const o=next[selected];o.power=1;o.light_settings={color:'#ffdfad',intensity:12,range_m:4,height_m:Number(((layer.entries.get(selected)?.height||0)*.8).toFixed(2))};},'Object lighting enabled');
  const addLight=document.createElement('button');addLight.textContent='Add local light';$('add').after(addLight);
  addLight.onclick=()=>{const id=freshId(),p=controls.target;change(next=>{next[id]={id,name:'Local light',kind:'local_light',position_m:[p.x,-p.z],size_m:.2,rot_deg:0,y_off_m:1,support_surface:'island_ground',support_oid:null,description:'Localized light',texture:'neutral',mass_kg:1,affordances:{},capability:'light',owner:null,power:1,light_settings:{color:'#ffdfad',intensity:12,range_m:4,height_m:0}};},'Local light added to draft');select(id);$('move').click();};
  const addTeleporter=document.createElement('button');addTeleporter.textContent='Add teleporter';$('add').after(addTeleporter);
  addTeleporter.onclick=()=>{const id=freshId(),p=controls.target;change(next=>{next[id]=teleporterRecord(id,p.x,p.z);},'Teleporter added to draft');select(id);$('move').click();};
  const previewBox=document.createElement('div');previewBox.className='furniture-preview';$('catalog').after(previewBox);
  const modelPreview=furnitureGallery(previewBox,filename=>{$('catalog').value=filename;showPreview();});
  $('catalog').hidden=true;
  const previewStyle=document.createElement('style');previewStyle.textContent='.furniture-preview{height:190px;min-width:0;border:1px solid #425b5b;border-radius:7px;overflow:hidden;margin:8px 0}.furniture-preview canvas{display:block;width:100%;touch-action:none}.furniture-preview p{height:24px;margin:3px 6px!important;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';document.head.append(previewStyle);
  const galleryStyle=document.createElement('style');galleryStyle.textContent='.furniture-gallery{display:flex;gap:8px;overflow-x:auto!important;overflow-y:hidden!important;scroll-snap-type:x proximity;padding:4px;box-sizing:border-box}.furniture-gallery button{flex:0 0 120px;display:flex;flex-direction:column;justify-content:space-between;align-items:center;min-width:0;height:100%;padding:5px;scroll-snap-align:start}.furniture-gallery img{width:100%;height:calc(100% - 38px);object-fit:contain;min-height:0}.furniture-gallery span{font-size:11px;line-height:14px;min-height:28px}.furniture-gallery small{margin:auto;font-size:10px}.furniture-gallery button[aria-pressed=true]{outline:2px solid #edcf8a;outline-offset:-2px;background:#3c5145;color:#edf2e9}#ribbon-panel-furniture>.furniture-gallery{flex:1 0 300px!important}#ribbon-panel-furniture>.furniture-placement{flex:0 0 280px!important}';document.head.append(galleryStyle);
  const showPreview=()=>modelPreview.select($('catalog').value);
  $('catalog').onchange=showPreview;
  function updateBox(){const e=layer.entries.get(selected);highlight.visible=!!e;if(e)highlight.setFromObject(e.root);invalidate();}
  function refresh(){
    layer.sync(objects());const list=$('selection');list.replaceChildren(new Option('Select an object',''),...Object.entries(objects()).map(([id,o])=>new Option(o.name,id)));list.value=selected||'';
    const o=objects()[selected];$('fields').hidden=!o;if(!o){selected=null;updateBox();return;}
    $('title').textContent=o.name;$('meaning').textContent=[o.capability?'Use: '+o.capability.replaceAll('_',' '):'Physical object',o.owner?'Owner: '+o.owner:'',o.description||''].filter(Boolean).join(' · ');
    $('newMeaning').hidden='pages' in o;
    $('lighting').hidden=o.capability!=='light'&&!o.light_settings;enableLight.hidden=!$('lighting').hidden;const l=o.light_settings||{};
    $('lightOn').checked=(o.power||0)>0;$('lightIntensity').value=l.intensity??12;$('lightColor').value=l.color||'#ffdfad';$('lightRange').value=l.range_m??4;$('lightHeight').value=l.height_m??Number(((layer.entries.get(selected)?.height||0)*.8).toFixed(2));
    for(const k of ['name','description','capability','owner'])$(k).value=o[k]||'';
    for(const [k,v] of Object.entries({x:o.position_m[0],z:-o.position_m[1],height:o.y_off_m,rotation:o.rot_deg,size:o.size_m,support:o.support_surface||'yurt_floor'}))$(k).value=typeof v==='number'?Number(v.toFixed(4)):v;
    $('parent').replaceChildren(new Option('Choose support',''),...Object.entries(objects()).filter(([id])=>id!==selected).map(([id,o])=>new Option(o.name,id)));$('parent').value=o.support_oid||'';
    $('parentLabel').hidden=o.support_surface!=='object';
    const locked=false;for(const input of $('fields').querySelectorAll('input,select,button'))input.disabled=false;
    $('remove').disabled=locked||!!o.owner||(Array.isArray(o.pages)&&o.pages.length>0)||['private_writing','commons_board'].includes(o.capability);updateBox();
  }
  function change(mutator,message){const next=structuredClone(objects());mutator(next);validateFurniture(next);commit(next,message);refresh();}
  // Deselecting is also triggered by empty-ground clicks and Escape in other
  // tools. Only a deliberate, valid object selection should open this panel.
  function select(id){selected=id&&objects()[id]?id:null;moving=false;if(selected)activate();refresh();}
  $('selection').onchange=()=>select($('selection').value);
  for(const k of ['lightOn','lightIntensity','lightColor','lightRange','lightHeight'])$(k).onchange=()=>{try{change(next=>{const o=next[selected];o.power=$('lightOn').checked?1:0;o.light_settings={color:$('lightColor').value,intensity:Number($('lightIntensity').value),range_m:Number($('lightRange').value),height_m:Number($('lightHeight').value)};},'Light changed');}catch(e){status(e.message,true);refresh();}};
  for(const k of ['name','description','capability','owner'])$(k).onchange=()=>{try{change(next=>{next[selected][k]=$(k).value||(['owner','capability'].includes(k)?null:'');if(k==='capability'&&next[selected][k]==='light')next[selected].power=1;},'Object details changed');}catch(e){status(e.message,true);refresh();}};
  for(const k of ['x','z','height','rotation','size','support','parent'])$(k).onchange=()=>{try{change(next=>{const o=next[selected];if(k==='x')o.position_m[0]=Number($(k).value);else if(k==='z')o.position_m[1]=-Number($(k).value);else if(k==='height')o.y_off_m=Number($(k).value);else if(k==='rotation')o.rot_deg=Number($(k).value);else if(k==='size')o.size_m=Number($(k).value);else if(k==='support'){o.support_surface=$(k).value;o.support_oid=o.support_surface==='object'?$('parent').value||null:null;}else o.support_oid=$(k).value||null;},'Object placement changed');}catch(e){status(e.message,true);refresh();}};
  $('move').onclick=()=>{activate();moving=!moving;$('move').textContent=moving?'Click a surface…':'Place in view';status('Click a floor or supporting surface to place '+objects()[selected].name+'. Escape cancels.');};
  $('focus').onclick=()=>{const e=layer.entries.get(selected);if(!e)return;const span=Math.max(2,objects()[selected].size_m*2);controls.target.copy(e.root.position).add(new THREE.Vector3(0,e.height/2,0));camera.position.copy(controls.target).add(new THREE.Vector3(span,span*.7,span));controls.update();invalidate();};
  function freshId(){return 'object_'+crypto.randomUUID().replaceAll('-','');}
  $('duplicate').onclick=()=>{const id=freshId();change(next=>{const o=structuredClone(next[selected]);o.name+=' copy';o.id=id;o.capability=['portal','light'].includes(o.capability)?o.capability:null;o.owner=null;delete o.pages;o.position_m[0]+=.3;next[id]=o;},'Object duplicated');select(id);};
  $('remove').onclick=()=>{try{change(next=>{for(const o of Object.values(next))if(o.support_oid===selected)throw Error('Move supported objects off this object before removing it.');delete next[selected];},'Object removed from draft');}catch(e){status(e.message,true);}};
  let activeType='all',multiCategoryImport=false;
  const typesBar=document.createElement('div');typesBar.className='object-type-filters';typesBar.setAttribute('role','group');typesBar.setAttribute('aria-label','Filter objects by type');$('catalog').before(typesBar);
  for(const type of [{id:'all',label:'All'},...OBJECT_TYPES]){const b=document.createElement('button');b.type='button';b.textContent=type.label;b.dataset.objectType=type.id;b.onclick=()=>{activeType=type.id;filter();};typesBar.append(b);}
  const typeStyle=document.createElement('style');typeStyle.textContent='.object-type-filters{display:flex;flex-wrap:wrap;gap:3px;margin:6px 0}.object-type-filters button{font-size:11px!important;padding:4px 6px!important;margin:0!important}';document.head.append(typeStyle);
  function filter(){const previous=$('catalog').value,items=filterObjects(catalog,activeType,$('search').value);$('catalog').replaceChildren(...items.map(i=>new Option(i.display_name,i.filename)));if(items.some(i=>i.filename===previous))$('catalog').value=previous;for(const b of typesBar.children)b.setAttribute('aria-pressed',String(b.dataset.objectType===activeType));$('add').disabled=!items.length;modelPreview.show(items,$('catalog').value);}
  layer.ready.then(value=>{catalog=value.items;multiCategoryImport=value.multi_category_import===true;filter();});$('search').oninput=filter;
  $('importModel').onclick=()=>$('modelFile').click();$('modelFile').onchange=async()=>{
    const file=$('modelFile').files[0];if(!file)return;$('importModel').disabled=true;
    try{
      if(file.size>160*1024*1024)throw Error('Choose a model smaller than 160 MB');
      if(!multiCategoryImport)throw Error('Restart this world-builder server to enable imports with object types. Your file has not been imported.');
      const categories=await chooseImportTypes(file);if(categories===null)return;
      status('Importing '+file.name+'…');
      const response=await fetch('/api/room-workshop/import-model',{method:'POST',headers:{'x-jnsq-filename':encodeURIComponent(file.name),'x-jnsq-categories':JSON.stringify(categories)},body:file}),result=await response.json();
      if(!response.ok)throw Error(result.error||'Model import failed');
      catalog=(await layer.reloadCatalog()).items;$('search').value='';activeType='all';filter();$('catalog').value=result.filename;showPreview();status('Model and object types imported into the local catalog. Add object to place it.');
    }catch(e){status(e.message,true);}finally{$('modelFile').value='';$('importModel').disabled=false;}
  };
  $('add').onclick=()=>{try{const item=catalog.find(i=>i.filename===$('catalog').value);if(!item)throw Error('Choose an object model first');const id=freshId(),p=controls.target;
    change(next=>{next[id]={id,name:item.display_name,kind:item.kind,position_m:[p.x,-p.z],size_m:item.size_m,rot_deg:0,y_off_m:0,support_surface:'island_ground',support_oid:null,description:'',texture:'neutral',mass_kg:1,affordances:{},capability:item.capability||(item.category==='seating'?'sitting':/(lamp|lightbulb|lantern|light_socket)/i.test(item.kind)?'light':null),power:1,owner:null};},'Object added to draft');select(id);$('move').click();
  }catch(e){status(e.message,true);}};
  const ray=new THREE.Raycaster();
  let drag=null,wheelEdit=null,wheelEnd=null;
  function aim(e){const rect=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);}
  function preview(next){layer.sync(next);updateBox();}
  function finishWheel(){
    clearTimeout(wheelEnd);if(!wheelEdit)return;
    const next=wheelEdit;wheelEdit=null;commit(next,'Object adjusted with wheel');refresh();
  }
  // A wheel has no native end event: settle once scrolling has gone idle.
  document.addEventListener('pointerdown',finishWheel,true);
  document.addEventListener('keydown',finishWheel,true);
  window.addEventListener('blur',finishWheel);
  canvas.addEventListener('pointerleave',finishWheel);
  function finishDrag(cancel=false){
    if(!drag)return;const gesture=drag;drag=null;
    if(canvas.hasPointerCapture(gesture.pointer))canvas.releasePointerCapture(gesture.pointer);
    if(!cancel&&gesture.changed)commit(gesture.next,'Object moved by dragging');
    refresh();
  }
  canvas.addEventListener('wheel',e=>{
    if(!selected||!isActive()||e.altKey||panel.closest('[inert]')||document.querySelector('dialog[open]'))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(drag)return;
    const next=wheelEdit||structuredClone(objects()),o=next[selected];if(!o)return;
    if(!wheelTransform(o,e,canvas.clientHeight))return;
    wheelEdit=next;preview(next);status(e.ctrlKey||e.metaKey?'Resizing object…':e.shiftKey?'Adjusting object height…':'Rotating object…');
    clearTimeout(wheelEnd);wheelEnd=setTimeout(finishWheel,250);
  },{capture:true,passive:false});
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.altKey||!isActive())return;
    aim(e);
    if(!moving){const id=layer.pick(ray);if(id){
      e.stopImmediatePropagation();e.preventDefault();select(id);canvas.focus();
      const entry=layer.entries.get(id),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-entry.root.position.y),start=ray.ray.intersectPlane(plane,new THREE.Vector3());
      if(start){drag={pointer:e.pointerId,plane,start:start.clone(),origin:entry.root.position.clone(),next:structuredClone(objects()),changed:false};canvas.setPointerCapture(e.pointerId);}
    }else select(null);return;}
    e.stopImmediatePropagation();e.preventDefault();
    const hits=ray.intersectObjects(scene.children,true).filter(h=>{if(!h.object.isMesh||h.object.material?.transparent)return false;let n=h.object;while(n){if(n===highlight||n.userData.furnitureId===selected)return false;n=n.parent;}return true;});
    const hit=hits[0];if(!hit)return;
    let n=hit.object,parent=null;while(n){if(n.userData.furnitureId){parent=n.userData.furnitureId;break;}n=n.parent;}
    change(next=>{const o=next[selected];o.position_m=[hit.point.x,-hit.point.z];o.support_surface='free';o.support_oid=null;o.y_off_m=hit.point.y;
      if(parent){o.support_surface='object';o.support_oid=parent;o.y_off_m=0;}
      if(o.kind==='local_light')o.y_off_m+=1;
    },'Object placed on surface');moving=false;$('move').textContent='Place in view';
  },true);
  canvas.tabIndex=0;
  canvas.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.pointer)return;e.preventDefault();e.stopImmediatePropagation();aim(e);
    const hit=ray.ray.intersectPlane(drag.plane,new THREE.Vector3());if(!hit)return;
    const shift=hit.sub(drag.start);if(shift.lengthSq()<1e-8)return;
    const o=drag.next[selected];o.position_m=[drag.origin.x+shift.x,-(drag.origin.z+shift.z)];
    // Keep floor-relative height; detach a carried object from its former support.
    if(o.support_surface==='object'){o.support_surface='free';o.support_oid=null;o.y_off_m=drag.origin.y;}
    drag.changed=true;preview(drag.next);
  },true);
  canvas.addEventListener('pointerup',e=>{if(drag&&e.pointerId===drag.pointer){e.stopImmediatePropagation();finishDrag();}},true);
  canvas.addEventListener('pointercancel',()=>finishDrag(true),true);
  canvas.addEventListener('lostpointercapture',()=>finishDrag(true));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){finishDrag(true);select(null);moving=false;$('move').textContent='Place in view';}
    if(e.key!=='Delete'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||!selected||!isActive())return;
    if(e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')||panel.closest('[inert]')||document.querySelector('dialog[open]'))return;
    e.preventDefault();
    if($('remove').disabled){status('This object is protected from removal.',true);return;}
    moving=false;$('move').textContent='Place in view';$('remove').click();
  });
  return {refresh,layer,select,updateBox,get primaryActionActive(){return moving||!panel.hidden;}};
}

