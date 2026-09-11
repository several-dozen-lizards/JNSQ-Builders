import * as THREE from './vendor/three.module.js';
import {groundSurfaceTexture} from './ground-surface.mjs';

// Existing JNSQ photographed surfaces. Colour is sRGB; other maps are data.
export function islandMaterials(renderer,invalidate,reportError){
  const loader=new THREE.TextureLoader(),textures={};
  for(const kind of ['grass','dirt','rock','tree_bark']){
    textures[kind]={};
    for(const channel of ['albedo','normal','rough']){
      const t=loader.load(new URL(`./textures/${kind}_${channel}.jpg`,import.meta.url).href,invalidate,undefined,()=>reportError('A landscape texture could not load. Reload to retry.'));
      t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      if(channel==='albedo')t.colorSpace=THREE.SRGBColorSpace;
      textures[kind][channel]=t;
    }
  }
  const terrain=new THREE.MeshStandardMaterial({roughness:1});
  const spaceMode={value:0};
  const grassTint={value:new THREE.Vector3(.74,.96,.78)},sandTint={value:new THREE.Vector3(.61,.52,.35)};
  terrain.onBeforeCompile=shader=>{
    shader.uniforms.grassTint=grassTint;shader.uniforms.sandTint=sandTint;
    shader.uniforms.spaceMode=spaceMode;shader.uniforms.groundSurface={value:groundSurfaceTexture()};
    for(const k of ['grass','dirt','rock'])for(const c of ['albedo','normal','rough'])shader.uniforms[`${k}_${c}`]={value:textures[k][c]};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec4 groundPaint;varying vec4 paintedGround;
      attribute vec4 groundExtra0,groundExtra1;varying vec4 extraGround0,extraGround1;
      varying vec3 vLandPosition;
      varying vec3 vLandNormal;`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      paintedGround=groundPaint;
      extraGround0=groundExtra0;extraGround1=groundExtra1;
      vLandPosition=(modelMatrix*vec4(position,1.0)).xyz;
      vLandNormal=normalize(mat3(modelMatrix)*normal);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec4 paintedGround;
      varying vec4 extraGround0,extraGround1;
      varying vec3 vLandPosition;
      varying vec3 vLandNormal;
      uniform sampler2D groundSurface;
      uniform sampler2D grass_albedo,grass_normal,grass_rough;
      uniform sampler2D dirt_albedo,dirt_normal,dirt_rough;
      uniform sampler2D rock_albedo,rock_normal,rock_rough;
      uniform vec3 grassTint,sandTint;uniform float spaceMode;
      float landHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float landNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(landHash(i),landHash(i+vec2(1,0)),f.x),mix(landHash(i+vec2(0,1)),landHash(i+vec2(1,1)),f.x),f.y);}
      vec3 triSample(sampler2D tex,vec3 p,vec3 w){return texture2D(tex,p.zy).rgb*w.x+texture2D(tex,p.xz).rgb*w.y+texture2D(tex,p.xy).rgb*w.z;}
      vec3 triDetail(sampler2D tex,vec3 p,vec3 w){vec2 x=texture2D(tex,p.zy).xy*2.0-1.0,y=texture2D(tex,p.xz).xy*2.0-1.0,z=texture2D(tex,p.xy).xy*2.0-1.0;return vec3(0,x.y,x.x)*w.x+vec3(y.x,0,y.y)*w.y+vec3(z.x,z.y,0)*w.z;}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      if(spaceMode>.5&&vLandPosition.y<=0.)discard;
      vec3 landN=normalize(vLandNormal);
      vec3 tw=pow(abs(landN),vec3(6.0));tw/=max(dot(tw,vec3(1)),.0001);
      float macro=landNoise(vLandPosition.xz*.055);
      float rw=1.0-smoothstep(.55,.88,abs(landN.y));
      float gw=smoothstep(.7,3.4,vLandPosition.y+(macro-.5)*2.0)*(1.0-rw);
      float sw=1.0-rw-gw;
      float extraWeight=dot(extraGround0+extraGround1,vec4(1.));
      float naturalWeight=max(0.,1.-dot(paintedGround,vec4(1.))-extraWeight);
      gw=gw*naturalWeight+paintedGround.x;
      rw=rw*naturalWeight+paintedGround.z;
      sw=sw*naturalWeight+paintedGround.y;
      float dw=paintedGround.w;
      vec2 uvGround=vLandPosition.xz*.62;
      vec4 soilDetail=texture2D(groundSurface,vLandPosition.xz*.8);
      vec4 soilBroad=texture2D(groundSurface,vLandPosition.xz*.13);
      // Close-range granular relief shares the existing mipmapped data texture.
      float nearSoil=1.-smoothstep(8.,32.,distance(cameraPosition,vLandPosition));
      vec4 microSoil=texture2D(groundSurface,vLandPosition.xz*4.7);
      vec3 uvRock=vLandPosition*.32;
      vec3 gc=mix(texture2D(grass_albedo,uvGround).rgb,texture2D(grass_albedo,uvGround*.37+vec2(.37,.71)).rgb,.3)*grassTint*(.83+macro*.3);
      float patches=landNoise(vLandPosition.xz*.19+vec2(macro*3.));
      float tufts=soilBroad.a;
      vec3 earth=texture2D(dirt_albedo,uvGround*.85).rgb*vec3(.48,.40,.27);
      gc=mix(gc,earth,smoothstep(.53,.78,patches)*.58);
      gc*=.85+tufts*.24;
      gc*=1.+nearSoil*((microSoil.g-.35)*.20+(microSoil.a-.5)*.12);
      float grains=dot(texture2D(dirt_albedo,uvGround*.85).rgb,vec3(.2126,.7152,.0722));
      vec3 sc=sandTint*(.65+grains*.9);
      vec3 rc=triSample(rock_albedo,uvRock,tw);rc=mix(vec3(dot(rc,vec3(.2126,.7152,.0722))),rc,.28)*vec3(.94,.98,1.02);
      rc=mix(rc,triSample(rock_albedo,uvRock*.41+vec3(.31,.67,.19),tw),.3);
      float strata=sin(vLandPosition.y*2.4+landNoise(vLandPosition.xz*.13)*5.);
      float fracture=1.-smoothstep(.025,.11,abs(landNoise(vLandPosition.xy*.43+vLandPosition.z*.12)-.5));
      float erosion=landNoise(vLandPosition.xz*.7+vec2(vLandPosition.y*.08));
      rc*=.83+erosion*.28+strata*.075-fracture*.15;
      float fineSoil=soilDetail.r;
      float relief=(strata*.065-fracture*.09+erosion*.1)*rw+(tufts*.052+patches*.035+fineSoil*.012)*gw+fineSoil*.009*sw;
      // Reuse photographed grain with distinct mineral, organic and snow profiles.
      float grit=soilDetail.g;
      float cells=soilBroad.g;
      float cracks=1.-smoothstep(.04,.18,cells);
      float rockyGrain=dot(rc,vec3(.2126,.7152,.0722));
      vec3 clay=vec3(.48,.17,.075)*(.75+grains*.55)*(1.-cracks*.27);
      vec3 snow=vec3(.83,.90,.98)*(.9+tufts*.1+grit*.04);
      vec3 basalt=vec3(.052,.057,.066)*(.5+rockyGrain*1.5)*(1.-cracks*.45);
      vec3 moss= mix(vec3(.075,.13,.018),vec3(.24,.32,.047),patches)*(.75+tufts*.45);
      vec3 gravel=mix(vec3(.105,.092,.075),vec3(.47,.43,.35),smoothstep(.03,.35,grit))*(.83+soilDetail.a*.3);
      vec3 ash=vec3(.24,.245,.26)*(.78+grains*.3+tufts*.12);
      vec3 alien=mix(vec3(.025,.14,.18),vec3(.10,.48,.38),cells)*(.75+grit*.25);
      vec3 enchanted=mix(vec3(.15,.045,.22),vec3(.42,.16,.44),patches)*(.8+tufts*.3);
      vec3 extras=clay*extraGround0.x+snow*extraGround0.y+basalt*extraGround0.z+moss*extraGround0.w
        +gravel*extraGround1.x+ash*extraGround1.y+alien*extraGround1.z+enchanted*extraGround1.w;
      relief+=fineSoil*.007*dw;
      relief+=nearSoil*(microSoil.g*.008+microSoil.a*.004)*(gw+dw+sw*.35);
      relief+=(-cracks*.035+grains*.045)*extraGround0.x+tufts*.008*extraGround0.y
        +(erosion*.12-cracks*.055)*extraGround0.z+tufts*.055*extraGround0.w
        +grit*.035*extraGround1.x+tufts*.015*extraGround1.y+cells*.035*extraGround1.z+tufts*.025*extraGround1.w;
      float wet=1.0-smoothstep(-.3,1.1,vLandPosition.y);
      vec3 dc=texture2D(dirt_albedo,uvGround*.85).rgb*vec3(.62,.49,.35);
      diffuseColor.rgb=(gc*gw+sc*sw+rc*rw+dc*dw+extras)*(1.0-wet*.32);
      sw+=dw;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=clamp(texture2D(grass_rough,uvGround).g*gw+texture2D(dirt_rough,uvGround*.85).g*sw+triSample(rock_rough,uvRock,tw).g*rw
        +dot(extraGround0,vec4(.92,.83,.96,1.))+dot(extraGround1,vec4(.95,1.,.65,.88)),.55,1.0);
      roughnessFactor=mix(roughnessFactor,.42,wet*.65);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec2 gd=texture2D(grass_normal,uvGround).xy*2.0-1.0,sd=texture2D(dirt_normal,uvGround*.85).xy*2.0-1.0;
      float earthMix=smoothstep(.53,.78,patches)*.58;
      vec3 detail=vec3(mix(gd,sd,earthMix).x,0,mix(gd,sd,earthMix).y)*gw*.25+vec3(sd.x,0,sd.y)*sw*.16+triDetail(rock_normal,uvRock,tw)*rw*.55;
      detail-=landN*dot(detail,landN);
      normal=normalize(mat3(viewMatrix)*normalize(landN+detail));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`vec3 reliefX=dFdx(-vViewPosition),reliefY=dFdy(-vViewPosition);
      vec3 reliefRX=cross(reliefY,normal),reliefRY=cross(normal,reliefX);
      float reliefDet=dot(reliefX,reliefRX);
      normal=normalize(max(abs(reliefDet),1e-8)*normal-sign(reliefDet)*(dFdx(relief)*reliefRX+dFdy(relief)*reliefRY));
      #include <lights_physical_fragment>`);
  };
  terrain.customProgramCacheKey=()=> 'jnsq-natural-terrain-surfaces-v4';
  function prop(kind,scale){const t=textures[kind];return new THREE.MeshStandardMaterial({map:t.albedo,normalMap:t.normal,roughnessMap:t.rough,roughness:1,normalScale:new THREE.Vector2(scale,scale)});}
  function setStyle(style){
    grassTint.value.set(...({meadow:[.66,1.05,.72],highland:[.74,.96,.78],craggy:[.82,.95,.77],tropical:[.58,1.13,.72],woodland:[.71,.96,.54],desert:[1.55,1.02,.45],savanna:[1.3,1.13,.48],rainforest:[.43,.90,.58],enchanted:[.57,.87,.93],alien:[.85,.57,1.2],fungi:[.85,.69,.94]}[style]||[.74,.96,.78]));
    sandTint.value.set(...(style==='tropical'?[.78,.7,.49]:[.61,.52,.35]));
  }
  return {terrain,rock:prop('rock',.55),bark:prop('tree_bark',.6),setStyle,setSpace:enabled=>{spaceMode.value=enabled?1:0;}};
}
