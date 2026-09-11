# Compatible complexion maps

The original three choices are unmodified 2048 x 2048 MakeHuman maps copied from the installed MPFB skin library. Existing attribution marks are retained. They share the current human UV layout and are offered as optional textures, not fixed gender or age assignments.

- natural.png: skins/young_caucasian_male/young_lightskinned_male_diffuse.png
- soft.png: skins/young_caucasian_female/young_lightskinned_female_diffuse.png
- mature.png: skins/middleage_caucasian_male/middleage_lightskinned_male_diffuse.png

Source root: C:/Users/lewis/AppData/Roaming/Blender Foundation/Blender/4.2/extensions/.user/blender_org/mpfb/data/

index.json records the SHA-256 identifiers used by the local texture store.

## September 7 comparison additions

- kay-original.png: unchanged user-provided `D:/ChristinaStuff/Braindump/2026/BLENDER/canvas.png`. Local comparison asset; redistribution rights have not been established.
- generated-head-study.png: experimental head-only generation fitted through Blender material coordinates onto the current skin UV triangles, with the original natural map underneath. Reproduce with `tools/bake_head_texture_study.py`; editable fitting scene in `outputs/avatar-designer/head-texture-fitting.blend`. Generation prompt is in `../skin-detail/head-texture-study-v1.md`. The initial full-atlas generation was rejected; this later head-only generation succeeded.

Both were applied and visually inspected in the live designer. Kay's original maps well. The generated version still has mismatched lip and ear details and is explicitly a fitting study, not a production upgrade. Two same-shape neutral-tint comparison designs were saved: Kay texture - comparison (1986e45f), Generated head - experimental comparison (349c3ae9). The user's pre-existing unsaved changes were saved separately as Texture comparison - preserved edits (7e19feb4). No resident appearance was assigned.
