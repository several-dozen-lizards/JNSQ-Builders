## JNAIQ Builders — small curated test drive

Optional Windows download: Avatar Creator, World Builder, their Godot/Three.js rendering runtimes, one finished editable human starter, six furniture objects, landscape materials and procedural scenery.

Download **Get-JNAIQ-Builders.zip**, extract it into a **new folder**, and run **DOWNLOAD_BUILDERS.bat**. Install Python 3.10+ with “Add Python to PATH” first. Then run **JNAIQ-Builders/INSTALL_BUILDERS.bat** and **START_BUILDERS.bat**. About **666 MB** download, **710 MB** unpacked before Python dependencies; allow about **3 GB** free.

Already using JNAIQ? Start Builders, open JNAIQ’s **Builders** page, and connect using the port in the Builders window (normally 61420). The editors open separately and keep their own saved work.

- Avatar: edit the starter’s shape, colors and procedural markings; save, reopen, and download a self-contained GLB. Import your own model for other starting points. The included wardrobe is deliberately small.
- World: sculpt terrain, grow scenery, place buildings and furniture, save and reopen, or export world JSON. Shared world files reference the matching asset pack.
- Help can be switched off and automatically retires after the first successful save.
- **Experimental VR** is off by default. Opt in inside World Builder and choose Enter VR. This is very early, clunky and incomplete; **real-headset compatibility is untested**. It provides headset viewing while editing remains on the desktop. Use a compatible connected headset and WebXR-capable desktop browser. The server is loopback-only, so standalone headsets cannot connect over a LAN.

**Scope:** this is the standalone creative package. It does not assign avatars to household members, publish household destinations, or include the full household room runtime. No household, resident memories, API key, Blender installation or Godot editor is needed.

Unverified assets, character studies, unfinished model revisions, additional wardrobe shelves and unverified motion/artwork are omitted. MakeHuman core and Poly Haven assets have recorded CC0 sources; Three.js and Godot notices are included. Retain **THIRD_PARTY_NOTICES.md** with shared assets. Existing broader historical releases are not this curated pack.

Checked: fresh Windows/Python installation; seven copied-package API/storage tests; avatar render/edit/save/reopen/GLB export; world render/save/reopen/export; guide completion; default-off/no-headset VR UI and five mocked XR lifecycle checks; exact source hashes, Godot scene inspection, archive extraction, and protection of saved work. No real-headset success is claimed.

Manual alternative: extract the application, avatars and world ZIPs into the same new directory; all contain parts of **JNAIQ-Builders**. Do not overwrite an older installation. Back up the entire Builders folder, including imported models and `data`.
