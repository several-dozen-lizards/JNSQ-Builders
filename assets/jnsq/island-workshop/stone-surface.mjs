// Project grain from three directions to avoid stretched stone UVs.
// Wrap existing hooks so material effects and scene lighting can coexist.
export function weatherStone(material,{neutralColor=false}={}){
  const previous=material.onBeforeCompile,cache=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      varying vec3 stoneP;varying vec3 stoneN;`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      stoneP=position;stoneN=normal;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 stoneP;varying vec3 stoneN;
      vec3 stoneSample(sampler2D tex,vec3 p,vec3 w){return texture2D(tex,p.yz).rgb*w.x+texture2D(tex,p.xz).rgb*w.y+texture2D(tex,p.xy).rgb*w.z;}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 stoneW=pow(abs(normalize(stoneN)),vec3(4.));stoneW/=max(dot(stoneW,vec3(1.)),.0001);
      vec3 stoneColor=mix(stoneSample(map,stoneP*.42,stoneW),stoneSample(map,stoneP*.13+vec3(.37,.19,.61),stoneW),.3);
      ${neutralColor?'stoneColor=vec3(.48+dot(stoneColor,vec3(.2126,.7152,.0722))*.7);':''}
      float stoneLayer=sin(stoneP.y*5.+sin(stoneP.x*1.7)+sin(stoneP.z*1.3));
      diffuseColor.rgb*=stoneColor*(.94+stoneLayer*.06);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      float roughnessFactor=roughness*clamp(stoneSample(roughnessMap,stoneP*.42,stoneW).g,.65,1.);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      float stoneHeight=dot(stoneColor,vec3(.2126,.7152,.0722))*.13+stoneLayer*.018;
      vec3 stoneX=dFdx(-vViewPosition),stoneY=dFdy(-vViewPosition);
      vec3 stoneRX=cross(stoneY,normal),stoneRY=cross(normal,stoneX);
      float stoneDet=dot(stoneX,stoneRX);
      normal=normalize(abs(stoneDet)*normal-sign(stoneDet)*(dFdx(stoneHeight)*stoneRX+dFdy(stoneHeight)*stoneRY));`);
  };
  material.customProgramCacheKey=()=>cache+'-weathered-stone-v1'+(neutralColor?'-neutral':'');
}
