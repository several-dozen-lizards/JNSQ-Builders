/* Generated UV-fitted details and legacy/custom surface layers. Saved avatars receive the composed PNG;
   portable layer projects retain editable source and placement. */
(()=>{
const panel=document.createElement('details');panel.id='surfaceLayers';
const groups={Makeup:['Contour makeup','Eye makeup','Lip color'],Complexion:['Freckles','Vitiligo','Tan warmth','Weathering','Age spots','Rosy flush','Scar'],Lines:['Forehead creases','Crow’s feet / laugh lines','Under-eye fine lines','Nasolabial folds','Marionette lines','Fine wrinkle set'],Fantasy:['Mermaid scales','Dragon scales','Lizard scales','Snake scales','Fur','Rock','Cybernetics','LED markings']};
const labelFor=k=>({'Nasolabial folds':'Nose-to-mouth folds','Marionette lines':'Mouth-corner lines','Crow’s feet / laugh lines':'Crow’s feet','Fine wrinkle set':'Soft wrinkle set'}[k]||k);
const range=(label,key,min,max,step,value)=>`<label>${label}<output data-surface-value="${key}"></output><input aria-label="${label}" data-surface="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
panel.innerHTML=`<summary>Makeup & skin details</summary>
<p class="quiet">Facial lines follow surface-fitted Blender curves. Makeup and freckles use generated artwork fitted to the face. Choose a feature, then adjust its color and strength. Scars, pigment patches and fantasy finishes use generated decals you can position.</p>
<div class="surface-tabs" role="group" aria-label="Feature categories">${Object.keys(groups).map((g,i)=>`<button type="button" data-surface-group="${g}" aria-pressed="${i===0}">${g}</button>`).join('')}</div>
<div id="surfaceChoices" class="surface-choices"></div>
<label class="surface-upload">Tattoo or custom image<input id="surfaceImage" type="file" accept="image/png,image/jpeg,image/webp"></label>
<h4>On your skin</h4><div id="surfaceCards" class="surface-choices"></div>
<select id="surfaceList" hidden aria-label="Selected skin feature"></select><select id="surfaceKind" hidden>${Object.values(groups).flat().concat('Dimples').map(k=>`<option>${k}</option>`).join('')}</select>
<div id="surfaceEditor" hidden><h4 id="surfaceTitle"></h4>
<label>Color<input id="surfaceColor" type="color" value="#704838"></label>
${range('Strength','alpha',0,1,.01,.5)}
<label><input id="surfaceVisible" type="checkbox" checked> Show this feature</label>
<label id="surfaceTintLabel"><input id="surfaceTint" type="checkbox" checked> Recolor uploaded image</label>
<button id="surfaceRemove">Remove this feature</button>
<details class="surface-advanced"><summary>Position & fine-tuning</summary>
<label>Start placement<select id="surfaceRegion"><option>Face</option><option>Torso</option><option>Whole atlas</option></select></label>
${[['Horizontal position','x',0,1,.001,.867],['Vertical position','y',0,1,.001,.52],['Width','w',.005,1,.005,.16],['Height','h',.005,1,.005,.17],['Rotation','angle',-180,180,1,-90],['Pattern size','size',.25,3,.05,1]].map(args=>range(...args)).join('')}
<button id="surfaceUp">Bring forward</button><button id="surfaceDown">Send backward</button>
<p class="quiet">Click the map to reposition this feature. Face placement accounts for the rotated head texture.</p><canvas id="surfaceMap" width="512" height="512" style="width:100%;cursor:crosshair"></canvas>
</details></div>
<p id="surfaceStatus" class="quiet" role="status">No features added yet.</p><button id="surfaceApply" hidden>Retry applying features</button>
<details><summary>Save or open an editable feature project</summary><p class="quiet">Save design keeps the finished skin. Download this project to preserve individual editable features. Fantasy options are painted textures.</p><button id="surfaceDownload">Download feature project</button><label>Open feature project<input id="surfaceProject" type="file" accept="application/json,.json"></label></details>
<style>#surfaceLayers h4{margin:.8rem 0 .4rem}.surface-tabs,.surface-choices{display:flex;flex-wrap:wrap;gap:.4rem;margin:.6rem 0}.surface-tabs button,.surface-choices button{flex:1 1 42%;padding:.6rem;text-align:left}.surface-tabs button[aria-pressed="true"],.surface-choices button[aria-pressed="true"]{border-color:#a1e8ba;background:#274b39}.surface-upload{margin-top:.8rem}#surfaceLayers output{float:right;color:#bde5ca}.surface-advanced{margin-top:.8rem}#surfaceEditor{border-top:1px solid #45614f;padding-top:.5rem}#surfaceLayers [hidden]{display:none!important}</style>`;
document.getElementById('skinSurfaceSlot').append(panel);
let layers=[],selected=-1,base=null,baseSkin=null,lastApplied=null,busy=false,revision=0,pendingApply=false;
const el=id=>document.getElementById(id),status=s=>el('surfaceStatus').textContent=s;
const cache=new Map();
const faceDetails=new Set(['Forehead creases','Crow’s feet / laugh lines','Under-eye fine lines','Nasolabial folds','Marionette lines','Dimples','Fine wrinkle set']);
async function bitmap(url){if(!cache.has(url))cache.set(url,createImageBitmap(await(await fetch(url)).blob()));return cache.get(url);}
async function ensureBase(){if(baseSkin!==appearanceState.skin_texture&&appearanceState.skin_texture!==lastApplied){base=null;}if(base===null){baseSkin=appearanceState.skin_texture;const url=appearanceState.skin_texture?await textureURL(appearanceState.skin_texture):'/3d/designer/skin-source.png';base=await imageDataURL(await(await fetch(url)).blob());}}
function random(seed){let n=seed;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function drawPattern(layer){const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d'),r=random(layer.seed||1),s=layer.size;g.translate(256,256);g.scale(256,256);g.fillStyle=layer.color;g.strokeStyle=layer.color;g.lineWidth=.012;
const dot=(x,y,a,b=a)=>{g.beginPath();g.ellipse(x,y,a,b,0,0,Math.PI*2);g.fill();};
const line=(points,width=.015)=>{g.lineWidth=width;g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();};
const soft=(x,y,a,b)=>{g.save();g.translate(x,y);g.scale(a,b);const grad=g.createRadialGradient(0,0,0,0,0,1);grad.addColorStop(0,layer.color);grad.addColorStop(1,layer.color+'00');g.fillStyle=grad;dot(0,0,1);g.restore();};
// Smooth, tapered creases rather than constant-width painted stripes.
const crease=(points,width=.009,opacity=1)=>{
 const at=t=>{const k=1-t;return [0,1].map(i=>k*k*k*points[0][i]+3*k*k*t*points[1][i]+3*k*t*t*points[2][i]+t*t*t*points[3][i]);};
 g.save();g.lineCap='round';
 for(let i=0;i<40;i++){const t=(i+.5)/40,fade=Math.pow(Math.sin(Math.PI*t),.7);g.globalAlpha=opacity*fade*.18;line([at(i/40),at((i+1)/40)],width*s*3.4);g.globalAlpha=opacity*fade*.65;line([at(i/40),at((i+1)/40)],width*s);}
 g.restore();
};
const detail=kind=>{
 if(kind==='Forehead creases')for(let j=0;j<3;j++){const y=-.88+j*.095;crease([[-.48,y],[-.2,y-.045],[.21,y-.045],[.48,y]],.006,.75-j*.12);}
 if(kind==='Crow’s feet / laugh lines')for(const side of [-1,1])for(let j=0;j<3;j++)crease([[side*.66,-.32],[side*.73,-.34+j*.026],[side*.78,-.38+j*.062],[side*.88,-.4+j*.1]],.006,.7);
 if(kind==='Under-eye fine lines')for(const side of [-1,1])for(let j=0;j<2;j++)crease([[side*.23,-.24+j*.05],[side*.35,-.16+j*.05],[side*.53,-.15+j*.05],[side*.65,-.24+j*.05]],.005,.65);
 if(kind==='Nasolabial folds')for(const side of [-1,1])crease([[side*.16,.035],[side*.23,.11],[side*.34,.24],[side*.32,.46]],.012);
 if(kind==='Marionette lines')for(const side of [-1,1])crease([[side*.27,.4],[side*.32,.47],[side*.32,.59],[side*.28,.67]],.009,.8);
 if(kind==='Dimples')for(const side of [-1,1]){soft(side*.4,.36,.045*s,.063*s);crease([[side*.4,.29],[side*.43,.33],[side*.43,.37],[side*.4,.4]],.007,.45);}
};
if(faceDetails.has(layer.kind)){if(layer.kind==='Fine wrinkle set')for(const k of ['Forehead creases','Crow’s feet / laugh lines','Under-eye fine lines','Nasolabial folds','Marionette lines'])detail(k);else detail(layer.kind);return c;}
switch(layer.kind){
case 'Tan warmth':soft(0,0,1.35,1.35);break;
case 'Rosy flush':for(const x of [-.52,.52])soft(x,.08,.32,.24);soft(0,.02,.13,.19);break;
case 'Weathering':for(let i=0;i<90;i++){g.globalAlpha=.08+r()*.15;soft(r()*1.8-.9,r()*1.8-.9,.04+r()*.12,.03+r()*.09);}break;
case 'Age spots':for(let i=0;i<40/s;i++){g.globalAlpha=.15+r()*.5;soft(r()*1.8-.9,r()*1.8-.9,.009+r()*.026*s,.009+r()*.021*s);}break;
case 'Contour makeup':for(const x of [-.48,.48]){soft(x,.17,.25,.4);soft(x,-.38,.28,.15);}soft(0,.7,.32,.15);break;
case 'Eye makeup':for(const x of [-.44,.44])soft(x,-.37,.28,.14);break;
case 'Lip color':soft(0,.40,.27,.095);break;
case 'Freckles':for(let i=0;i<180/s;i++){const x=(r()*2-1)*.85,y=(r()-.5)*.5;g.globalAlpha=.25+r()*.75;dot(x,y,.003+r()*.012*s);}break;
case 'Vitiligo':for(let i=0;i<12/s;i++){const x=r()*1.6-.8,y=r()*1.6-.8;g.beginPath();for(let j=0;j<=40;j++){const a=j/40*Math.PI*2,d=(.09+r()*.04)*s;const p=[x+Math.cos(a)*d,y+Math.sin(a)*d];j?g.lineTo(...p):g.moveTo(...p);}g.fill();}break;
case 'Scar':line([[-.12,-.7],[.02,-.35],[-.03,.1],[.17,.65]],.022*s);g.globalAlpha=.35;line([[-.10,-.7],[.04,-.35],[-.01,.1],[.19,.65]],.012*s);break;
case 'Mermaid scales':case 'Dragon scales':case 'Lizard scales':case 'Snake scales':{
const step=.18*s;for(let row=0,y=-1;y<1.2;y+=step,row++)for(let x=-1;x<1.2;x+=step){const a=x+(row%2)*step/2;g.globalAlpha=.45+r()*.45;g.beginPath();if(layer.kind==='Mermaid scales'){g.arc(a,y,step*.62,0,Math.PI);g.stroke();}else if(layer.kind==='Lizard scales'){dot(a,y,step*.36,step*.3);}else {g.moveTo(a,y-step*.4);g.lineTo(a+step*.43,y);g.lineTo(a,y+step*(layer.kind==='Dragon scales'?.8:.45));g.lineTo(a-step*.43,y);g.closePath();g.stroke();}}break;}
case 'Fur':for(let i=0;i<600/s;i++){const x=r()*2-1,y=r()*2-1;g.globalAlpha=.2+r()*.6;line([[x,y],[x+.025*Math.sin(x*4),y+.12*s]],.003);}break;
case 'Rock':for(let i=0;i<65/s;i++){const x=r()*2-1,y=r()*2-1;g.globalAlpha=.2+r()*.5;line([[x,y],[x+.12*s,y+.05],[x+.18*s,y+.2*s]],.009*s);}break;
case 'Cybernetics':for(let i=0;i<12;i++){const x=r()*1.8-.9,y=r()*1.8-.9;line([[x,y],[x+.18*s,y],[x+.18*s,y+.25*s]],.013);dot(x,y,.025);}break;
case 'LED markings':for(let y=-.8;y<.9;y+=.22*s)for(let x=-.8;x<.9;x+=.22*s){soft(x,y,.06*s,.06*s);dot(x,y,.018*s);}break;
}return c;}
async function compose(){await ensureBase();const img=await bitmap(base);const c=document.createElement('canvas');const scale=layers.some(l=>['fitted-v1','surface-v2'].includes(l.art))?Math.max(1,2048/img.width):1;c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);const g=c.getContext('2d');g.drawImage(img,0,0,c.width,c.height);
for(const layer of layers){if(!layer.visible)continue;if(['fitted-v1','surface-v2'].includes(layer.art)&&window.avatarGeneratedSkin.supports(layer.kind)){await window.avatarGeneratedSkin.apply(g,layer,c.width,c.height);continue;}let paint;if(layer.image){paint=await bitmap(layer.image);if(layer.tint){const t=document.createElement('canvas');t.width=paint.width;t.height=paint.height;const q=t.getContext('2d');q.drawImage(paint,0,0);q.globalCompositeOperation='source-in';q.fillStyle=layer.color;q.fillRect(0,0,t.width,t.height);paint=t;}}else paint=layer.art==='pattern-v1'?await window.avatarGeneratedSkin.pattern(layer):drawPattern(layer);
g.save();g.globalAlpha=layer.alpha;g.translate(layer.x*c.width,layer.y*c.height);g.rotate(layer.angle*Math.PI/180);g.drawImage(paint,-layer.w*c.width/2,-layer.h*c.height/2,layer.w*c.width,layer.h*c.height);g.restore();}return c;}
async function preview(){const rev=++revision;try{const c=await compose();if(rev!==revision)return;const map=el('surfaceMap'),g=map.getContext('2d');g.clearRect(0,0,512,512);g.drawImage(c,0,0,512,512);const current=readAppearance(),value=await resolvedAppearance(current);if(rev!==revision)return;value.skin_texture_data=await withNasolabialShadow(c.toDataURL('image/png'),readHumanMorphs());if(rev!==revision)return;studioCommand('appearance',value);status('Preview updated · changes apply automatically.');}catch(e){status(e.message);}}
function paint(){const active=layers[selected];el('surfaceEditor').hidden=!active;el('surfaceTitle').textContent=active?labelFor(active.kind):'';el('surfaceTintLabel').hidden=!active?.image;panel.querySelector('.surface-advanced').hidden=['fitted-v1','surface-v2'].includes(active?.art);el('surfaceCards').replaceChildren();if(!layers.length)el('surfaceCards').textContent='Nothing added yet. Choose a feature above.';layers.forEach((l,i)=>{const b=document.createElement('button');b.textContent=labelFor(l.kind)+(l.visible?'':' · hidden');b.setAttribute('aria-pressed',String(i===selected));b.onclick=()=>{selected=i;paint();};el('surfaceCards').append(b);});el('surfaceList').innerHTML=layers.map((l,i)=>`<option value="${i}">${i+1}. ${l.kind}${l.visible?'':' (hidden)'}</option>`).join('')||'<option>No layers</option>';el('surfaceList').value=selected;const l=layers[selected];for(const input of panel.querySelectorAll('[data-surface]')){input.disabled=!l;if(l)input.value=l[input.dataset.surface];}for(const id of ['surfaceColor','surfaceTint','surfaceVisible','surfaceRemove','surfaceUp','surfaceDown'])el(id).disabled=!l;if(l){el('surfaceColor').value=l.color;el('surfaceTint').checked=l.tint;el('surfaceVisible').checked=l.visible;}updateValues();preview();}
function add(kind,image=null){if(layers.length>=64){status('This project has 64 features. Remove one before adding another.');return;}layers.push({kind,image,art:!image&&window.avatarGeneratedSkin.surfaceSupports(kind)?'surface-v2':!image&&window.avatarGeneratedSkin.supports(kind)?'fitted-v1':!image&&window.avatarGeneratedSkin.patternSupports(kind)?'pattern-v1':null,color:kind==='Rosy flush'?'#bd6b68':kind==='Tan warmth'?'#ad754d':kind==='Weathering'?'#89664e':kind==='Age spots'?'#78503b':kind==='Vitiligo'?'#efd9bc':kind==='Scar'?'#b58a80':kind==='Lip color'?'#b25b6c':kind==='LED markings'?'#69e8ff':faceDetails.has(kind)?'#654b43':'#704838',alpha:.65,x:.867,y:.52,w:.16,h:.17,angle:-90,size:1,visible:true,tint:!image,seed:Math.floor(Math.random()*4294967296)});selected=layers.length-1;if(kind==='Scar')Object.assign(layers[selected],{x:.877,y:.565,w:.07,h:.07,angle:0});paint();applySoon();}
function choices(group){el('surfaceChoices').replaceChildren();for(const kind of groups[group]){const button=document.createElement('button');button.textContent=labelFor(kind);button.onclick=()=>add(kind);el('surfaceChoices').append(button);}for(const b of panel.querySelectorAll('[data-surface-group]'))b.setAttribute('aria-pressed',String(b.dataset.surfaceGroup===group));}
for(const b of panel.querySelectorAll('[data-surface-group]'))b.onclick=()=>choices(b.dataset.surfaceGroup);choices('Makeup');
function updateValues(){for(const output of panel.querySelectorAll('[data-surface-value]')){const k=output.dataset.surfaceValue,v=layers[selected]?.[k];output.textContent=v==null?'':k==='angle'?Math.round(v)+'°':Math.round(v*100)+'%';}}
function applySoon(){el('surfaceApply').onclick();}
el('surfaceList').onchange=()=>{selected=Number(el('surfaceList').value);paint();};
for(const input of panel.querySelectorAll('[data-surface]'))input.oninput=()=>{if(layers[selected]){layers[selected][input.dataset.surface]=Number(input.value);updateValues();preview();}};
for(const input of panel.querySelectorAll('[data-surface]'))input.onchange=applySoon;
for(const [id,key,checked]of [['surfaceColor','color',false],['surfaceTint','tint',true],['surfaceVisible','visible',true]])el(id).oninput=()=>{if(layers[selected]){layers[selected][key]=checked?el(id).checked:el(id).value;preview();}};
for(const id of ['surfaceColor','surfaceTint','surfaceVisible'])el(id).onchange=()=>{paint();applySoon();};
el('surfaceRegion').onchange=()=>{if(!layers[selected])return;Object.assign(layers[selected],el('surfaceRegion').value==='Face'?{x:.867,y:.52,w:.16,h:.17,angle:-90}:el('surfaceRegion').value==='Torso'?{x:.38,y:.36,w:.4,h:.36,angle:0}:{x:.5,y:.5,w:1,h:1,angle:0});paint();applySoon();};
el('surfaceMap').onclick=e=>{if(!layers[selected])return;const r=e.target.getBoundingClientRect();layers[selected].x=(e.clientX-r.left)/r.width;layers[selected].y=(e.clientY-r.top)/r.height;paint();applySoon();};
el('surfaceRemove').onclick=()=>{layers.splice(selected,1);selected=Math.min(selected,layers.length-1);paint();applySoon();};
for(const [id,d]of [['surfaceUp',1],['surfaceDown',-1]])el(id).onclick=()=>{const target=selected+d;if(target<0||target>=layers.length)return;[layers[selected],layers[target]]=[layers[target],layers[selected]];selected=target;paint();applySoon();};
el('surfaceImage').onchange=async()=>{const f=el('surfaceImage').files[0];if(!f)return;try{if(f.size>16*1024*1024)throw new Error('Use an image smaller than 16 MB');const img=await createImageBitmap(f);const c=document.createElement('canvas'),scale=Math.min(1,2048/Math.max(img.width,img.height));c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);img.close();add('Custom image',c.toDataURL('image/png'));}catch(e){status(e.message);}el('surfaceImage').value='';};
el('surfaceApply').onclick=async()=>{if(busy){pendingApply=true;return;}busy=true;el('surfaceApply').disabled=true;try{const before=appearanceState.skin_texture,started=revision,c=await compose(),blob=await new Promise(r=>c.toBlob(r,'image/png'));const response=await fetch('/api/avatar-library/textures',{method:'POST',headers:{'Content-Type':'image/png'},body:blob}),data=await response.json();if(!response.ok)throw new Error(data.error);if(before!==appearanceState.skin_texture)throw new Error('Skin changed. Review it before applying layers.');if(started!==revision){pendingApply=true;return;}appearanceState.skin_texture=data.texture_id;lastApplied=data.texture_id;paintAppearance();appearancePreview();commitEdit();status('On your avatar · save your design to keep this look.');el('surfaceApply').hidden=true;}catch(e){status(e.message);el('surfaceApply').hidden=false;}finally{busy=false;el('surfaceApply').disabled=false;if(pendingApply){pendingApply=false;applySoon();}}};
el('surfaceDownload').onclick=async()=>{await ensureBase();const blob=new Blob([JSON.stringify({format:'jnsq-surface-layers/1',base,layers})],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='avatar-surface-layers.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
el('surfaceProject').onchange=async()=>{try{const f=el('surfaceProject').files[0];if(!f)return;if(f.size>48*1024*1024)throw new Error('Layer project exceeds 48 MB');const p=JSON.parse(await f.text());if(p.format!=='jnsq-surface-layers/1'||!Array.isArray(p.layers)||p.layers.length>64||!/^data:image\/png;base64,/.test(p.base))throw new Error('Invalid layer project');const allowed=[...el('surfaceKind').options].map(o=>o.value).concat('Custom image');for(const l of p.layers){if(!allowed.includes(l.kind)||!/^#[0-9a-f]{6}$/i.test(l.color)||l.image&&!/^data:image\/png;base64,/.test(l.image))throw new Error('Invalid layer');for(const [k,min,max] of [['x',0,1],['y',0,1],['w',.005,1],['h',.005,1],['alpha',0,1],['angle',-180,180],['size',.25,3]])if(!Number.isFinite(l[k])||l[k]<min||l[k]>max)throw new Error('Invalid layer placement');}base=p.base;baseSkin=appearanceState.skin_texture;layers=p.layers;selected=layers.length-1;paint();applySoon();}catch(e){status(e.message);}el('surfaceProject').value='';};
panel.ontoggle=()=>{if(panel.open){if(!layers.length&&appearanceState.skin_texture!==lastApplied)base=null;paint();}};
})();
