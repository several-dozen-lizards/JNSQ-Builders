/* Character starts use the canonical identity, history and export path. */
(()=>{
const host=document.createElement('details');host.id='characterStarts';
host.innerHTML='<summary>Character starts & fantasy anatomy</summary><p class="quiet">Choose Editable human range in Starting model. Starts change shape only; your colors and skin features stay yours. Fantasy sliders are in Face; their neutral midpoint means no added feature.</p><label>Apply to<select id="characterScope"><option value="whole">Whole character</option><option value="face">Face only</option><option value="body">Body only</option></select></label><div id="characterStartButtons" class="studio-actions"></div><p id="characterStartStatus" class="quiet"></p>';
$('studioShapeSlot').before(host);
const review=document.createElement('a');review.href='/3d/designer/character-studies/builder-range-v2/review.html';review.target='_blank';review.rel='noopener';review.textContent='View rendered human and fantasy examples';host.append(review);
let starts=[];
const supported=()=>new Set(activeHumanMorphs.map(row=>row[0]));
const refresh=()=>{const available=supported().has('character_heart');for(const b of host.querySelectorAll('button'))b.disabled=!available;$('characterStartStatus').textContent=available?'Character shapes, ear shapes, fangs, tusks, horns and tail are available.':'Select Editable human range to use these starts.';};
fetch('/3d/designer/character-starts.json').then(r=>{if(!r.ok)throw Error('Character starts unavailable');return r.json();}).then(rows=>{starts=rows;for(const preset of starts){const button=document.createElement('button');button.type='button';button.textContent=preset.name;button.onclick=()=>{const scope=$('characterScope').value,values=readHumanMorphs();for(const [id] of activeHumanMorphs){if(id.startsWith('ear_')||['fangs','tusks','horns','tail'].includes(id))continue;if(scope==='whole'||(scope==='body')===bodyControls.has(id))values[id]=preset.fine[id]??.5;}oldRestoreHuman(values);commitEdit();};$('characterStartButtons').append(button);}refresh();}).catch(e=>{$('characterStartStatus').textContent=e.message;});
const previous=openMapper;openMapper=async function(...args){await previous(...args);refresh();};
})();
