# JNAIQ Builders — curated preview

Optional local Avatar Creator, World Builder and their 3D rendering runtimes.
One finished MakeHuman starter with editable body/face, casual clothes and short
hair; six Poly Haven furniture objects, terrain materials and procedural scenery.
Character studies, unfinished revisions, extra wardrobe packs and unverified
motion/artwork are omitted. Import your own model if you need another starting point.

Extract all three ZIPs into the same new folder. Install Python 3.10+ with Python
on PATH. Run INSTALL_BUILDERS.bat, then START_BUILDERS.bat. Installation downloads
Python dependencies. No Godot editor, Blender, model account or API key is needed.
The browser downloads nothing from a model provider during ordinary editing.

Choose Save design / Save island to keep editable work in this installation's
data folder. Edit saved avatar / Edit saved world reopens it. Export makes a
portable copy. World JSON references the matching furniture pack. Back up the
entire installation, including imported models, before moving or updating it.
Install this preview in a NEW folder; never extract it over an existing library.

To open from JNAIQ, start Builders, then connect from JNAIQ's Builders page using
the port printed in the server window (normally 61420). These standalone editors
do not assign avatars to household members or publish household destinations.
The full household room runtime is not included.

## Experimental VR

In World Builder, open Experimental VR and opt in. Enter VR starts a headset
session only when you choose it. Very early, clunky, incomplete and untested on
real headsets. This is headset viewing of the editor world; editing remains on
the desktop. No controller locomotion or embodied household interaction is promised.
Use a WebXR-capable desktop browser with a compatible connected headset. The
server is loopback-only; standalone headsets cannot connect over your LAN.
Leave VR or turn the option off to return to desktop viewing.

See THIRD_PARTY_NOTICES.md, ASSET_REVIEW.json and BUILDERS_MANIFEST.json for source
records and hashes. Keep notices with shared assets. RELEASE_READINESS.json,
when present, records checks against these exact package bytes.
