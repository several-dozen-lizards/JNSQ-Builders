/** Scope-safe character starts. No appearance, expression or resident edits. */
export const rangeBodyControls = new Set(['body_softness','body_power']);
export function applyCharacter(state,preset,controls,bodyFine,scope='whole') {
  if(!['whole','face','body'].includes(scope)) throw Error('Unknown character scope');
  const body=id=>bodyFine.has(id)||rangeBodyControls.has(id);
  const selected=id=>scope==='whole'||(scope==='body')===body(id);
  for(const [id] of controls) if(selected(id)) state.fine[id]=preset.fine[id]??.5;
  for(const kind of ['head','body']) if(scope==='whole'||(scope==='body')===(kind==='body')) {
    for(const id of Object.keys(state[kind])) state[kind][id]=0;
    state[kind+'Regions']={};
  }
  return state;
}

export function characterCards(host,presets,state,controls,bodyFine,scope,changed) {
  host.replaceChildren();
  for(const preset of presets) {
    const button=document.createElement('button');
    const image=document.createElement('img');image.src=preset.id+'-face.png';image.alt='';
    image.style.cssText='width:100%;display:block;border-radius:4px';
    button.append(image,preset.name);button.title='Apply '+preset.name+' to the selected scope';
    button.onclick=()=>{applyCharacter(state,preset,controls,bodyFine,scope());changed();};
    host.append(button);
  }
}
