// Authored starting recipes, independent of complexion and body.
export const faceStarters=[{"name": "Atlas \u00b7 broad angular", "head": {}, "fine": {"head_atlas": 1, "mouth_straight": 1}}, {"name": "Rowan \u00b7 lean defined", "head": {}, "fine": {"head_rowan": 1, "mouth_bow": 1}}, {"name": "Ellis \u00b7 soft broad", "head": {}, "fine": {"head_ellis": 1, "mouth_full": 1}}];
export const featureStarters={
 'Nose':[{name:'Straight & defined',fine:{nose_curve:.5,nose_bridge_planes:.9,nose_tip_roundness:.35}},{name:'Soft & upturned',fine:{nose_apex_angle:.8,nose_tip_roundness:.8,nose_bridge_height:.4}},{name:'Prominent bridge',fine:{nose_bridge_height:.85,nose_bridge_planes:.75,nose_apex_angle:.4}}],
 'Brows':[{name:'Low & straight',fine:{brow_height:.3,brow_arch:.2}},{name:'High arch',fine:{brow_height:1.25,brow_arch:.85}},{name:'Wide & lifted',fine:{brow_height:1,brow_width:.8,brow_arch:.6}}],
 'Eyes & eyelids':[{name:'Neutral eyes',fine:{}},{name:'Open eyes',fine:{eye_size:.7}},{name:'Smaller eyes',fine:{eye_size:.3}}],
 'Lips & mouth':[{name:'Straight sculpt',fine:{mouth_straight:1}},{name:'Full sculpt',fine:{mouth_full:1}},{name:'Bow sculpt',fine:{mouth_bow:1}},{name:'Neutral mouth',fine:{}},{name:'Lifted corners',fine:{mouth_corner_tilt:.75}},{name:'Downturned corners',fine:{mouth_corner_tilt:.25}}],
 'Jaw & chin':[{name:'Angular chin',fine:{jaw_planes:.85,chin_planes:.85,chin_width:.65}},{name:'Soft chin',fine:{jaw_planes:.35,chin_planes:.3,chin_width:.4}},{name:'Broad cleft chin',fine:{chin_width:.8,chin_cleft:.85}}],
 'Cheeks & temples':[{name:'Soft cheeks',fine:{cheek_planes:.2}},{name:'Defined cheek planes',fine:{cheek_planes:.9}}],
 'Forehead & face contour':[{name:'Upright forehead',fine:{forehead_slope:.15}},{name:'Sloped forehead',fine:{forehead_slope:.85}},{name:'Broad forehead',fine:{forehead_width:.8}}]
};
export function applyFaceStarter(state,preset,controls,isBody){for(const id in state.head)state.head[id]=preset.head[id]||0;state.headRegions={};for(const [id]of controls)if(!isBody.has(id))state.fine[id]=preset.fine[id]??.5;}
export function applyFeatureStarter(state,preset,group,controls,featureOf){for(const [id]of controls)if(featureOf(id)===group)state.fine[id]=preset.fine[id]??.5;}
