# Pixel-glass key stand

An interactive, real-time 3D study of a frameless patterned-glass stand (Edelit doppelt, 4 mm) in an entry hall. Switch flowers, glass type, mirror floor, a lamp inside, size, and daylight or evening, and compare with the stool that stands there now.

Live: https://jdihlmann.github.io/glass_stand/

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5183.

## How it works

- `src/glass.js` – the glass shader. Every 12.5 mm cell acts as a small crossed lens; the bent view ray is traced against the depth buffer of the scene behind the pane, so near objects stay readable and deeper ones break into colour blocks.
- `src/room.js` – the hall and adjoining rooms, built procedurally.
- `src/flowers.js` – procedural flower arrangements.
- `src/stand.js`, `src/main.js`, `src/ui.js` – the stand, render pipeline (layered glass passes, ambient occlusion, bloom) and controls.
- `bake/` and `src/bake.js` – an optional Blender light-bake pipeline, currently unused.

Oak textures are CC0 from Poly Haven.
