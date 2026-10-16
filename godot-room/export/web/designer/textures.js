/* The same baked PNGs drive preview and export; recipes keep content hashes. */
const studioTextureCache=new Map();
function imageDataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
async function textureURL(id){if(!studioTextureCache.has(id))studioTextureCache.set(id,(async()=>{const response=await fetch(id==='404c3124d841bd39938e19692c2e54b2130d572c8c6beefd973eede94f0e1b75'?'/3d/designer/eyes/natural-hazel.png':'/api/avatar-library/textures/'+id);if(!response.ok)throw new Error('Saved texture unavailable');return imageDataURL(await response.blob());})());return studioTextureCache.get(id);}
let eyeBakeKey='',eyeBakeValue=null;
let fantasyBakeKey='',fantasyBakeValue=null;
let hairBakeKey='',hairBakeValue={};
let clothingBakeKey='',clothingBakeValue={};
// Fold geometry does not imply painted wrinkles. Explicit skin layers own lines.
function nasolabialShadowAmount(identity={}){return 0;}
async function withNasolabialShadow(source,identity={}){
  return source;
}
// Parametric crease curves follow the current MakeHuman skin atlas. Multiplicative
// shading retains complexion color and grain; the baked map uses normal save/export.
async function makeEyelidFinish(source,style,strength,width=.5,height=.5){
  const url=source?await textureURL(source):'/3d/designer/skin-source.png';
  const response=await fetch(url);if(!response.ok)throw new Error('Skin map unavailable');
  const image=await createImageBitmap(await response.blob());
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);image.close();
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
  const amount=Math.max(0,Math.min(1,strength));
  for(let y=Math.floor(.445*canvas.height);y<Math.ceil(.59*canvas.height);y++)for(let x=Math.floor(.795*canvas.width);x<Math.ceil(.856*canvas.width);x++){
    const u=x/canvas.width,v=y/canvas.height;let dark=0;
    for(const center of [.480,.553]){
      const t=(v-center)/.024;if(Math.abs(t)>=1)continue;
      const envelope=Math.pow(1-t*t,1.4);
      const offset=style==='rounded'?.004:style==='tapered'?.0025+.001*t:.0015;
      const curve=.840-offset-.0015*(1-t*t)-.006*(height-.5);
      const creaseWidth=.0007+.0012*width;
      const fold=style==='shadow'?0:Math.exp(-Math.pow((u-curve)/creaseWidth,2))*.62;
      const socket=Math.exp(-Math.pow((u-(.835-.001*(1-t*t)))/.0035,2))*.24;
      dark+=amount*envelope*(fold+socket);
    }
    const i=(y*canvas.width+x)*4,factor=1-Math.min(.72,dark);
    for(let c=0;c<3;c++)data[i+c]*=factor;
  }
  ctx.putImageData(pixels,0,0);return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
}
async function resolvedAppearance(values,candidateId=typeof activeCandidate==='undefined'?null:activeCandidate,identity=typeof readHumanMorphs==='function'?readHumanMorphs():{}){
  const result={...values};
  if(candidateId){
    const key=JSON.stringify([candidateId,values.hairstyle,values.hair,values.hair_lightness,values.hair_highlight_color,values.hair_highlight_amount,values.hair_highlight_pattern]);
    if(key!==hairBakeKey){
      const response=await fetch('/api/avatar-library/hair-finish/'+candidateId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Hair finish unavailable');
      hairBakeKey=key;hairBakeValue=data;
    }
    result.hair_texture_data=hairBakeValue;
    const clothingKey=JSON.stringify([candidateId,values.outfit,values.outfit_top,values.outfit_bottom]);
    if(clothingKey!==clothingBakeKey){
      const response=await fetch('/api/avatar-library/clothing-finish/'+candidateId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Clothing finish unavailable');
      clothingBakeKey=clothingKey;clothingBakeValue=data;
    }
    result.clothing_texture_data=clothingBakeValue;
  }
  if(values.skin_texture)result.skin_texture_data=await textureURL(values.skin_texture);
  result.skin_texture_data=await withNasolabialShadow(result.skin_texture_data,identity);
  if(values.eye_style&&values.eye_style!=='original'){
    const key=JSON.stringify([values.eye_style,values.pupil_shape,values.pupil_width,values.pupil_height,values.iris_size,values.iris,values.iris_inner,values.eye_accent,values.eyes,values.eye_shading,values.iris_lightness]);
    if(key!==fantasyBakeKey){
      const response=await fetch('/api/avatar-library/eye-finish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Fantasy eye finish unavailable');
      fantasyBakeKey=key;fantasyBakeValue=data.eye_texture_data;
    }
    result.eye_texture_data=fantasyBakeValue;return result;
  }
  const shading=Math.max(0,Math.min(1,Number(values.eye_shading??.65)));
  const key=JSON.stringify([values.eye_texture||'',values.eyes,values.iris,values.iris_inner,shading,values.iris_lightness]);
  if(key!==eyeBakeKey){
    const source=values.eye_texture?await textureURL(values.eye_texture):'/3d/designer/eye-source.png';
    const image=await createImageBitmap(await (await fetch(source)).blob());
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);image.close();
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
    const color=hex=>(hex||'#ffffff').slice(1).match(/../g).map(v=>parseInt(v,16)/255);
    const iris=color(values.iris),inner=color(values.iris_inner&&values.iris_inner!=='#ffffff'?values.iris_inner:values.iris),sclera=color(values.eyes),original=new Uint8ClampedArray(data);
    const smooth=(a,b,t)=>{t=Math.max(0,Math.min(1,(t-a)/(b-a)));return t*t*(3-2*t);};
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      const u=x/canvas.width,v=y/canvas.height;
      const left=Math.hypot(u-.707,v-.298),right=Math.hypot(u-.290,v-.711);
      const rawDistance=Math.min(left,right),distance=rawDistance/.97,cy=left<right?.298:.711,cx=left<right?.707:.290,dy=v-cy,dx=u-cx;
      const offset=(y*canvas.width+x)*4;
      if(rawDistance<.125){const sx=Math.max(0,Math.min(canvas.width-1,Math.round((cx+(u-cx)/.97)*canvas.width))),sy=Math.max(0,Math.min(canvas.height-1,Math.round((cy+(v-cy)/.97)*canvas.height)));for(let c=0;c<4;c++)data[offset+c]=original[(sy*canvas.width+sx)*4+c];}
      if(distance<.112&&distance>.035){
        if((values.iris&&values.iris!=='#ffffff')||(values.iris_inner&&values.iris_inner!=='#ffffff')){
          const brightness=Math.max(data[offset],data[offset+1],data[offset+2]);
          for(let c=0;c<3;c++)data[offset+c]=brightness*(inner[c]*(1-smooth(.035,.095,distance))+iris[c]*smooth(.035,.095,distance));
        }
        const exposure=2**((Number(values.iris_lightness??.5)-.5)*3);
        for(let c=0;c<3;c++)data[offset+c]*=exposure;
      }else if(distance>=.112){
        // The globe recedes under both lids and into both canthi. Keep this
        // graded rather than painting a hard outline around the iris.
        const rim=smooth(.095,.225,distance),upper=smooth(-.015,.115,-dy);
        const corner=smooth(.10,.23,Math.abs(dx)),lower=smooth(.10,.22,dy);
        const shade=1-shading*(.10+.30*rim+.36*upper+.12*corner+.06*lower);
        for(let c=0;c<3;c++)data[offset+c]*=sclera[c]*shade;
      }
      // A real upper lid shades the cornea, iris, and pupil together. The old
      // bake exempted the iris, leaving it luminous inside a darker socket.
      if(distance<.112){
        const upper=smooth(-.015,.115,-dy),irisRim=smooth(.085,.112,distance);
        const shade=1-shading*(.02+.38*upper+.08*irisRim);
        for(let c=0;c<3;c++)data[offset+c]*=shade;
      }
    }
    ctx.putImageData(pixels,0,0);eyeBakeValue=canvas.toDataURL('image/png');eyeBakeKey=key;
  }
  result.eye_texture_data=eyeBakeValue;return result;
}
async function importStudioTexture(file,key){
  if(!file)return;
  if(file.size>32*1024*1024)throw new Error('Choose an image smaller than 32 MB.');
  const image=await createImageBitmap(file);
  const ratio=Math.min(1,2048/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const response=await fetch('/api/avatar-library/textures',{method:'POST',headers:{'Content-Type':'image/png'},body:blob});
  const data=await response.json();if(!response.ok)throw new Error(data.error);
  appearanceState[key]=data.texture_id;appearancePreview();commitEdit();paintAppearance();
  studioStatus('Custom texture added locally. Save your design to keep this selection.');
}
