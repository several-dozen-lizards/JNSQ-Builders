# Natural iris detail

`natural-hazel.png` was generated with the built-in image tool from the existing eye-source.png atlas. Original file preserved; generated output is 1254 square. Local texture identifier is recorded in index.json.

Prompt: Edit this eye UV texture atlas for a realistic 3D character. Preserve EXACT layout: upper-right iris center (70.7%,29.7%), lower-left iris center (29.1%,70.9%); both iris radii 11.5% of canvas width. Preserve eye white outlines, gray background and small bottom-right lavender circle unchanged. Replace only the two dark red-brown irises with matching natural hazel-green irises: intricate irregular radial fibers, olive green outer region, restrained warm amber near pupils, fine branching crypts, subtly darker limbal boundary. Keep black round pupils centered, radius 3.7% of canvas width. Give the iris diffuse color medium brightness, not nearly black, not neon. Soften overly red scleral veins slightly. No painted specular catchlights: the renderer adds moving reflections. Flat diffuse albedo texture, no added lighting, no perspective or relocated features. Square 1024x1024 output.

## Color controls

White keeps the source color. Other iris colors recolor the annulus using its existing brightness variation. Sclera tint is independent; pupils are excluded. The same fixed MakeHuman atlas layout applies to user-uploaded maps. Browser preview/export and CLI export use the same regional masks. Other UV layouts require fitting first.

Live checks: natural hazel and blue applied successfully with whites unchanged. Existing cornea geometry/material remains in use; this pass changes texture detail and tint support, not eye geometry or simulated refraction.
