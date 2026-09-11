# Generated skin features — 2026-09-08

Created with the built-in image generation tool. Original outputs are retained in
`C:/Users/lewis/.codex/generated_images/01a079c1-9a8f-7d90-ad2d-653d30bb7451/`.
All PNG assets beside this document are project-owned copies.

## Assets and fitting

- `reference.png`: copy of `../head-texture-study-v1.png`, the face-only UV study.
- `mature.png`: generated mature skin study; retained as artwork source, not used directly at runtime.
- `wrinkles.png`: isolated grayscale creases derived from the mature study. Runtime uses this mask, avoiding pore noise and broad baked shadows.
- `freckles.png`: generated freckled face study, with local pigment detail extracted at runtime.
- `makeup.png`: generated face cosmetics study, compared with the reference to extract pigment.
- `fantasy.png`: four columns/two rows: mermaid, dragon, lizard, snake; fur, rock, cybernetics, LEDs.
- `markings.png`: two columns: vitiligo mask and healed scar mask.

`room/avatar_generated_skin.js` fits facial details using the landmark mapping
from `tools/bake_head_texture_study.py`. Fitted layers leave the eye apertures,
nostrils, lips and non-head atlas areas alone except for their designated makeup.
Composites use at least 2048-pixel width for fitted facial detail. Multiplicative
color carries the existing complexion through. These are albedo details, not
new mesh relief or emissive LEDs. Decals retain placement controls.

Old imported layer projects retain the procedural renderer. Newly added features
use `fitted-v1` or `pattern-v1` artwork. Saved designs retain the composed PNG;
download the feature project to preserve individual editable layers. Dimples
were removed from the new feature picker; legacy projects can still render them.

## Verification

- Built the isolated Godot designer with `tools/build_avatar_designer.py`; the
  new module and all artwork are copied by the build, not only installed by hand.
- `node tools/test_avatar_designer.mjs` passed (52 morph controls, transparent
  wet cornea and saved inner-iris color). Both changed scripts passed syntax checks.
- Inspected a separate live browser draft at port 51230: wrinkle mask on forehead
  and mouth folds, lip pigment, freckles, mermaid material, scar placement.
- Recolored mermaid artwork to green and changed strength to 85%; both visibly
  changed the model. Scar position/size/rotation changes reached the live face.
- Applied layers reached the texture-upload success state; no browser console
  errors during the final checks. Existing user draft was not reloaded or edited.
- Not every fantasy tile or every extreme facial morph was visually auditioned.
  Generated tiles are not guaranteed seamless under repetition. No mesh relief,
  emission, or new normal maps are added by this change.

## Generation prompts

### Mature skin (reference: head-texture-study-v1.png)

Edit this FACE-ONLY unwrapped head texture for a 3D avatar. Preserve the exact image dimensions, UV island outline, sideways orientation, and positions of eyes, nose, mouth and ears. Add realistic mature adult facial skin detail, approximately age 50: fine irregular forehead creases, delicate crow's feet, textured eyelid folds, subtle under-eye lines, natural nose-to-mouth folds, pores and restrained complexion variation. The forehead is to the LEFT of the nose, the mouth is to its RIGHT: maintain that exact orientation. Make convincing photographic skin microdetail with subtle local shading, not drawn dark stripes, thick wrinkles, dramatic lighting or makeup. No changes to the head's proportions, no new eyebrows or hair, no body, no neck, no text. Keep average skin tone and all landmarks fixed. Output the edited square face texture only.

### Freckles (same reference)

Edit this face-only 3D head UV texture. Preserve the exact square layout and pixel positions of every landmark and the outline: the forehead points left, mouth right, ears above and below. Add natural sun-kissed freckles over the nose and cheeks, with varied small irregular warm brown pigment spots, sparse at edges, subtle believable skin pigmentation, not evenly spaced dots. Keep original skin, pores, neutral diffuse lighting, facial structure and all other pixels as unchanged as possible. No makeup, no ageing lines, no body or neck, no text. This is a texture-map edit, not a portrait.

### Makeup (same reference)

Edit this FACE-ONLY unwrapped head texture for a 3D avatar. Preserve the exact square image dimensions, UV island outline, sideways orientation, and positions of eyes, nose, mouth and ears. The forehead is to the LEFT of the nose, the mouth is to its RIGHT. Add professionally applied realistic soft makeup: softly blended taupe eyeshadow across the upper eyelids, muted rose lip pigment following only the lips, subtle rosy blush on cheeks, restrained cheek contour. Preserve pores and realistic cosmetic texture. No drawn lines, no dramatic shadows, no changing facial anatomy, no body or neck, no text. Keep every landmark in precisely the same pixel position. Output only the edited square UV texture.

### Wrinkle mask (reference: mature.png)

Create a clean grayscale WRINKLE MASK from this face-only UV map. Keep exactly the same square layout, sideways face orientation and wrinkle pixel positions. White background everywhere. Retain ONLY fine natural forehead creases, crow's feet, under-eye fine lines, and nose-to-mouth and mouth-corner folds as soft gray narrow irregular creases with gently fading ends. Forehead is left, mouth right, ears above and below: preserve those positions. REMOVE all skin color, pores, stippling, freckles, noise, overall shadows, facial features, eyes, eyebrows, nose, lips, ears, outline, and hair stubble. Blank white should occupy almost the entire image with only the delicately drawn wrinkle grooves remaining. This is an isolated texture detail opacity mask for a 3D character, not a portrait, no labels. The wrinkles must be continuous fine natural creases, not dotted scratches. Do not include any broad shading.

### Fantasy sheet (no reference)

Create a square texture sheet for a 3D fantasy character editor: exactly four columns and two rows of equal rectangular seamless material texture tiles, edge to edge without gutters, borders, labels or text. Neutral grayscale only, very detailed restrained physically convincing surface relief. Reading left to right: TOP ROW: 1 overlapping rounded mermaid fish scales, 2 larger pointed plated dragon scales, 3 small irregular pebbled lizard scales, 4 close-fitting diamond snake scales. BOTTOM ROW: 1 fine short directional fur strands, 2 irregular weathered stone with cracks, 3 elegant inset cybernetic panel seams and fine circuit traces, 4 clustered little luminous LED dots and fine connected light strips on dark material. No creatures, no body, no faces, only eight distinctly different tileable material swatches. Each tile precisely one quarter of image width and one half image height. Avoid flat geometric diagrams: photorealistic material microdetail suitable for a game character.

### Markings (no reference)

A square monochrome material mask sheet for a 3D character skin editor. Exactly two columns, one row, equal-sized tiles, no borders, text or labels. LEFT HALF: a sparse organic vitiligo pigment mask: a few broad irregular connected patches with softly scalloped natural boundaries and small satellite patches, white patches on pure black background, subtle feathering only at edges, no dots or hard polygon shapes. RIGHT HALF: one fine healed facial scar oriented vertically, irregular pale tissue with a faint central seam and subtle natural skin grain, tapering at top and bottom, white and gray on pure black background, no blood, no stitches, no wounds, no red. Everything outside the isolated patch shapes and scar is solid black. These are opacity masks, not photographs of people. No skin tones, no anatomy, no faces. Make these natural and delicate, suitable for layered texture compositing.
