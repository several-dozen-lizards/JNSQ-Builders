// Editable starting proportions, not restrictions on subsequent choices.
export const startingPresets=[
 {id:'male',name:'Male',head:{broad:.15},fine:{head_atlas:.9,mouth_straight:.8,shoulder_width:.65,hip_width:.45,body_frame:.6,muscularity:.6,breast_size:.15,brow_projection:.6}},
 {id:'female',name:'Female',head:{tapered:.6},fine:{head_ellis:.65,mouth_bow:.65,shoulder_width:.38,hip_width:.65,hip_depth:.6,body_frame:.42,breast_size:.7,jaw_width:.22,jaw_corner:.3,chin_width:.3,chin_height:.4,brow_projection:.2,brow_arch:.65,brow_hair_thickness:.35,eye_openness:.58}},
 {id:'andro',name:'Andro',head:{tapered:.2},fine:{head_rowan:.7,head_ellis:.6,mouth_straight:.62,body_frame:.5,shoulder_width:.5,hip_width:.52,breast_size:.3,brow_projection:.4,jaw_width:.48}}
];
export function applyStartingPreset(state,preset,controls,bodyIds,scope='whole'){
 const affected=id=>scope==='whole'||(scope==='face'?!bodyIds.has(id):bodyIds.has(id));
 for(const [id]of controls)if(affected(id))state.fine[id]=preset.fine[id]??.5;
 for(const kind of scope==='whole'?['head','body']:scope==='face'?['head']:['body']){for(const id in state[kind])state[kind][id]=preset[kind]?.[id]??0;state[kind+'Regions']={};}
}
