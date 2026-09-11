// Stable document IDs. Existing tree/pine/palm entries retain their identity.
export const GARDEN_GROUPS={woodland_fern:'medium',meadow_grass:'low',meadow_daisies:'low',creeping_thyme:'low',wildflower_carpet:'low',lavender:'medium',flowering_heath:'medium',hibiscus_bush:'medium',firewheel_bush:'medium',pampas_grass:'large',foxglove:'large',giant_rhubarb:'large',rainbow_protea:'large'};
GARDEN_GROUPS.lady_fern='medium';GARDEN_GROUPS.sword_fern='medium';
export const GARDEN_IDS=Object.keys(GARDEN_GROUPS);
export const DEADWOOD_IDS=['tree_stump','fallen_log'];
export const SMALL_MUSHROOM_IDS=['button_mushrooms','toadstool_patch','chanterelle_patch','glowcap_patch'];
export const PLANTS = [
  ['rose_quartz','Small rose-quartz cluster'],['citrine_points','Tiny citrine points'],['emerald_shards','Small emerald shards'],
  ['glow_crystal_cyan','Glowing cyan crystal'],['glow_crystal_violet','Glowing violet cluster'],['glow_crystal_amber','Small glowing amber shards'],
  ['button_mushrooms','Woodland button mushrooms'],['toadstool_patch','Speckled red toadstools'],['chanterelle_patch','Golden funnel mushrooms'],['glowcap_patch','Tiny glowing mooncaps'],
  ['meadow_grass','Low meadow grass'],['meadow_daisies','Daisy meadow patch'],['creeping_thyme','Creeping thyme carpet'],['wildflower_carpet','Wildflower tapestry'],
  ['woodland_fern','Woodland fern'],['lavender','Lavender clump'],['flowering_heath','Blush flowering heath'],['hibiscus_bush','Scarlet hibiscus bush'],['firewheel_bush','Firewheel flower bush'],
  ['pampas_grass','Feathery pampas grass'],['foxglove','Towering foxgloves'],['giant_rhubarb','Giant umbrella-leaf plant'],['rainbow_protea','Giant rainbow protea'],
  ['tree','Oak / broadleaf'],['maple','Maple'],['pine','Pine'],
  ['lady_fern','Lacy lady fern'],['sword_fern','Upright sword fern'],
  ['tree_stump','Weathered tree stump'],['fallen_log','Mossy fallen trunk'],
  ['sycamore','Sycamore'],['palm','Palm'],['banana','Banana'],
  ['bird_of_paradise','Bird of paradise'],['jungle','Tropical canopy tree'],
  ['bare','Bare deciduous tree'],['joshua','Joshua tree'],
  ['cactus','Saguaro cactus'],['baobab','Baobab'],
  ['shrub','Leafy shrub'],['rock','Weathered boulder'],
  ['river_rock','Smooth river stone'],['slate_rock','Layered slate'],
  ['basalt_rock','Basalt columns'],['standing_rock','Standing stone'],['rock_cluster','Boulder tumble'],
  ['giant_mushroom','Giant parasol fungus'],['glow_shrooms','Mooncap colony'],
  ['shelf_fungus','Shelf-fungus spire'],['coral_tree','Alien coral tree'],
  ['lantern_plant','Lantern-pod plant'],['spiral_fern','Spiral fern'],
  ['crystal_lotus','Crystal lotus'],['star_bloom','Stargazer bloom'],
  ['amethyst','Amethyst cluster'],['quartz','Quartz cluster'],['azure_crystal','Azure crystal cluster']

];
export const FANTASY_IDS=['giant_mushroom','glow_shrooms','shelf_fungus','coral_tree','lantern_plant','spiral_fern','crystal_lotus','star_bloom'];
export const PLANT_MIXES={woodland:['maple','sycamore','tree','maple'],desert:['joshua','cactus','cactus','joshua'],savanna:['baobab','baobab','shrub','bare'],jungle:['jungle','banana','palm','bird_of_paradise'],bare:['bare','bare','shrub'],enchanted:['giant_mushroom','glow_shrooms','spiral_fern','lantern_plant','tree'],alien:['coral_tree','lantern_plant','star_bloom','crystal_lotus','spiral_fern'],fungi:['giant_mushroom','glow_shrooms','shelf_fungus']};
export const PLANT_IDS=PLANTS.map(([id])=>id);
export const ROCK_IDS=['rock','river_rock','slate_rock','basalt_rock','standing_rock','rock_cluster'];
export function specimenVariant(id){let hash=2166136261;for(const c of id)hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0)%3;}

// Only woody trees obstruct walking; soft stems, shrubs and fungi are permeable.
export const SOLID_TREE_IDS=['tree','maple','pine','sycamore','palm','jungle','bare','joshua','baobab','coral_tree'];
