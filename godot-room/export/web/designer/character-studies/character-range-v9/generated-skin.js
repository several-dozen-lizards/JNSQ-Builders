/* Generated facial artwork fitted to MakeHuman UVs. This extracts local surface
   detail, not the source face's overall lighting or complexion. */
window.avatarGeneratedSkin=(()=>{
 const assets=new Map(),fields=new Map();
 const kinds={
  'Freckles':'freckles','Forehead creases':'mature','Crow’s feet / laugh lines':'mature',
  'Under-eye fine lines':'mature','Nasolabial folds':'mature','Marionette lines':'mature',
  'Fine wrinkle set':'mature','Contour makeup':'makeup','Eye makeup':'makeup','Lip color':'makeup'
 };
 const patterns=['Mermaid scales','Dragon scales','Lizard scales','Snake scales','Fur','Rock','Cybernetics','LED markings'];
 const surfaceKinds={'Forehead creases':'forehead','Crow’s feet / laugh lines':'crow','Under-eye fine lines':'under-eye','Nasolabial folds':'nasolabial','Marionette lines':'marionette','Fine wrinkle set':'all'};
 const canvas=(w,h=w)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
 async function source(name){
  if(!assets.has(name))assets.set(name,(async()=>{
   const response=await fetch('./skin-detail/'+name+'.png');
   if(!response.ok)throw Error('Skin artwork could not load. Please retry.');
   const image=await createImageBitmap(await response.blob()),c=canvas(image.width,image.height);
   c.getContext('2d').drawImage(image,0,0);image.close();return c;
  })().catch(e=>{assets.delete(name);throw e;}));
  return assets.get(name);
 }
 const luminance=(p,i)=>p[i]*.2126+p[i+1]*.7152+p[i+2]*.0722;
 async function detail(name){
  if(!fields.has(name))fields.set(name,(async()=>{
   const c=await source(name==='mature'?'wrinkles':name),fine=canvas(c.width,c.height),fg=fine.getContext('2d');
   fg.filter=name==='makeup'?'none':'blur(1.2px)';fg.drawImage(c,0,0);
   const p=fg.getImageData(0,0,c.width,c.height).data;
   const blur=canvas(c.width,c.height),b=blur.getContext('2d');
   b.filter='blur(7px)';b.drawImage(c,0,0);const q=b.getImageData(0,0,c.width,c.height).data;
   let reference;
   if(name==='makeup'){const r=await source('reference');reference=r.getContext('2d').getImageData(0,0,r.width,r.height).data;}
   const values=new Float32Array(c.width*c.height);
   for(let j=0;j<values.length;j++){
    const i=j*4,local=luminance(q,i)-luminance(p,i);
    // Keep fine relief, remove baked broad facial shadows. Makeup retains pigment.
    values[j]=name==='mature'?Math.max(0,(250-luminance(p,i))/150):name==='makeup'?Math.max(0,(luminance(reference,i)-luminance(p,i))/75):
     Math.max(-.12,Math.min(.42,(local-(name==='freckles'?1.4:.5))/(name==='freckles'?22:38)));
   }
   return {values,w:c.width,h:c.height};
  })().catch(e=>{fields.delete(name);throw e;}));
  return fields.get(name);
 }
 function ramp(x,points){for(let i=1;i<points.length;i++)if(x<=points[i][0]){
  const [a,b]=points[i-1],[c,d]=points[i];return b+(d-b)*Math.max(0,(x-a)/(c-a));
 }return points.at(-1)[1];}
 const ux=[[.625,0],[.838,.442],[.880,.546],[.908,.637],[.995,1]];
 const vy=[[.15,0],[.336,.14],[.446,.40],[.481,.5],[.52,.62],[.622,.885],[.82,1]];
 function oval(x,y,cx,cy,rx,ry){const d=Math.hypot((x-cx)/rx,(y-cy)/ry);return Math.max(0,Math.min(1,(1-d)*4));}
 function mask(kind,x,y){
  const pair=(cx,cy,rx,ry)=>Math.max(oval(x,y,cx,cy,rx,ry),oval(x,y,cx,1-cy,rx,ry));
  const forehead=oval(x,y,.30,.5,.12,.23),crow=pair(.455,.255,.085,.065),under=pair(.50,.365,.055,.095);
  const folds=pair(.615,.405,.080,.055),corners=pair(.69,.418,.065,.045);
  const cheeks=pair(.565,.30,.12,.12);
  let value=0;
  switch(kind){
   case 'Forehead creases':value=forehead;break;
   case 'Crow’s feet / laugh lines':value=crow;break;
   case 'Under-eye fine lines':value=under;break;
   case 'Nasolabial folds':value=folds;break;
   case 'Marionette lines':value=corners;break;
   case 'Fine wrinkle set':value=Math.max(forehead,crow,under,folds,corners);break;
   case 'Freckles':value=Math.max(cheeks,oval(x,y,.54,.5,.045,.17));break;
   case 'Contour makeup':value=cheeks;break;
   case 'Eye makeup':return pair(.415,.38,.04,.085);
   case 'Lip color':return oval(x,y,.637,.5,.029,.083);
  }
  // Protect eye apertures, nostrils and lips from unrelated pigment/creases.
  return value*(1-pair(.443,.38,.044,.079))*(1-oval(x,y,.637,.5,.032,.09))*(1-oval(x,y,.558,.5,.018,.065));
 }
 async function apply(context,layer,width,height){
  if(layer.art==='surface-v2'){
   const atlas=await source('surface-v2-'+surfaceKinds[layer.kind]),c=canvas(width,height),g=c.getContext('2d');
   g.drawImage(atlas,0,0,width,height);
   const maskPixels=g.getImageData(0,0,width,height).data,pixels=context.getImageData(0,0,width,height),p=pixels.data;
   const rgb=[1,3,5].map(i=>parseInt(layer.color.slice(i,i+2),16));
   for(let i=0;i<p.length;i+=4){const a=(1-maskPixels[i]/255)*layer.alpha;
    for(let k=0;k<3;k++)p[i+k]=Math.round(p[i+k]*(1-a*(1-rgb[k]/255)));
   }
   context.putImageData(pixels,0,0);return;
  }
  const f=await detail(kinds[layer.kind]),pixels=context.getImageData(0,0,width,height),p=pixels.data;
  const rgb=[1,3,5].map(i=>parseInt(layer.color.slice(i,i+2),16));
  for(let y=Math.floor(height*.27);y<height*.73;y++){
   const sy=1-ramp(1-(y+.5)/height,vy),iy=Math.max(0,Math.min(f.h-1,Math.round(sy*(f.h-1))));
   for(let x=Math.floor(width*.70);x<width*.96;x++){
    const sx=ramp((x+.5)/width,ux),m=mask(layer.kind,sx,sy);if(m<=0)continue;
    const ix=Math.max(0,Math.min(f.w-1,Math.round(sx*(f.w-1))));
    const alpha=Math.min(.75,f.values[iy*f.w+ix]*m*layer.alpha),i=(y*width+x)*4;
    // Multiplicative tint carries the selected complexion through even dark skin.
    for(let k=0;k<3;k++)p[i+k]=Math.round(p[i+k]*(1-alpha*(1-rgb[k]/255)));
   }
  }
  context.putImageData(pixels,0,0);
 }
 async function pattern(layer){
  const index=patterns.indexOf(layer.kind),marking=index<0;
  const atlas=await source(marking?'markings':'fantasy'),c=canvas(512),g=c.getContext('2d');
  const columns=marking?2:4,rows=marking?1:2,tile=marking?(layer.kind==='Vitiligo'?0:1):index;
  g.drawImage(atlas,(tile%columns)*atlas.width/columns,Math.floor(tile/columns)*atlas.height/rows,atlas.width/columns,atlas.height/rows,0,0,512,512);
  if(!marking&&layer.size!==1){const tileCanvas=canvas(512);tileCanvas.getContext('2d').drawImage(c,0,0);g.clearRect(0,0,512,512);g.save();g.scale(layer.size,layer.size);g.fillStyle=g.createPattern(tileCanvas,'repeat');g.fillRect(0,0,512/layer.size,512/layer.size);g.restore();}
  const im=g.getImageData(0,0,512,512),p=im.data,rgb=[1,3,5].map(i=>parseInt(layer.color.slice(i,i+2),16));
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
   const i=(y*512+x)*4,l=luminance(p,i)/255;
   const edge=Math.min(1,Math.max(0,(1-Math.hypot((x-256)/256,(y-256)/256))*5));
   const a=marking?l:layer.kind==='LED markings'?l:1-l;
   p[i+3]=Math.round(a*edge*255);for(let k=0;k<3;k++)p[i+k]=rgb[k];
  }
  g.putImageData(im,0,0);return c;
 }
 return {surfaceSupports:kind=>Object.hasOwn(surfaceKinds,kind),supports:kind=>Object.hasOwn(kinds,kind),patternSupports:kind=>patterns.includes(kind)||['Vitiligo','Scar'].includes(kind),apply,pattern};
})();
