/* Standalone product controls, loaded only by the packaged editors. */
window.JNSQ_STANDALONE=true;
document.addEventListener('DOMContentLoaded',()=>{
  const avatar=location.pathname==='/body-workshop';
  if(avatar){
    for(const id of ['libraryMember','assignAvatar','restoreAvatar']){
      const el=document.getElementById(id);if(el)(el.closest('label')||el).hidden=true;
    }
    // Extra downloadable hair needs a fitting toolchain. Keep prepared choices usable.
    const imports=document.getElementById('appearanceImports');
    if(imports){imports.hidden=true;}
    for(const el of document.querySelectorAll('[data-accessory-shortcut]'))el.hidden=true;
    const state=document.getElementById('assignmentState');if(state)state.hidden=true;
    const use=document.getElementById('publishAvatar')?.closest('details');
    if(use){const summary=use.querySelector('summary');if(summary)summary.textContent='Finished avatars';}
  }else{
    for(const el of document.querySelectorAll('header button')){
      if(['Add to JNSQ','Remove from JNSQ'].includes(el.textContent))el.hidden=true;
    }
    for(const el of document.querySelectorAll('a[href="./room.html"]'))el.hidden=true;
  }
  const home=document.createElement('a');home.href='/';home.textContent='← Builders';
  home.style.cssText='position:fixed;right:14px;bottom:12px;z-index:10000;background:#152c30;color:#dceee4;border:1px solid #718c7c;border-radius:7px;padding:5px 12px;font:13px system-ui;text-decoration:none';document.body.append(home);
});
