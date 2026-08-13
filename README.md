# lao

A browser-based, hand-drawn animation studio. Draw with pressure brushes, animate
frame-by-frame with onion skin and auto-key, let lines **boil** (seeded jitter, on 2s),
preview at full quality, and export GIF / MP4 / WebM / PNG / SVG. Projects save offline
as `.lao` files with IndexedDB autosave recovery.

The marketing site lives in [`website/`](website/).

## Run

```bash
npm install   # NOT bun install — keep package-lock.json (repo is on X:)
bun run dev   # dev server (vite)
bun test      # unit tests
npx tsc -b    # type-check
```

## Highlights

- **Draw**: ink / pencil / marker / eraser (perfect-freehand, real pen pressure, synthesized
  from velocity for mouse), Shift+drag for straight lines, undo/redo.
- **Animate**: exposure-sheet timeline (keyframes + holds), duplicate-frame-forward loop,
  onion skin, auto-key (off = static layer), editable fps, copy/paste strokes across frames.
- **Edit**: select strokes (click / A / Ctrl+A), warp handles bend a line with smooth
  falloff — nudge instead of redraw.
- **Boil**: per-stroke seeded jitter, deterministic (preview == export), 3 variants on 2s.
- **Preview**: Remotion Player playback, reference image/video attachment.
- **Backgrounds**: color, linear/radial gradient, image (fill/cover/contain/crop), and
  live WebGL shaders (@paper-design/shaders-react).
- **Export**: MP4 (H.264) / WebM VP9 with alpha / PNG composite / GIF via mediabunny +
  gifenc; compact SVG, React player + JSON for code.

## Docs

- [AGENTS.md](AGENTS.md) — working agreements, environment traps, constraints (read first)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data model, stores, engine, surfaces
- [docs/ROADMAP.md](docs/ROADMAP.md) — parked features (Animatron mode spec, shader line
  effects, export fidelity) and known quirks
