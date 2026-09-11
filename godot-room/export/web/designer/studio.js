/* Product layer shared by the visible designer and its downloadable package. */
const APPEARANCE_DEFAULT={skin_sheen:0,iris_lightness:.5,eye_style:'original',pupil_shape:'round',pupil_width:.5,pupil_height:.5,iris_size:.5,eye_accent:'#8eefff',hair_lightness:.7,hair_highlight_color:'#d9b878',hair_highlight_amount:0,hair_highlight_pattern:'fine',skin:'#ffffff',hair:'#ffffff',eyes:'#ffffff',iris:'#ffffff',iris_inner:'#ffffff',skin_texture:'',eye_texture:'404c3124d841bd39938e19692c2e54b2130d572c8c6beefd973eede94f0e1b75',eye_shading:.65,outfit:'#ffffff',outfit_top:'#ffffff',outfit_bottom:'#ffffff',hairstyle:'short01',eyebrows:'eyebrow001',beard:'none'};
let appearanceState={...APPEARANCE_DEFAULT},comparison=null,comparing=false,libraryState=null;
let editPast=[],editFuture=[],editLast=null,saveBusy=false;
function studioCommand(command,value,extra={}){const f=$('previewFrame').contentWindow?.jnsqStudio;if(typeof f==='function')f(JSON.stringify({command,value,...extra}));}
function readAppearance(){return {...appearanceState};}
let appearanceRequest=0;
async function sendAppearance(values,identity=readHumanMorphs()){const request=++appearanceRequest;try{const value=await resolvedAppearance(values,activeCandidate,identity);if(request===appearanceRequest)studioCommand('appearance',value);}catch(error){studioStatus(error.message,true);}}
function appearancePreview(){return sendAppearance(readAppearance());}
const morphPreviewWithoutFoldShading=applyHumanMorphPreview;
let lastPreviewFold=null;
applyHumanMorphPreview=function(){
  morphPreviewWithoutFoldShading();
  const fold=readHumanMorphs().nasolabial_definition??.5;
  if(humanPreviewReady&&fold!==lastPreviewFold){lastPreviewFold=fold;appearancePreview();}
};
function stateNow(){return {identity:readHumanMorphs(),appearance:readAppearance()};}
function invalidateDownload(){if(avatarDownloadURL){URL.revokeObjectURL(avatarDownloadURL);avatarDownloadURL=null;}$('studioDownload').replaceChildren();}
function markEdit(){studioDirty=true;invalidateDownload();studioStatus('Unsaved changes');}
function historyButtons(){$('humanUndo').disabled=!editPast.length;$('humanRedo').disabled=!editFuture.length;}
function commitEdit(){if(comparing){comparing=false;$('compareToggle').textContent='Show before';$('compareToggle').setAttribute('aria-pressed','false');applyHumanMorphPreview();appearancePreview();}const now=stateNow();if(editLast&&JSON.stringify(now)!==JSON.stringify(editLast)){editPast.push(clone(editLast));editFuture=[];markEdit();}editLast=clone(now);historyButtons();}
const oldReadBuilder=readBuilder;
readBuilder=function(){return {...oldReadBuilder(),appearance:readAppearance()};};
const oldWriteBuilder=writeBuilder;
writeBuilder=function(recipe,commit=true){appearanceState={...APPEARANCE_DEFAULT,...recipe.appearance};oldWriteBuilder(recipe,commit);paintAppearance();for(const select of document.querySelectorAll('#facePreset,#shapePreset,[data-feature-preset]'))select.value='';};
const oldRestoreHuman=restoreHuman;
function restoreState(value){appearanceState={...APPEARANCE_DEFAULT,...value.appearance};oldRestoreHuman(value.identity||{});paintAppearance();appearancePreview();editLast=stateNow();markEdit();historyButtons();}
rememberHumanChange=commitEdit;
$('humanUndo').onclick=()=>{if(editPast.length){editFuture.push(stateNow());restoreState(editPast.pop());}};
$('humanRedo').onclick=()=>{if(editFuture.length){editPast.push(stateNow());restoreState(editFuture.pop());}};
$('humanReset').onclick=()=>{oldRestoreHuman({});commitEdit();};

const COLOR_PALETTES={
skin:['#ffffff','#f5dfd2','#e8c3a4','#ddb39a','#c99570','#bd8c68','#a5704f','#815238','#674332','#4b3028','#32231f','#a8c7ef','#749ac8','#b89ada','#8caf83','#65a99a','#df8d98','#a85156'],
hair:['#ffffff','#171311','#34251d','#65432b','#96633e','#c29461','#e4c793','#d8ae76','#943e26','#b95732','#77716c','#c9c5bd','#e99bb7','#914caf','#4678ba','#4f9a88'],
eyes:['#afffe6','#56e3cd','#138f8d','#83baff','#3358b8','#c4a5ff','#8244c7','#f3b0dc','#ed519e','#ff8e83','#b3294d','#ffe18c','#d9ee51','#89ce65','#547841','#334151','#ffffff','#f4eadd','#e6d9ca','#ced7df','#c5cfbe','#d7c4db','#e6b9b5','#77716f','#272229','#101015'],
iris:['#ffffff','#38251a','#65452b','#916532','#b39645','#667d42','#426b50','#54817e','#476d9b','#799cae','#989a98','#8462a0','#b46185','#c28d39','#b43e32','#18181b'],
outfit:['#ffffff','#eee5d1','#b2aaa0','#626772','#20232a','#162d4e','#34567a','#507b99','#254f40','#73845a','#792f40','#ae4c51','#ad7544','#d0aa52','#745480','#c594b3']};
function colorSwatches(key,label){return `<div class="studio-actions" role="group" aria-label="${label} presets">${(COLOR_PALETTES[key]||(key==='iris_inner'?COLOR_PALETTES.iris:COLOR_PALETTES.outfit)).map(c=>`<button type="button" data-color-key="${key}" data-color="${c}" aria-label="${label} ${c}" title="${c==='#ffffff'?'Original texture color':c}" style="background:${c};width:30px;height:30px;border:1px solid #aaa"></button>`).join('')}</div>`;}
const appearancePanel=document.createElement('div');appearancePanel.id='appearancePanel';appearancePanel.hidden=true;
appearancePanel.innerHTML=`<p class="quiet">Choose a feature to find its styles, textures, colors and effects together.</p>
<details id="appearanceSkin" class="appearance-section"><summary>Skin<small>Complexion, color, makeup and markings</small></summary><div class="appearance-section-body"><label>Skin texture<select id="skinComplexion"><option value="">Original</option><option value="custom" disabled>Custom upload</option></select></label>
${[["skin", "Skin tone"]].map(([id,label])=>`<label>${label}<input type="color" data-appearance="${id}" aria-label="${label}" value="#ffffff"></label>${colorSwatches(id,label)}`).join('')}<label>Skin sheen · original to glowy<input type="range" min="0" max="1" step="0.01" value="0" data-appearance="skin_sheen" aria-label="Skin sheen"></label><p class="quiet">Changes the light response while preserving complexion and markings.</p><details><summary>Custom skin texture</summary><p class="quiet">Use this model’s UV layout. PNG, JPEG or WebP; large images are resized to 2048 pixels.</p><label>Custom skin texture<input id="skinTextureUpload" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="clearSkinTexture">Use original skin texture</button>
<a href="/3d/designer/skin-source.png" download="jnsq-starter-skin.png">Download starter skin map</a></details><div id="skinSurfaceSlot"></div></div></details>
<details id="appearanceHair" class="appearance-section"><summary>Hair and brows<small>Hairstyles, facial hair, color and highlights</small></summary><div class="appearance-section-body"><label>Hair style<select id="hairstyle"><option value="short01">Short</option><option value="bob01">Bob</option><option value="afro01">Afro</option><option value="braid01">Braid</option><option value="long01">Long</option><option value="ponytail01">Ponytail</option><option value="none">No hair</option></select></label>
<details><summary>Hair lightness and highlights</summary><label>Hair lightness<input type="range" min="0" max="1" step="0.05" value="0" data-appearance="hair_lightness" aria-label="Hair lightness"></label><label>Highlight color<input type="color" value="#d9b878" data-appearance="hair_highlight_color" aria-label="Highlight color"></label><label>Highlight strength<input type="range" min="0" max="1" step="0.05" value="0" data-appearance="hair_highlight_amount" aria-label="Highlight strength"></label><label>Highlight pattern<select data-appearance="hair_highlight_pattern" aria-label="Highlight pattern"><option value="fine">Fine streaks</option><option value="broad">Broad streaks</option><option value="tips">Tinted tips</option></select></label><p class="quiet">Lightness lifts dark textures before tinting. Set highlight strength above zero for a second color. Patterns follow the hair texture layout; tips can align differently between models. Lightness controls how bright the selected hair color appears. Brows keep their existing color.</p></details><label>Eyebrows<select id="eyebrows"><option value="eyebrow001">Natural</option><option value="eyebrow009">Defined</option><option value="none">No eyebrows</option></select></label>
<label>Facial hair<select id="beard"><option value="none">Clean shaven</option><option value="wdg_scruffy_beard">Scruffy beard</option><option value="rehmanpolanski_moustache_viking">Moustache</option></select></label>
${[["hair", "Hair and brow color"]].map(([id,label])=>`<label>${label}<input type="color" data-appearance="${id}" aria-label="${label}" value="#ffffff"></label>${colorSwatches(id,label)}`).join('')}<button type="button" data-accessory-shortcut="hair">Import custom hair</button></div></details>
<details id="appearanceEyes" class="appearance-section"><summary>Eyes and eyelids<small>Textures, iris colors, sclera, pupils and creases</small></summary><div class="appearance-section-body"><label>Eye texture<select id="eyeDetail"><option value="">Original</option><option value="custom" disabled>Custom upload</option></select></label>
${[["iris", "Iris color"], ["iris_inner", "Inner iris color"], ["eyes", "Sclera color"]].map(([id,label])=>`<label>${label}<input type="color" data-appearance="${id}" aria-label="${label}" value="#ffffff"></label>${colorSwatches(id,label)}`).join('')}<label>Iris lightness<input type="range" min="0" max="1" step="0.05" value="0.5" data-appearance="iris_lightness" aria-label="Iris lightness"></label><label>Natural iris colors<select id="naturalIris"><option value="">Choose a color pair</option><option value="#715038,#ad814b">Warm brown</option><option value="#aa8746,#cfab65">Amber</option><option value="#73835c,#b28c49">Hazel</option><option value="#627f72,#a59c65">Sage green</option><option value="#658695,#a6b4ad">Blue gray</option><option value="#889698,#b4aca0">Silver gray</option></select></label><p class="quiet">Iris color sets the outer ring; Inner iris color blends around the pupil. White inherits the outer color. Color pairs keep your selected texture and eye pattern.</p><details><summary>Fantasy eyes and pupil shapes</summary><label>Eye pattern<select data-appearance="eye_style" aria-label="Eye pattern"><option value="original">Original / uploaded texture</option><option value="radial">Natural radial iris</option><option value="ember">Ember</option><option value="galaxy">Galaxy</option><option value="rings">Concentric rings</option><option value="crystal">Crystal</option><option value="spiral">Spiral</option><option value="starburst">Starburst</option><option value="void">Void</option></select></label><label>Pupil shape<select data-appearance="pupil_shape" aria-label="Pupil shape"><option value="round">Round / oval</option><option value="vertical">Vertical slit</option><option value="horizontal">Horizontal slit</option><option value="diamond">Diamond</option><option value="none">No pupil</option></select></label><label>Pupil width<input data-appearance="pupil_width" aria-label="Pupil width" type="range" min="0" max="1" step="0.05" value="0.5"></label><label>Pupil height<input data-appearance="pupil_height" aria-label="Pupil height" type="range" min="0" max="1" step="0.05" value="0.5"></label><label>Iris size<input data-appearance="iris_size" aria-label="Iris size" type="range" min="0" max="1" step="0.05" value="0.5"></label><label>Eye accent color<input data-appearance="eye_accent" aria-label="Eye accent color" type="color" value="#8eefff"></label><p class="quiet">Changing a pupil or iris-shape control activates the radial pattern; choose another pattern for fantasy effects. Iris color is the primary color; accent color adds contrast. Fantasy patterns replace the selected eye texture; Original restores it. Effects are painted, not light sources.</p></details><label>Eye shading<input type="range" min="0" max="1" step="0.05" value="0.65" data-appearance="eye_shading" aria-label="Eye shading"></label><p class="quiet">Soft shading gives the sclera more depth. Zero keeps the original texture brightness.</p><p class="quiet">Iris and sclera colors also work with eye textures. White keeps the texture's original color.</p>
<details><summary>Eyelid creases and shading</summary><label>Eyelid finish<select id="lidFinish"><option value="soft">Soft low crease</option><option value="rounded">High rounded crease</option><option value="tapered">Tapered crease</option><option value="shadow">Socket shading only</option></select></label>
<label>Crease and shadow strength<input id="lidStrength" type="range" min="0" max="1" step="0.05" value="0.65"></label>
<label>Crease width<input id="lidWidth" type="range" min="0" max="1" step="0.05" value="0.5"></label><label>Crease height<input id="lidHeight" type="range" min="0" max="1" step="0.05" value="0.5"></label><button id="applyLidFinish">Apply eyelid finish</button><p class="quiet">Adds subtle shading to the current skin map. Save to keep it; Undo restores the previous map. This is painted detail, not a change to eyelid geometry.</p>
</details><details><summary>Custom eye texture</summary><p class="quiet">Uploads replace iris and sclera together. Use this model’s UV layout. PNG, JPEG or WebP; large images are resized to 2048 pixels.</p><label>Custom eye texture<input id="eyeTextureUpload" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="clearEyeTexture">Use original eye texture</button><a href="/3d/designer/eye-source.png" download="jnsq-starter-eyes.png">Download starter eye map</a></details></div></details>
<details id="appearanceClothing" class="appearance-section"><summary>Clothing<small>Outfits, separate pieces and garment colors</small></summary><div class="appearance-section-body"><label>Find an outfit<input id="wardrobeSearch" type="search" placeholder="Try casual, dress, suit…"></label>
<label>Outfit category<select id="wardrobeGroup"><option value="">All outfits</option></select></label>
<label>Outfit<select id="wardrobe"><option value="">Current model</option></select></label>
<p id="wardrobeCount" class="quiet" aria-live="polite"></p>
<details><summary>Browse outfit previews</summary><div id="wardrobeGallery" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.4rem;max-height:360px;overflow:auto"></div><p class="quiet">Asset previews show the original cut. The live model shows your chosen shape and colors.</p></details>
${[["outfit", "Clothing color"]].map(([id,label])=>`<label>${label}<input type="color" data-appearance="${id}" aria-label="${label}" value="#ffffff"></label>${colorSwatches(id,label)}`).join('')}<details id="separatesPanel"><summary>Mix shirts and trousers</summary><p class="quiet">These five casual cuts have compatible separate garments. Clothing color tints both pieces; white keeps the original texture, then the two colors below adjust each piece independently.</p><label>Shirt<select id="separateTop">${[2,3,4,5,6].map(i=>`<option value="${i}">Casual top ${i}</option>`).join('')}</select></label><label>Trousers<select id="separateBottom">${[2,3,4,5,6].map(i=>`<option value="${i}">Trousers ${i}</option>`).join('')}</select></label><button id="useSeparates">Wear this combination</button><fieldset id="separateColors" disabled><legend>Individual garment colors</legend>${[['outfit_top','Shirt color'],['outfit_bottom','Trouser color']].map(([id,label])=>`<label>${label}<input type="color" data-appearance="${id}" aria-label="${label}" value="#ffffff"></label>${colorSwatches(id,label)}`).join('')}</fieldset></details>
<button type="button" data-accessory-shortcut="clothes">Import custom clothing</button></div></details>
<p id="textureState" class="quiet"></p><button id="resetAppearance">Reset appearance</button>`;
$('studioShapeSlot').after(appearancePanel);
const appearanceTab=document.createElement('button');appearanceTab.dataset.group='appearance';appearanceTab.textContent='Appearance';appearanceTab.setAttribute('aria-pressed','false');document.querySelector('.studio-tabs').append(appearanceTab);
const oldShowGroup=showHumanGroup;
showHumanGroup=function(group){oldShowGroup(group);appearancePanel.hidden=group!=='appearance';if(group==='appearance')$('studioShapeSlot').hidden=true;};
appearanceTab.onclick=()=>showHumanGroup('appearance');
function paintAppearance(){if($('naturalIris'))$('naturalIris').value='';if($('textureState'))$('textureState').textContent=[appearanceState.skin_texture?'Skin texture selected':'Original skin',appearanceState.eye_texture?'Custom eyes selected':'Separate iris/sclera colors'].join(' · ');for(const el of document.querySelectorAll('[data-appearance]'))el.value=appearanceState[el.dataset.appearance];for(const id of ['hairstyle','eyebrows','beard'])$(id).value=appearanceState[id];const select=$('skinComplexion');if(select)select.value=[...select.options].some(o=>o.value===appearanceState.skin_texture)?appearanceState.skin_texture:'custom';}
let skinComplexions=[];
let lidFinishBase=null,lidFinishResult=null;
$('applyLidFinish').onclick=async()=>{
  const button=$('applyLidFinish');button.disabled=true;
  const source=appearanceState.skin_texture;
  if(source!==lidFinishResult)lidFinishBase=source;
  try{
    const blob=await makeEyelidFinish(lidFinishBase,$('lidFinish').value,Number($('lidStrength').value),Number($('lidWidth').value),Number($('lidHeight').value));
    if(appearanceState.skin_texture!==source)throw new Error('Skin changed during preparation. Apply the finish again.');
    const response=await fetch('/api/avatar-library/textures',{method:'POST',headers:{'Content-Type':'image/png'},body:blob});
    const data=await response.json();if(!response.ok)throw new Error(data.error);
    if(appearanceState.skin_texture!==source)throw new Error('Skin changed during preparation. Apply the finish again.');
    lidFinishResult=data.texture_id;appearanceState.skin_texture=data.texture_id;paintAppearance();appearancePreview();commitEdit();
    studioStatus('Eyelid finish applied. Save your design to keep it.');
  }catch(error){studioStatus(error.message,true);}finally{button.disabled=false;}
};
const paintSkinAppearance=paintAppearance;
paintAppearance=function(){paintSkinAppearance();const select=$('eyeDetail');select.value=[...select.options].some(o=>o.value===appearanceState.eye_texture)?appearanceState.eye_texture:'custom';};
let eyeDetails=[];
fetch('/3d/designer/eyes/index.json').then(r=>{if(!r.ok)throw new Error('Eye textures unavailable');return r.json();}).then(items=>{eyeDetails=items;for(const item of items){const option=document.createElement('option');option.value=item.texture_id;option.textContent=item.label;$('eyeDetail').append(option);}paintAppearance();}).catch(error=>studioStatus(error.message,true));
$('eyeDetail').onchange=async()=>{
  const select=$('eyeDetail'),id=select.value;select.disabled=true;
  try{
    if(id){const item=eyeDetails.find(item=>item.texture_id===id);if(!item)throw new Error('Unknown eye texture');const response=await fetch('/3d/designer/eyes/'+item.file);if(!response.ok)throw new Error('Eye texture unavailable');const saved=await fetch('/api/avatar-library/textures',{method:'POST',headers:{'Content-Type':'image/png'},body:await response.blob()});const data=await saved.json();if(!saved.ok)throw new Error(data.error);if(data.texture_id!==id)throw new Error('Eye texture does not match the catalog');}
    appearanceState.eye_texture=id;paintAppearance();appearancePreview();commitEdit();
  }catch(error){paintAppearance();studioStatus(error.message,true);}finally{select.disabled=false;}
};
fetch('/3d/designer/complexions/index.json').then(r=>{if(!r.ok)throw new Error('Skin texture choices unavailable');return r.json();}).then(items=>{skinComplexions=items;for(const item of items){const option=document.createElement('option');option.value=item.texture_id;option.textContent=item.label;$('skinComplexion').append(option);}paintAppearance();}).catch(error=>studioStatus(error.message,true));
$('skinComplexion').onchange=async()=>{
  const select=$('skinComplexion'),id=select.value;select.disabled=true;
  try{
    if(id){const item=skinComplexions.find(item=>item.texture_id===id);if(!item)throw new Error('Unknown skin texture');const response=await fetch('/3d/designer/complexions/'+item.file);if(!response.ok)throw new Error('Skin texture unavailable');const saved=await fetch('/api/avatar-library/textures',{method:'POST',headers:{'Content-Type':'image/png'},body:await response.blob()});const data=await saved.json();if(!saved.ok)throw new Error(data.error);if(data.texture_id!==id)throw new Error('Skin texture does not match the catalog');}
    appearanceState.skin_texture=id;paintAppearance();appearancePreview();commitEdit();
  }catch(error){paintAppearance();studioStatus(error.message,true);}finally{select.disabled=false;}
};
for(const el of document.querySelectorAll('[data-appearance]'))el.oninput=()=>{appearanceState[el.dataset.appearance]=el.type==='range'?Number(el.value):el.value;if(['pupil_shape','pupil_width','pupil_height','iris_size','eye_accent'].includes(el.dataset.appearance)&&appearanceState.eye_style==='original'){appearanceState.eye_style='radial';paintAppearance();}appearancePreview();commitEdit();};
for(const id of ['hairstyle','eyebrows','beard'])$(id).onchange=()=>{appearanceState[id]=$(id).value;appearancePreview();commitEdit();};
for(const el of document.querySelectorAll('[data-color-key]'))el.onclick=()=>{appearanceState[el.dataset.colorKey]=el.dataset.color;paintAppearance();appearancePreview();commitEdit();};
$('naturalIris').onchange=()=>{if(!$('naturalIris').value)return;[appearanceState.iris,appearanceState.iris_inner]=$('naturalIris').value.split(',');paintAppearance();appearancePreview();commitEdit();};
$('resetAppearance').onclick=()=>{appearanceState={...APPEARANCE_DEFAULT};paintAppearance();appearancePreview();commitEdit();};

for(const [input,key,clear] of [['skinTextureUpload','skin_texture','clearSkinTexture'],['eyeTextureUpload','eye_texture','clearEyeTexture']]){
  $(input).onchange=async()=>{try{await importStudioTexture($(input).files[0],key);}catch(error){studioStatus(error.message,true);}finally{$(input).value='';}};
  $(clear).onclick=()=>{appearanceState[key]='';paintAppearance();appearancePreview();commitEdit();};
}
const facePresets={soft:{jaw_width:.35,jaw_definition:.25,cheekbones:.45,chin_height:.4,nose_size:.4,mouth_width:.55},angular:{jaw_width:.65,jaw_definition:.8,cheekbones:.75,chin_height:.6,nose_projection:.65},round:{jaw_width:.62,jaw_definition:.2,cheekbones:.3,chin_height:.3,eye_size:.6},long:{jaw_width:.38,chin_height:.75,nose_vertical:.65,nose_projection:.6,mouth_width:.42}};
const faceChoice=document.createElement('label');faceChoice.innerHTML='Face starting point<select id="facePreset"><option value="">Choose a face</option><option value="soft">Soft</option><option value="angular">Angular</option><option value="round">Round</option><option value="long">Long</option></select>';
Object.assign(facePresets,{
  'sculpted contours':{nose_bridge_width:.35,nose_tip_width:.38,nostril_flare:.58,jaw_corner:.8,temple_definition:.72,cheek_volume:.3,cheekbones:.72,jaw_definition:.65,facial_definition:.65},
  chiseled:{cheekbones:.78,cheek_volume:.28,temple_definition:.65,jaw_definition:.8,jaw_width:.56,facial_definition:.7,chin_projection:.58},
  oval:{jaw_width:.4,jaw_definition:.4,cheekbones:.52,chin_height:.55},
  heart:{cheekbones:.75,jaw_width:.27,chin_height:.48,mouth_width:.57},
  diamond:{cheekbones:.88,jaw_width:.32,jaw_definition:.65,chin_height:.65},
  square:{jaw_width:.78,jaw_definition:.72,chin_height:.4,mouth_width:.62},
  rectangular:{jaw_width:.68,jaw_definition:.7,chin_height:.78,nose_vertical:.62},
  delicate:{jaw_width:.28,nose_size:.3,nostril_width:.35,mouth_width:.4,eye_size:.6},
  sculpted:{cheekbones:.82,jaw_definition:.8,nose_projection:.7,chin_projection:.63},
  broad:{jaw_width:.76,cheekbones:.65,nose_size:.6,nostril_width:.7,mouth_width:.7},
  'convex profile':{nose_projection:.85,nose_curve:.75,nose_size:.62,nose_tip_angle:.38,jaw_projection:.35,chin_projection:.28,cheekbones:.68,jaw_definition:.6},
  'strong lower profile':{nose_projection:.45,jaw_projection:.83,chin_projection:.86,chin_height:.6,jaw_width:.64,jaw_definition:.72,nose_curve:.42},
  'projected balanced':{nose_projection:.78,jaw_projection:.7,chin_projection:.72,cheekbones:.72,jaw_definition:.62,nose_size:.55},
  'soft recessed chin':{nose_projection:.6,jaw_projection:.28,chin_projection:.18,chin_height:.38,jaw_definition:.2,cheekbones:.38,nose_tip_angle:.64},
  'long sculpted profile':{nose_projection:.88,nose_vertical:.62,nose_size:.66,nose_curve:.65,jaw_projection:.58,chin_projection:.75,chin_height:.78,jaw_width:.35,jaw_definition:.84,cheekbones:.86},
  'broad forward profile':{nose_projection:.64,nose_size:.66,nostril_width:.78,jaw_projection:.8,chin_projection:.62,jaw_width:.82,mouth_width:.7,cheekbones:.62,upper_lip_volume:.68,lower_lip_volume:.7},
  'compact upturned profile':{nose_projection:.37,nose_size:.3,nose_tip_angle:.8,nose_curve:.25,jaw_projection:.55,chin_projection:.68,chin_height:.3,jaw_width:.38,cheekbones:.6},
  'defined bridge soft jaw':{nose_projection:.9,nose_curve:.58,nostril_width:.35,nose_size:.52,jaw_projection:.4,chin_projection:.48,jaw_definition:.27,cheekbones:.7}
});
faceChoice.querySelector('select').innerHTML='<option value="">Choose a face</option>'+Object.keys(facePresets).map(key=>`<option value="${key}">${key[0].toUpperCase()+key.slice(1)}</option>`).join('');
$('studioShapeSlot').before(faceChoice);
$('facePreset').onchange=()=>{const preset=facePresets[$('facePreset').value];if(!preset)return;oldRestoreHuman({...readHumanMorphs(),...Object.fromEntries(HUMAN_MORPH_CONTROLS.filter(([id])=>!bodyControls.has(id)).map(([id])=>[id,.5])),...preset});commitEdit();};
const comfort=document.createElement('div');comfort.className='studio-actions';
comfort.innerHTML=`<label>Shape starting point<select id="shapePreset"><option value="">Choose a preset</option><option value="balanced">Balanced</option><option value="slender">Slender</option><option value="broad">Broad</option><option value="soft">Soft</option></select></label><button id="compareSet">Keep comparison</button><button id="compareToggle" disabled aria-pressed="false">Show before</button>`;
$('studioShapeSlot').before(comfort);
const presets={balanced:{},slender:{body_mass:.28,muscularity:.35,shoulder_width:.4},broad:{body_mass:.65,muscularity:.7,shoulder_width:.7},soft:{body_mass:.72,muscularity:.3,hip_width:.62}};
Object.assign(presets,{
  athletic:{muscularity:.82,body_mass:.45,shoulder_width:.65},
  full:{body_mass:.88,muscularity:.35,hip_depth:.68},
  curvy:{hip_depth:.8,hip_width:.65,breast_size:.72,body_mass:.58},
  lean:{body_mass:.22,muscularity:.65,hip_width:.4},
  'broad shoulders':{shoulder_width:.85,muscularity:.6,hip_width:.4},
  'full hips':{hip_depth:.92,hip_width:.65,shoulder_width:.4}
});
$('shapePreset').innerHTML='<option value="">Choose a preset</option>'+Object.keys(presets).map(key=>`<option value="${key}">${key[0].toUpperCase()+key.slice(1)}</option>`).join('');
$('shapePreset').onchange=()=>{const p=$('shapePreset').value;if(!p)return;oldRestoreHuman({...readHumanMorphs(),...Object.fromEntries(HUMAN_MORPH_CONTROLS.filter(([id])=>bodyControls.has(id)).map(([id])=>[id,.5])),...presets[p]});commitEdit();};
$('compareSet').onclick=()=>{comparison=clone(stateNow());$('compareToggle').disabled=false;studioStatus('Comparison kept for this editing session.');};
$('compareToggle').onclick=()=>{comparing=!comparing;$('compareToggle').textContent=comparing?'Show current':'Show before';$('compareToggle').setAttribute('aria-pressed',String(comparing));const value=comparing?comparison:stateNow();const f=$('previewFrame').contentWindow?.jnsqHumanMorphApply;if(f)f(JSON.stringify(value.identity));sendAppearance(value.appearance,value.identity);studioStatus(comparing?'Showing comparison · edits still belong to your current design.':'Showing current design.');};

const motions=document.createElement('div');motions.className='studio-actions';motions.innerHTML='<label>Movement check<select id="studioMotion"><option value="idle">Standing / idle</option><option value="still">Still</option><option value="walk">Walk in place</option><option value="sit">Sit</option><option value="turn">Turntable</option><option value="blink">Blink</option><option value="talk">Speech mouth movement</option></select></label><span class="quiet">Preview only</span>';
$('studioPreviewState').before(motions);
$('studioMotion').onchange=()=>{studioCommand('motion',$('studioMotion').value);};
const recoveryControls=document.createElement('div');recoveryControls.className='studio-actions';
recoveryControls.innerHTML='<button id="studioPause">Pause preview</button><button id="studioRestart">Restart preview</button>';
$('studioPreviewState').after(recoveryControls);
let previewPaused=false;
$('studioPause').onclick=()=>{if(previewPaused){previewPaused=false;$('studioPause').textContent='Pause preview';launchStudioPreview();}else{previewPaused=true;humanPreviewReady=false;$('previewFrame').src='about:blank';$('studioPause').textContent='Resume preview';$('studioPreviewState').textContent='Preview paused. Your design and edits are still here.';}};
$('studioRestart').onclick=()=>{previewPaused=false;window.studioForceRestart=true;$('studioPause').textContent='Pause preview';launchStudioPreview();};
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==$('previewFrame').contentWindow)return;
  if(event.data?.type==='jnsq-studio-context-lost'){
    humanPreviewReady=false;
    $('studioPreviewState').textContent='The graphics preview stopped. Your edits are still here. Close other 3D views, then choose Restart preview.';
  }
  if(event.data?.type==='jnsq-human-morph-ready'){
    if(comparing&&comparison){const apply=$('previewFrame').contentWindow?.jnsqHumanMorphApply;if(apply)apply(JSON.stringify(comparison.identity));sendAppearance(comparison.appearance,comparison.identity);}
    studioCommand('motion',$('studioMotion').value);
  }
});

const openWithComfort=openMapper;
openMapper=async function(id,identity=null){await openWithComfort(id,identity);editPast=[];editFuture=[];editLast=stateNow();comparison=clone(editLast);comparing=false;$('compareToggle').disabled=false;$('compareToggle').textContent='Show before';$('compareToggle').setAttribute('aria-pressed','false');$('studioMotion').value='idle';studioCommand('motion','idle');invalidateDownload();historyButtons();for(const input of document.querySelectorAll('[data-human-morph]')){const reset=document.createElement('button');reset.type='button';reset.textContent='Reset';reset.style.cssText='width:auto;padding:.15rem .5rem;margin:0';reset.setAttribute('aria-label','Reset '+input.getAttribute('aria-label'));reset.onclick=e=>{e.preventDefault();const next=readHumanMorphs();next[input.dataset.humanMorph]=.5;oldRestoreHuman(next);commitEdit();};input.after(reset);}paintAppearance();};
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('previewFrame').contentWindow)return;if(event.data?.type==='jnsq-human-morph-ready'){if(!comparing)appearancePreview();editLast=stateNow();}});

async function api(url,body){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data;}
const savedStrip=document.createElement('div');savedStrip.id='savedGallery';savedStrip.style.cssText='display:flex;gap:.6rem;overflow:auto;margin:.6rem 0';
const savedShelf=document.createElement('details');savedShelf.className='card';savedShelf.innerHTML='<summary>Saved designs</summary>';savedShelf.append(savedStrip);$('studio').after(savedShelf);
async function gallery(){const data=await json('/api/avatar-bodies/builder/recipes');savedStrip.innerHTML=(data.recipes||[]).map(r=>`<button style="width:130px;flex-shrink:0;padding:.4rem" data-open-design="${esc(r.recipe_id)}"><img alt="" src="/api/avatar-library/thumbnails/${r.recipe_id}/${r.revision_id}" style="width:100%;aspect-ratio:1;object-fit:cover" onerror="this.hidden=true">${esc(r.name)}</button>`).join('');for(const button of savedStrip.querySelectorAll('button'))button.onclick=()=>{$('builderRecipe').value=button.dataset.openDesign;$('builderRecipe').dispatchEvent(new Event('change'));};}
const thumbnailWaiters=new Map();
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('previewFrame').contentWindow||event.data?.type!=='jnsq-studio-thumbnail')return;const done=thumbnailWaiters.get(event.data.token);if(done){thumbnailWaiters.delete(event.data.token);done(event.data.image);}});
function thumbnail(){return new Promise(resolve=>{if(!humanPreviewReady)return resolve(null);const token=crypto.randomUUID();const timer=setTimeout(()=>{thumbnailWaiters.delete(token);resolve(null);},5000);thumbnailWaiters.set(token,image=>{clearTimeout(timer);resolve(image);});studioCommand('thumbnail',null,{token});});}
saveStudio=async function(copy=false){
  if(saveBusy||!activeCandidateMeta)return false;
  saveBusy=true;
  const id=copy?null:activeRecipe,payload=readBuilder(),previewMotion=$('studioMotion').value;
  const controls=Array.from($('studio').querySelectorAll('input,select,button')).map(el=>[el,el.disabled]);
  for(const [el] of controls)el.disabled=true;
  comparing=false;$('compareToggle').textContent='Show before';$('compareToggle').setAttribute('aria-pressed','false');
  studioCommand('motion','still');$('studioMotion').value='still';applyHumanMorphPreview();await appearancePreview();
  try{
    const image=await thumbnail();
    const response=await fetch('/api/avatar-bodies/builder/recipes'+(id?'/'+id:''),{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json();if(!response.ok)throw new Error(result.error);
    activeRecipe=result.recipe_id;
    let thumbnailSaved=false;
    if(image)try{await api(`/api/avatar-library/thumbnails/${result.recipe_id}/${result.revision_id}`,{image});thumbnailSaved=true;}catch(error){console.warn('Thumbnail unavailable',error);}
    await loadBuilderRecipes(activeRecipe);studioDirty=false;
    studioStatus(`Saved “${result.name}” locally.${thumbnailSaved?'':' Preview thumbnail unavailable; the design is saved.'}`);
    await gallery();return true;
  }catch(error){studioStatus(error.message,true);return false;}
  finally{$('studioMotion').value=previewMotion;studioCommand('motion',previewMotion);saveBusy=false;for(const [el,disabled] of controls)el.disabled=disabled;historyButtons();}
};
$('builderName').addEventListener('input',invalidateDownload);

const publishPanel=document.createElement('details');publishPanel.className='card';publishPanel.innerHTML=`<summary>Use an avatar in JNSQ</summary><p>Assign a 3D body for the JNSQ world. Profile pictures are separate.</p><p>Keep a finished avatar in your local library, then choose who will use it. You can restore their previous appearance.</p><div class="studio-actions"><button id="publishAvatar">Add current avatar to library</button></div><label>Finished avatar<select id="libraryPackage"></select></label><label>Persona or user<select id="libraryMember"></select></label><p id="assignmentState" class="quiet"></p><div class="studio-actions"><button id="assignAvatar">Use selected avatar</button><button id="restoreAvatar">Restore previous appearance</button></div>`;
$('advancedWorkshop').before(publishPanel);
async function refreshLibrary(selected=''){libraryState=await json('/api/avatar-library');$('libraryPackage').innerHTML='<option value="">Choose a finished avatar</option>'+libraryState.packages.map(p=>`<option value="${p.package_id}">${esc(p.name)}</option>`).join('');if(selected)$('libraryPackage').value=selected;const member=$('libraryMember').value;const targets=libraryState.targets||libraryState.members.map(m=>({id:m,name:m,kind:'member'}));$('libraryMember').innerHTML='<option value="">Choose a persona or user</option>'+['persona','user','member'].map(kind=>{const rows=targets.filter(t=>t.kind===kind);return rows.length?`<optgroup label="${kind==='persona'?'Personas':kind==='user'?'Users':'Other room members'}">${rows.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}${t.name!==t.id?' ('+esc(t.id)+')':''}</option>`).join('')}</optgroup>`:'';}).join('');$('libraryMember').value=member;assignmentLabel();}
function assignmentLabel(){const m=$('libraryMember').value,a=libraryState?.assignments[m.toLowerCase()],p=libraryState?.packages.find(p=>p.package_id===a?.package_id);$('assignmentState').textContent=m?`Current appearance: ${p?.name||'original model'}`:'Choose who will use this avatar.';$('restoreAvatar').disabled=!a?.history?.length;}
$('libraryMember').onchange=assignmentLabel;
async function currentGLB(){
  const source={...activeCandidateMeta},identity=readHumanMorphs(),appearance=readAppearance(),name=$('builderName').value.trim()||'Imported avatar';
  const response=await fetch(`/api/avatar-bodies/candidates/${source.candidate_id}/model`);
  if(!response.ok)throw new Error('Source model unavailable');
  const bytes=await response.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==source.sha256)throw new Error('Source changed; reopen it before publishing');
  return {glb:shapedAvatarGLB(bytes,identity,name,await resolvedAppearance(appearance,source.candidate_id,identity),true),name,source:source.candidate_id};
}
$('publishAvatar').onclick=async()=>{const b=$('publishAvatar');b.disabled=true;try{studioStatus('Preparing a finished local avatar…');const {source,glb,name}=await currentGLB();const response=await fetch('/api/avatar-bodies/candidates?filename='+encodeURIComponent(name+'.glb'),{method:'POST',headers:{'Content-Type':'model/gltf-binary'},body:glb});const staged=await response.json();if(!response.ok)throw new Error(staged.error);const package_=await api('/api/avatar-library/packages',{candidate_id:staged.candidate_id||staged.candidate?.candidate_id,name,mapping_source:source});await refreshLibrary(package_.package_id);studioStatus('Avatar added to your local library. Choose a persona or user to use it.');}catch(error){studioStatus(error.message,true);}finally{b.disabled=false;}};
async function assignSelected(restore=false){const member=$('libraryMember').value,package_id=$('libraryPackage').value;if(!member||(!restore&&!package_id)){studioStatus('Choose a persona or user and finished avatar first.',true);return;}try{const current=libraryState.assignments[member.toLowerCase()];await api('/api/avatar-library/assignments/'+encodeURIComponent(member),{package_id,restore,expected_revision:current?.revision||null});await refreshLibrary(package_id);studioStatus(restore?`Restored ${member}’s previous appearance.`:`${member} now uses the selected avatar.`);}catch(error){studioStatus(error.message,true);await refreshLibrary(package_id);}}
$('assignAvatar').onclick=()=>assignSelected();$('restoreAvatar').onclick=()=>assignSelected(true);
let wardrobeItems=[];
function paintWardrobe(){
  const query=$('wardrobeSearch').value.trim().toLowerCase(),group=$('wardrobeGroup').value;
  const visible=wardrobeItems.filter(c=>(!group||(c.group||'Originals')===group)&&`${c.name} ${c.group||''}`.toLowerCase().includes(query));
  $('wardrobe').innerHTML='<option value="">Choose an outfit</option>'+visible.map(c=>`<option value="${c.candidate_id}">${esc(c.name)}</option>`).join('');
  $('wardrobe').value=wardrobeItems.find(item=>item.candidate_id===activeCandidate||item.asset===fittedOutfit)?.candidate_id||'';
  $('wardrobeCount').textContent=`${visible.length} of ${wardrobeItems.length} outfits. Your face, body and colors stay with you when changing outfits.`;
  $('wardrobeGallery').innerHTML=visible.map(c=>`<button type="button" data-outfit-choice="${c.candidate_id}" style="width:100%;padding:.3rem">${c.asset?`<img loading="lazy" alt="" src="/3d/designer/wardrobe-previews/${esc(c.asset)}.png" style="width:100%;aspect-ratio:1;object-fit:contain">`:''}${esc(c.name)}</button>`).join('');
  for(const button of $('wardrobeGallery').querySelectorAll('button'))button.onclick=()=>{$('wardrobe').value=button.dataset.outfitChoice;$('wardrobe').dispatchEvent(new Event('change'));};
}
async function loadWardrobe(){
  const data=await json('/api/avatar-library/starters');wardrobeItems=data.starters;
  $('wardrobeGroup').innerHTML='<option value="">All outfits</option>'+[...new Set(wardrobeItems.map(c=>c.group||'Originals'))].sort().map(group=>`<option>${esc(group)}</option>`).join('');
  paintWardrobe();
}
$('wardrobeSearch').oninput=paintWardrobe;$('wardrobeGroup').onchange=paintWardrobe;
$('useSeparates').onclick=()=>{const entry=wardrobeItems.find(item=>item.top===$('separateTop').value&&item.bottom===$('separateBottom').value);if(!entry)return; $('wardrobeSearch').value='';$('wardrobeGroup').value='';paintWardrobe();$('wardrobe').value=entry.candidate_id;$('wardrobe').dispatchEvent(new Event('change'));};
$('wardrobe').onchange=async()=>{
  const id=$('wardrobe').value;if(!id||$('wardrobe').disabled)return;
  if(!activeHumanMorphs.length||activeHumanMorphs.some(row=>row[0]==='character_heart')){studioStatus('This character keeps its fitted outfit. More outfits need fitting to this character range.');$('wardrobe').value='';return;}
  const identity=readHumanMorphs(),outfit=wardrobeItems.find(item=>item.candidate_id===id),hair=extraHairItems.find(item=>item.id===appearanceState.hairstyle);
  $('wardrobe').disabled=true;
  for(const button of $('wardrobeGallery').querySelectorAll('button'))button.disabled=true;
  try{
    if(hair&&outfit){
      studioStatus('Preparing this outfit with your selected hairstyle…');
      const response=await fetch(hair.url);if(!response.ok)throw new Error('Hairstyle bundle unavailable');
      const outfitKey=outfit.pieces?'separates:'+outfit.top+':'+outfit.bottom:outfit.asset;
      await fitAccessoryBlob(await response.blob(),'hair',outfitKey);
      if(readyAccessory?.name===hair.id&&readyAccessory.outfit===(outfit.pieces?'separates:'+outfit.top+':'+outfit.bottom:outfit.asset))await $('openAccessory').onclick();
    }else{await openMapper(id,identity);if(activeCandidate===id)markEdit();}
  }catch(error){studioStatus(error.message,true);}
  finally{$('wardrobe').disabled=false;for(const button of $('wardrobeGallery').querySelectorAll('button'))button.disabled=false;}
};
paintAppearance();gallery().catch(()=>{});refreshLibrary().catch(()=>{$('assignmentState').textContent='Avatar library will be available when the updated room host is running.';});loadWardrobe().catch(()=>{});

const accessoryPanel=document.createElement('details');
accessoryPanel.innerHTML='<summary>Add custom hair or clothes</summary><p class="quiet">Upload a MakeHuman/MPFB accessory ZIP containing one .mhclo file, its OBJ, material and textures. Its fitting data lets the accessory follow your body sliders. An arbitrary GLB needs fitting first; complete avatars can still be imported below.</p><label>Accessory type<select id="accessoryKind"><option value="hair">Hair</option><option value="clothes">Clothes</option></select></label><label>Accessory ZIP<input type="file" id="accessoryZip" accept=".zip"></label><button id="importAccessory">Fit accessory</button><p id="accessoryProgress" class="quiet"></p><button id="openAccessory" hidden>Use fitted accessory</button>';
accessoryPanel.id='appearanceImports';accessoryPanel.className='appearance-section';
$('resetAppearance').before(accessoryPanel);
for(const button of appearancePanel.querySelectorAll('[data-accessory-shortcut]'))button.onclick=()=>{
  accessoryPanel.open=true;$('accessoryKind').value=button.dataset.accessoryShortcut;
  accessoryPanel.scrollIntoView({block:'nearest'});$('accessoryKind').focus({preventScroll:true});
};
let readyAccessory=null;
let fittedOutfit='';
let accessoryBusy=false;
let extraHairItems=[],availableHairstyles=new Set();
function mergeHairChoices(){
  for(const item of extraHairItems){const existing=[...$('hairstyle').options].find(o=>o.value===item.id);if(existing){existing.disabled=false;existing.textContent=item.name;continue;}
    const option=document.createElement('option');option.value=item.id;option.textContent=item.name;$('hairstyle').append(option);
  }
  $('hairstyle').value=appearanceState.hairstyle;
}
json('/3d/designer/extra-hair/index.json').then(data=>{extraHairItems=window.JNSQ_STANDALONE?[]:data.hair;mergeHairChoices();}).catch(error=>studioStatus('Additional hairstyles unavailable: '+error.message,true));
const hairHelp=document.createElement('p');hairHelp.className='quiet';hairHelp.setAttribute('role','status');hairHelp.textContent='All hairstyles are in this list. Additional styles fit locally on first use, then apply automatically. Cached combinations open faster.';
$('hairstyle').parentElement.after(hairHelp);
$('hairstyle').onchange=async()=>{
  const selected=$('hairstyle').value,previous=appearanceState.hairstyle;
  if(selected==='none'||availableHairstyles.has(selected)){appearanceState.hairstyle=selected;studioCommand('hair',selected);appearancePreview();commitEdit();hairHelp.textContent=selected==='none'?'Hair hidden.':'Selected hairstyle is on your avatar.';return;}
  const item=extraHairItems.find(item=>item.id===selected);if(!item){hairHelp.textContent='This hairstyle is unavailable for this model.';return;}
  $('hairstyle').disabled=true;hairHelp.textContent='Preparing '+item.name+'… It will appear automatically when ready.';studioStatus(hairHelp.textContent);
  try{
    const response=await fetch(item.url);if(!response.ok)throw new Error('Hairstyle bundle unavailable');
    await fitAccessoryBlob(await response.blob(),'hair');
    if(!readyAccessory)throw new Error('Hairstyle fitting did not finish.');
    await $('openAccessory').onclick();hairHelp.textContent=item.name+' is on your avatar.';
  }catch(error){appearanceState.hairstyle=previous;paintAppearance();hairHelp.textContent=error.message;studioStatus(error.message,true);}
  finally{$('hairstyle').disabled=false;}
};
async function fitAccessoryBlob(blob,category,outfit=fittedOutfit){
  if(accessoryBusy)throw new Error('A hairstyle or accessory is already being fitted. Let it finish before choosing another.');
  if(category==='hair'&&!outfit)throw new Error('Choose an outfit from the catalog before fitting another hairstyle.');
  accessoryBusy=true;
  readyAccessory=null;$('openAccessory').hidden=true;
  $('importAccessory').disabled=true;$('hairstyle').disabled=true;
  try{
    const response=await fetch('/api/avatar-library/accessories/'+category+'?outfit='+encodeURIComponent(outfit||'male_casualsuit01'),{method:'POST',headers:{'Content-Type':'application/zip'},body:blob});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Fitting could not start');
    localStorage.setItem('jnsq-accessory-job',data.job_id);await watchAccessory(data.job_id);
  }finally{accessoryBusy=false;$('importAccessory').disabled=false;$('hairstyle').disabled=false;}
}
let watchedAccessoryJob='';
async function watchAccessory(id){
  watchedAccessoryJob=id;let after='';
  for(;;){
    const result=await json('/api/avatar-library/accessories/jobs/'+id+'?after='+encodeURIComponent(after));
    if(watchedAccessoryJob!==id)return;
    after=result.status;
    $('accessoryProgress').textContent=result.status==='ready'?'Fitted accessory ready. Use it to open an editable body with your current shape.':result.status==='failed'?'Fitting failed: '+result.error:result.status==='queued'?'Queued for local fitting.':'Fitting body shapes and preparing the model locally…';
    studioStatus(result.status==='ready'?'Hairstyle ready.':result.status==='failed'?'Fitting failed: '+result.error:'Fitting the selected accessory locally…',result.status==='failed');
    if(result.status==='failed'||result.status==='ready'){
      $('importAccessory').disabled=false;
      if(result.status==='ready'){readyAccessory=result;$('openAccessory').hidden=false;}
      else throw new Error(result.error||'Accessory fitting failed');
      return;
    }
  }
}
$('importAccessory').onclick=async()=>{
  const file=$('accessoryZip').files[0];if(!file){studioStatus('Choose an accessory ZIP first.',true);return;}
  $('importAccessory').disabled=true;
  try{
    await fitAccessoryBlob(file,$('accessoryKind').value);
  }catch(error){$('accessoryProgress').textContent=error.message;$('importAccessory').disabled=false;}
};
$('openAccessory').onclick=async()=>{
  if(!readyAccessory)return;
  const identity=readHumanMorphs();
  if(readyAccessory.category==='hair'){
    const option=document.createElement('option');option.value=readyAccessory.name;option.textContent=readyAccessory.name;$('hairstyle').append(option);appearanceState.hairstyle=readyAccessory.name;
  }
  await openMapper(readyAccessory.candidate_id,identity);markEdit();appearancePreview();
};
const previousAccessory=localStorage.getItem('jnsq-accessory-job');
if(previousAccessory)watchAccessory(previousAccessory).catch(error=>{$('accessoryProgress').textContent=error.message;});

const openForAssets=openMapper;
openMapper=async function(id,identity=null){
  await openForAssets(id,identity);
  if(activeCandidate!==id)return;
  const detail=await json(`/api/avatar-bodies/candidates/${id}/mapping`);
  if(activeCandidate!==id)return;
  const assets=detail.candidate.compatibility.fitted_assets||[];
  fittedOutfit=assets.find(asset=>asset.category==='clothes')?.name||'';
  const readyOutfit=readyAccessory?.candidate_id===id?readyAccessory.outfit:'';
  const separates=wardrobeItems.find(item=>item.pieces&&(item.candidate_id===id||readyOutfit==='separates:'+item.top+':'+item.bottom));
  $('separateColors').disabled=!separates;
  if(separates){fittedOutfit='separates:'+separates.top+':'+separates.bottom;$('separateTop').value=separates.top;$('separateBottom').value=separates.bottom;}
  const labels={short01:'Short — classic',short02:'Short — cut 2',short03:'Short — cut 3',short04:'Short — cut 4',bob01:'Bob — classic',bob02:'Bob — cut 2',afro01:'Afro',braid01:'Braid',long01:'Long',ponytail01:'Ponytail',wdg_scruffy_beard:'Scruffy beard',rehmanpolanski_moustache_viking:'Viking moustache',rehmanpolanski_beard_viking:'Viking beard',grinsegold_beard_sigmund_wip:'Sigmund beard',culturalibre_faun_beard:'Faun beard'};
  for(const [key,category,none] of [['hairstyle','hair','No hair'],['eyebrows','eyebrows','No eyebrows'],['beard','beard','Clean shaven']]){
    const names=[...new Set(assets.filter(asset=>asset.category===category).map(asset=>asset.name))];
    if(key==='hairstyle')availableHairstyles=new Set(names);
    const browName=name=>name==='eyebrow001'?'Natural':name==='eyebrow009'?'Defined':'Brow style '+Number(name.replace('eyebrow',''));
    $(key).innerHTML=names.map(name=>`<option value="${esc(name)}">${esc(category==='eyebrows'?browName(name):labels[name]||extraHairItems.find(item=>item.id===name)?.name||name.replaceAll('_',' '))}</option>`).join('')+`<option value="none">${none}</option>`;
    if(appearanceState[key]!=='none'&&!names.includes(appearanceState[key])){
      const missing=document.createElement('option');missing.value=appearanceState[key];missing.textContent=appearanceState[key]+' (not in this model)';missing.disabled=true;$(key).append(missing);
    }
  }
  mergeHairChoices();paintAppearance();$('wardrobe').value=wardrobeItems.find(item=>item.candidate_id===id||item.asset===fittedOutfit)?.candidate_id||'';
  const supported=new Set(activeHumanMorphs.map(([key])=>key));
  $('shapePreset').disabled=!activeHumanMorphs.length;
  $('humanReset').disabled=!activeHumanMorphs.length;
  for(const select of document.querySelectorAll('[data-feature-preset]')){
    select.disabled=!featureKeys[select.dataset.featurePreset].every(key=>supported.has(key));
    select.title=select.disabled?'Choose an updated starting model to use these feature shapes.':'';
  }
};
const showWithPresets=showHumanGroup;
showHumanGroup=function(group){showWithPresets(group);faceChoice.hidden=group!=='face';$('shapePreset').parentElement.hidden=group!=='body';};
faceChoice.hidden=true;

const featureChoices={
  Eyes:{Balanced:{eye_openness:.43},Round:{eye_size:.56,eye_openness:.64},Almond:{eye_openness:.32,eye_tilt:.55},Upturned:{eye_tilt:.68,eye_openness:.4}},
  Nose:{Straight:{},Upturned:{nose_tip_angle:.8,nose_curve:.3,nose_size:.4},Convex:{nose_curve:.8,nose_projection:.7,nose_tip_angle:.4},Broad:{nostril_width:.8,nose_size:.65,nose_projection:.4}},
  Lips:{Balanced:{},Full:{upper_lip_volume:.85,lower_lip_volume:.85,mouth_width:.55},Slender:{upper_lip_volume:.2,lower_lip_volume:.25},'Defined bow':{cupids_bow:.85,upper_lip_volume:.6,lower_lip_volume:.65}},
  Jaw:{Balanced:{},Soft:{jaw_definition:.2,jaw_width:.45,chin_height:.4},Angular:{jaw_definition:.85,jaw_width:.7,jaw_angle:.65},Tapered:{jaw_width:.25,chin_height:.65,chin_projection:.6}}
};
const featureKeys={Eyes:['eye_angle','inner_eye_fold','inner_lid_opening','outer_lid_opening','eye_size','eye_spacing','eye_openness','eye_tilt','eyelid_fold','eyelid_fold_height','lower_lid_volume'],Nose:['nose_bridge_width','nose_tip_width','nostril_flare','lower_nose_projection','nose_size','nose_curve','nose_tip_angle','nostril_angle','nostril_width','nose_projection','nose_vertical','septum_angle'],Lips:['upper_lip_height','lower_lip_height','mouth_width','upper_lip_volume','lower_lip_volume','cupids_bow'],Jaw:['jaw_corner','jaw_width','jaw_angle','jaw_projection','jaw_definition','chin_height','chin_projection']};
Object.assign(featureChoices.Eyes,{
  'Defined lids':{eyelid_fold:.78,eyelid_fold_height:.58,lower_lid_volume:.36,eye_openness:.4},
  'Soft hooded lids':{eyelid_fold:.28,eyelid_fold_height:.32,lower_lid_volume:.55,eye_openness:.38},
  Downturned:{eye_tilt:.34,eye_openness:.43},'Wide set':{eye_spacing:.72,eye_size:.53,eye_openness:.43},
  'Close set':{eye_spacing:.2,eye_size:.5},Large:{eye_size:.82,eye_openness:.65},
  Narrow:{eye_size:.46,eye_openness:.25},'Soft almond':{eye_openness:.38,eye_tilt:.5,eye_size:.55},
  'Relaxed lids':{eye_size:.52,eye_openness:.24,eye_tilt:.5},
  'Gently rounded':{eye_size:.52,eye_openness:.56,eye_tilt:.48},
  'Long almond':{eye_size:.62,eye_openness:.27,eye_tilt:.55},
  'Soft downturned':{eye_size:.53,eye_openness:.38,eye_tilt:.39}
});
Object.assign(featureChoices.Nose,{
  Petite:{nose_size:.23,nostril_width:.35,nose_projection:.35},
  Button:{nose_size:.35,nose_tip_angle:.72,nose_projection:.32,nostril_width:.45},
  Aquiline:{nose_curve:.85,nose_projection:.82,nose_tip_angle:.3},
  'Long straight':{nose_vertical:.8,nose_projection:.65,nose_curve:.5},
  'Wide rounded':{nostril_width:.85,nose_size:.7,nose_tip_angle:.58,nose_curve:.35},
  'Narrow projected':{nostril_width:.25,nose_projection:.82,nose_size:.5}
});
Object.assign(featureChoices.Lips,{
  'Full lower lip':{upper_lip_volume:.45,lower_lip_volume:.9,cupids_bow:.55},
  'Full upper lip':{upper_lip_volume:.85,lower_lip_volume:.5,cupids_bow:.65},
  Wide:{mouth_width:.82,upper_lip_volume:.5,lower_lip_volume:.55},
  Petite:{mouth_width:.25,upper_lip_volume:.42,lower_lip_volume:.5},
  'Soft full':{upper_lip_volume:.78,lower_lip_volume:.8,cupids_bow:.2},
  'Small bow':{mouth_width:.35,cupids_bow:.9,upper_lip_volume:.65,lower_lip_volume:.55}
});
Object.assign(featureChoices.Jaw,{
  Square:{jaw_width:.85,jaw_definition:.75,chin_height:.4,jaw_angle:.6},
  Rounded:{jaw_width:.6,jaw_definition:.15,chin_height:.35,jaw_angle:.35},
  'Long tapered':{jaw_width:.3,chin_height:.85,chin_projection:.6,jaw_definition:.5},
  'Strong chin':{chin_projection:.85,chin_height:.65,jaw_definition:.68,jaw_projection:.62},
  'Short soft':{chin_height:.2,jaw_definition:.25,jaw_width:.45,chin_projection:.4},
  'Broad defined':{jaw_width:.9,jaw_definition:.9,jaw_projection:.65,chin_height:.55}
});
// Distinct silhouettes, not small variations of the same central opening.
featureChoices.Eyes={
 Balanced:{eye_openness:.5},
 Round:{eye_size:.6,eye_openness:.76,inner_lid_opening:.65,outer_lid_opening:.68,eyelid_fold:.65},
 Almond:{eye_openness:.35,inner_lid_opening:.35,outer_lid_opening:.42,eye_angle:.58,eyelid_fold:.65},
 Upturned:{eye_angle:.82,eye_openness:.38,inner_lid_opening:.32,outer_lid_opening:.48},
 Downturned:{eye_angle:.18,eye_openness:.43,inner_lid_opening:.55,outer_lid_opening:.38},
 'Low folded lids':{eyelid_fold:.12,eyelid_fold_height:.18,inner_eye_fold:.2,eye_openness:.33,inner_lid_opening:.35,outer_lid_opening:.36},
 'High defined fold':{eyelid_fold:.9,eyelid_fold_height:.8,eye_openness:.53,lower_lid_volume:.25},
 'Relaxed narrow':{eye_openness:.15,inner_lid_opening:.35,outer_lid_opening:.25,eyelid_fold:.7,lower_lid_volume:.6},
 'Large open':{eye_size:.8,eye_openness:.7,inner_lid_opening:.6,outer_lid_opening:.65},
 'Small rounded':{eye_size:.2,eye_openness:.7,inner_lid_opening:.6,outer_lid_opening:.6},
 'Wide set almond':{eye_spacing:.82,eye_openness:.3,inner_lid_opening:.3,outer_lid_opening:.4,eye_angle:.63},
 'Close set open':{eye_spacing:.18,eye_openness:.62,inner_lid_opening:.6,outer_lid_opening:.55},
 'Full lower lids':{eye_openness:.38,lower_lid_volume:.9,eyelid_fold:.7,eyelid_fold_height:.38}
};
Object.assign(featureChoices.Nose,{
 Button:{nose_size:.28,nose_tip_angle:.82,lower_nose_projection:.32,nose_tip_width:.64,nose_bridge_width:.32,nostril_flare:.35},
 Aquiline:{nose_curve:.9,nose_projection:.8,lower_nose_projection:.78,nose_tip_angle:.25,nose_bridge_width:.35,nose_tip_width:.4},
 'Wide rounded':{nose_size:.68,nostril_width:.85,nose_tip_width:.85,nose_bridge_width:.7,nostril_flare:.75,nose_curve:.3},
 'Narrow projected':{nose_bridge_width:.18,nose_tip_width:.25,lower_nose_projection:.88,nose_projection:.65,nostril_width:.3},
 'Broad low bridge':{nose_bridge_width:.85,nose_tip_width:.7,nose_projection:.25,lower_nose_projection:.5,nostril_flare:.7},
 'Soft rounded':{nose_curve:.25,nose_tip_width:.78,nose_bridge_width:.55,nose_tip_angle:.65,nostril_flare:.35},
 'Rounded bulb tip':{nose_tip_width:.95,nose_bridge_width:.38,nose_curve:.35,lower_nose_projection:.7,nostril_width:.6},
 Angular:{nose_bridge_width:.4,nose_tip_width:.22,nose_curve:.72,nose_projection:.65,lower_nose_projection:.8,nostril_flare:.25},
 'Bony bridge':{nose_bridge_width:.28,nose_tip_width:.28,nose_curve:.95,nose_projection:.72,lower_nose_projection:.65,nose_tip_angle:.32,nostril_flare:.2},
 'Long lower nose':{lower_nose_projection:1.2,nose_projection:.5,nose_tip_width:.4,nose_tip_angle:.45}
});
Object.assign(featureChoices.Lips,{
 Thin:{upper_lip_height:.08,lower_lip_height:.15,upper_lip_volume:.3,lower_lip_volume:.3,cupids_bow:.65},
 'Full lower lip':{upper_lip_height:.3,lower_lip_height:.82,upper_lip_volume:.4,lower_lip_volume:.85,cupids_bow:.6},
 'Full upper lip':{upper_lip_height:.82,lower_lip_height:.35,upper_lip_volume:.8,lower_lip_volume:.45,cupids_bow:.72},
 'Wide thin':{mouth_width:.85,upper_lip_height:.18,lower_lip_height:.23,upper_lip_volume:.28,lower_lip_volume:.35},
 'Small bow':{mouth_width:.27,upper_lip_height:.65,lower_lip_height:.6,cupids_bow:.9,upper_lip_volume:.6,lower_lip_volume:.55}
});
Object.assign(featureChoices.Jaw,{
 Square:{jaw_width:.85,jaw_corner:.9,jaw_definition:.8,chin_height:.35,jaw_angle:.65},
 Rounded:{jaw_width:.6,jaw_corner:.12,jaw_definition:.12,chin_height:.28,jaw_angle:.28},
 'Long tapered':{jaw_width:.2,jaw_corner:.4,chin_height:.88,chin_projection:.62,jaw_definition:.7},
 'Broad defined':{jaw_width:.9,jaw_corner:.92,jaw_definition:.9,jaw_projection:.65,chin_height:.55}
});
featureKeys.Brows=['brow_height','brow_angle','brow_projection','brow_width','brow_arch','brow_hair_thickness','brow_hair_length'];
featureChoices.Brows={
 Natural:{},Straight:{brow_arch:.12,brow_angle:.5},
 'Soft arch':{brow_arch:.72,brow_height:.58},
 'High arch':{brow_arch:.95,brow_height:.65,brow_hair_thickness:.35},
 Upturned:{brow_angle:.85,brow_arch:.6},Downturned:{brow_angle:.15,brow_arch:.45},
 'Strong ridge':{brow_projection:.9,brow_height:.38,brow_width:.65},
 'Wide and full':{brow_width:.8,brow_hair_thickness:.9,brow_hair_length:.7},
 'Fine and short':{brow_hair_thickness:.1,brow_hair_length:.1,brow_arch:.65},
 'Low and straight':{brow_height:.2,brow_arch:.1,brow_projection:.65}
};
const featurePanel=document.createElement('div');featurePanel.hidden=true;featurePanel.id='featurePresets';
featurePanel.innerHTML=Object.entries(featureChoices).map(([group,choices])=>`<label>${group} starting point<select data-feature-preset="${group}"><option value="">Choose ${group.toLowerCase()}</option>${Object.keys(choices).map(name=>`<option>${name}</option>`).join('')}</select></label>`).join('');
faceChoice.after(featurePanel);
for(const select of featurePanel.querySelectorAll('select'))select.onchange=()=>{
  if(!select.value)return;
  const group=select.dataset.featurePreset;
  oldRestoreHuman({...readHumanMorphs(),...Object.fromEntries(featureKeys[group].map(key=>[key,.5])),...featureChoices[group][select.value]});commitEdit();
};
const showWithFeatures=showHumanGroup;
showHumanGroup=function(group){showWithFeatures(group);featurePanel.hidden=group!=='face';};


// An explicit geometry upgrade preserves a loaded design instead of starting over.
const shapeUpgradeButton=document.createElement('button');
shapeUpgradeButton.id='upgradeFaceGeometry';shapeUpgradeButton.textContent='Add the latest facial controls to this design';
shapeUpgradeButton.hidden=true;featurePanel.before(shapeUpgradeButton);
let shapeUpgradeIds={};
const refreshShapeUpgrade=()=>{shapeUpgradeButton.hidden=!shapeUpgradeIds[activeCandidate];};
fetch('/3d/designer/shape-upgrades.json').then(r=>r.ok?r.json():{}).then(ids=>{shapeUpgradeIds=ids;refreshShapeUpgrade();}).catch(()=>{});
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===$('previewFrame').contentWindow&&event.data?.type==='jnsq-human-morph-ready')refreshShapeUpgrade();});
shapeUpgradeButton.onclick=async()=>{
 const target=shapeUpgradeIds[activeCandidate];if(!target)return;
 const identity=readHumanMorphs(),appearance={...appearanceState};shapeUpgradeButton.disabled=true;
 try{await openMapper(target,identity);if(activeCandidate!==target)throw Error('The upgraded model could not open.');appearanceState=appearance;paintAppearance();appearancePreview();markEdit();refreshShapeUpgrade();studioStatus('Facial controls updated. Your shape and appearance are preserved; save to keep this version.');}
 catch(error){studioStatus(error.message,true);}finally{shapeUpgradeButton.disabled=false;}
};

// Keep existing inputs and handlers: folding a feature never resets its values.
const faceSections=[
 {id:'character',title:'Character structure & age',keys:['character_heart','character_oval','character_square','character_fine','character_round','character_aquiline','character_age']},
 {id:'fantasy',title:'Fantasy anatomy',keys:['ear_point','ear_sweep','ear_round','fangs','tusks','horns','tail']},
 {id:'eyes',title:'Eyes & eyelids',preset:'Eyes',keys:['eye_socket_depth','eye_size','eye_spacing','eye_angle','eye_tilt','eye_openness','inner_lid_opening','outer_lid_opening','inner_eye_fold','eyelid_fold','eyelid_fold_height','lower_lid_volume']},
 {id:'brows',title:'Brows · bone & hair',preset:'Brows',keys:['brow_height','brow_angle','brow_projection','brow_width','brow_arch','brow_hair_thickness','brow_hair_length']},
 {id:'nose',title:'Nose',preset:'Nose',keys:['nose_size','nose_vertical','nose_projection','lower_nose_projection','nose_bridge_width','nose_tip_width','nose_tip_roundness','nose_curve','nose_tip_angle','nostril_width','nostril_flare','nostril_angle','septum_angle']},
 {id:'mouth',title:'Lips & mouth',preset:'Lips',keys:['mouth_corner_shape','mouth_position','mouth_width','philtrum_depth','lip_height','upper_lip_height','lower_lip_height','upper_lip_volume','lower_lip_volume','cupids_bow','lip_taper','lip_projection']},
 {id:'cheeks',title:'Cheeks, folds & temples',keys:['cheekbones','cheekbone_height','cheek_volume','nasolabial_definition','midface_projection','temple_definition']},
 {id:'jaw',title:'Jaw, chin & neck',preset:'Jaw',keys:['jowl_volume','double_chin_volume','neck_fullness','under_jaw_fullness','jaw_width','jaw_corner','jaw_definition','jaw_angle','jaw_projection','chin_height','chin_projection']},
 {id:'contour',title:'Face contour & ears',keys:['forehead_slope','facial_definition','ear_size']}
];
const faceSectionOpen=new Map();
const featurePresetLabels=new Map([...featurePanel.querySelectorAll('select')].map(select=>[select.dataset.featurePreset,select.closest('label')]));
Object.assign(APPEARANCE_DEFAULT,{brow_color:'#ffffff',brow_density:1});
appearanceState={...APPEARANCE_DEFAULT,...appearanceState};
const browHairFields=document.createElement('div');browHairFields.className='face-feature-fields';
browHairFields.append($('eyebrows').closest('label'));
const browFinish=document.createElement('div');
browFinish.innerHTML='<label>Brow color<input type="color" data-appearance="brow_color" aria-label="Brow color" value="#ffffff"></label><label>Brow density<input type="range" data-appearance="brow_density" aria-label="Brow density" min="0" max="1" step="0.05" value="1"></label><p class="quiet">Brow color is independent of hair color, including white. Density fades the hairs; thickness changes their shape. Brow span and arch shape the underlying ridge as well as the hairs.</p>';
browHairFields.append(browFinish);
// Keep the existing selector reachable while the first model is loading.
featurePanel.append(browHairFields);
for(const input of browFinish.querySelectorAll('[data-appearance]'))input.oninput=()=>{appearanceState[input.dataset.appearance]=input.type==='range'?Number(input.value):input.value;appearancePreview();commitEdit();};
const browShortcut=document.createElement('button');browShortcut.type='button';browShortcut.textContent='Brow shape, style and color';
browShortcut.onclick=()=>{showHumanGroup('face');const section=document.querySelector('[data-face-section="brows"]');if(section){section.open=true;section.scrollIntoView({block:'nearest'});}};
$('appearanceHair').querySelector('.appearance-section-body').append(browShortcut);
function arrangeFaceSections(){
 const host=$('humanMorphFields');
 const inputs=new Map([...host.querySelectorAll('[data-human-morph]')].map(input=>[input.dataset.humanMorph,input.closest('label')]));
 const assigned=new Set(faceSections.flatMap(section=>section.keys));
 for(const section of faceSections){
  const keys=section.id==='contour'?[...section.keys,...[...inputs.keys()].filter(key=>!bodyControls.has(key)&&!assigned.has(key))]:section.keys;
  const labels=keys.filter(key=>inputs.has(key)).map(key=>inputs.get(key));
  if(!labels.length)continue;
  const details=document.createElement('details');details.className='face-feature-section';details.dataset.faceSection=section.id;
  details.open=faceSectionOpen.get(section.id)??false;details.hidden=humanGroup!=='face';
  const summary=document.createElement('summary');summary.textContent=section.title;details.append(summary);
  const fields=document.createElement('div');fields.className='face-feature-fields';
  const preset=featurePresetLabels.get(section.preset);if(preset)fields.append(preset);
  fields.append(...labels);if(section.id==='brows')fields.append(browHairFields);
  if(section.id==='nose'){
   const help=document.createElement('p');help.className='quiet';help.textContent='Lower nose projection reaches 125% for extra length below the bridge. 50% is neutral. Updated models keep the philtrum steadier as the nose projects.';fields.append(help);
  }
  if(section.id==='cheeks'){
   const help=document.createElement('p');help.className='quiet';help.textContent='Fold definition shapes the creases from the sides of the nose toward the mouth. Midface projection moves the inner cheeks and mouth area inward or outward; nose projection remains separate.';fields.append(help);
  }
  details.append(fields);host.append(details);
  details.ontoggle=()=>{if(details.isConnected)faceSectionOpen.set(section.id,details.open);};
 }
}
const paintBeforeFaceSections=paintHumanMorphs;
paintHumanMorphs=function(...args){paintBeforeFaceSections(...args);arrangeFaceSections();};
const showBeforeFaceSections=showHumanGroup;
showHumanGroup=function(group){showBeforeFaceSections(group);document.querySelectorAll('[data-face-section]').forEach(section=>section.hidden=group!=='face');};
const faceSectionStyle=document.createElement('style');
faceSectionStyle.textContent=`#humanMorphFields .face-feature-section{border:1px solid #45614f;border-radius:12px;padding:0;background:#14271e;margin:0}#humanMorphFields .face-feature-section>summary{padding:.85rem 1rem;font-weight:650;cursor:pointer}#humanMorphFields .face-feature-fields{display:grid;gap:.8rem;padding:0 .8rem .8rem}#humanMorphFields .face-feature-section[hidden]{display:none!important}`;
document.head.append(faceSectionStyle);
arrangeFaceSections();


