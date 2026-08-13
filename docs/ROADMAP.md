# Roadmap & parked features

Everything below is explicitly requested by D but **not built yet** — in rough priority order.

## 1. Animatron mode — shipped

Stop Motion vs Animatron workflows, layer-per-path clips, auto-record, clip timeline
(drag move/resize), draw-on via point `t`, Draw/Preview on the timeline toolbar. See
`docs/ARCHITECTURE.md`.

## 2. Export fidelity

- **Frame-accurate shader export** — **shipped**: export drives Paper `frame` (ms) with `speed=0` per timeline frame at full resolution.
- **Transparent-background export** — **shipped**: WebM VP9 alpha, GIF/APNG transparency toggle in Export dialog.

## 3. Line effects from @paper-design/shaders-react

D: "consider adding line effects from paper shaders as well." Package already installed.
Candidates: apply a shader pass over the art layer only (not background) — e.g. roughen,
dithering, halftone on strokes. Needs an offscreen art canvas → shader texture pipeline.

## 4. Drawing/editing quality of life

- Brush textures/grain — **shipped** (seeded paper grain via `grain` stroke flag + the brush
  settings-dock toggle; StatusIsland — the old top-center pill this note originally referred
  to — was removed, see `docs/SESSION_HANDOFF.md`).
- Move/rotate/scale selected strokes — **shipped** (bbox corner scale, rotation handle, group move).
- Marquee/lasso selection.
- Pan/zoom of the canvas — **shipped** (wheel pan, Ctrl/Cmd+wheel or +/- zoom, Space/middle-drag pan, Ctrl/Cmd+0 reset).
- Paper dock hover/tooltips/conjoined shapes — **in progress** (see `docs/MVP1_REQUIREMENTS.md`).
- Proper eraser/pencil icons if itshover ever ships them (letter icons are placeholders).

## 5. From the original BOIL spec (v1 non-goals, still on the horizon)

`.abr` / Procreate brush import · animated SVG export · audio import for timing ·
AI-assisted in-betweening (Phase 2, was explicitly dumped from v1) · Rust→wasm engine core
+ WebGL renderer swap (renderer is isolated behind `renderStrokes` for exactly this).

## Known quirks / debt

- Changing project resolution does not rescale existing strokes (coordinates are absolute
  in project space) — decide whether presets should offer "scale artwork" later.
- An eraser stroke on a *held* cel edits that cel, which also changes earlier frames holding
  it — correct exposure-sheet semantics, but may surprise; consider "break hold on edit".
- Timeline rows don't virtualize; hundreds of frames × many layers will need it eventually.
- `PROJECT_MEMORY.md` and `BOIL_animation_tool_spec.md` in the parent "Line Animations"
  folder are the original vision docs; `pixel-point-editor.html` there is an unrelated
  earlier prototype kept as reference.
