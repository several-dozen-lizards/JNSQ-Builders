import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';

// One renderer serves the visible cards; the catalog does not create hundreds
// of WebGL contexts or load every model when the workshop opens.
export function furnitureGallery(container,onSelect){
  container.classList.add('furniture-gallery');container.setAttribute('role','group');container.setAttribute('aria-label','Furniture models — scroll horizontally');
  container.tabIndex=0;
  container.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey)return;
    const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
    if(!delta||container.scrollWidth<=container.clientWidth)return;
    event.preventDefault();event.stopPropagation();
    container.style.scrollSnapType='none';
    container.scrollLeft+=delta*(event.deltaMode===1?16:event.deltaMode===2?container.clientWidth:1);
  },{passive:false});
  let renderer,scene,camera,queue=[],running=false;
  const cache=new Map(),cards=new Map(),visible=new Set();
  const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){visible.add(e.target);queue.push(e.target);}else visible.delete(e.target);}void drain();},{root:container});
  function dispose(root){root.traverse(n=>{n.geometry?.dispose();for(const m of (Array.isArray(n.material)?n.material:[n.material]))if(m){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});}
  async function thumbnail(item){
    const url='/api/room-workshop/assets/objects/'+encodeURIComponent(item.filename);
    if(!item.filename.endsWith('.glb'))return url;
    if(!renderer){
      renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(192,160);renderer.setClearColor(0x15272d);renderer.toneMapping=THREE.ACESFilmicToneMapping;
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,192/160,.01,10000);
      scene.add(new THREE.HemisphereLight(0xffffff,0x68776b,2));const light=new THREE.DirectionalLight(0xffeedc,2.5);light.position.set(3,5,4);scene.add(light);
    }
    const root=(await new GLTFLoader().loadAsync(url)).scene;
    try{
      root.traverse(n=>{if(n.isLight)n.visible=false;});scene.add(root);
      const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),radius=Math.max(.1,box.getSize(new THREE.Vector3()).length()/2),distance=radius/Math.sin(THREE.MathUtils.degToRad(17.5))*1.1;
      camera.near=Math.max(.001,radius/1000);camera.far=distance+radius*10;camera.position.copy(center).add(new THREE.Vector3(1,.65,1).normalize().multiplyScalar(distance));camera.lookAt(center);camera.updateProjectionMatrix();renderer.render(scene,camera);
      return renderer.domElement.toDataURL('image/png');
    }finally{scene.remove(root);dispose(root);}
  }
  async function drain(){
    if(running)return;running=true;
    try{while(queue.length){const card=queue.shift();if(!card.isConnected||!visible.has(card)||card.dataset.loaded)continue;const item=cards.get(card);if(!item)continue;
      try{let src=cache.get(item.filename);if(!src){src=await thumbnail(item);cache.set(item.filename,src);}if(card.isConnected){card.querySelector('img').src=src;card.querySelector('img').hidden=false;card.querySelector('small').hidden=true;card.dataset.loaded='true';}}
      catch{card.querySelector('small').textContent='Preview unavailable';card.dataset.loaded='true';}
    }}finally{running=false;}
  }
  function select(filename){for(const [card,item] of cards)card.setAttribute('aria-pressed',String(item.filename===filename));}
  return {select,show(items,selected){observer.disconnect();visible.clear();queue=[];cards.clear();container.replaceChildren();container.scrollLeft=0;
    if(!items.length){container.textContent='No matching objects';return;}
    for(const item of items){const card=document.createElement('button'),img=document.createElement('img'),label=document.createElement('span'),loading=document.createElement('small');card.type='button';card.title=item.display_name;card.setAttribute('aria-label',item.display_name);img.alt='';img.hidden=true;label.textContent=item.display_name;loading.textContent='Loading preview…';card.append(img,loading,label);card.onclick=()=>{onSelect(item.filename);select(item.filename);};cards.set(card,item);container.append(card);observer.observe(card);}select(selected);
  }};
}
