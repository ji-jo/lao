# Roadmap & parked features

Everything below is explicitly requested by D but **not built yet** — in rough priority order.

## 1. Animatron mode (parked by D, full spec agreed)

A second app mode next to the current stop-motion mode (the mode bar top-left already has
room for a third item). D's design, plus a reference screenshot of a video-editor-style
timeline (clip bars per track, staggered start times, like text clips "h/a/n/d/." + an image
track):

- Everything is drawn in **one frame**, but each path lives on its **own layer** below it.
- Each path **starts recording its keyframe automatically when drawing starts and pauses
  when it stops** — toggleable, default ON.
- **A new path creates a new layer**, and its clip appears sequentially **after** the
  previous one on the timeline (staggered, like the screenshot).
- Playback = paths appear/animate in the order and timing they were drawn (stroke points
  already record `t` per point — reuse that for draw-on animation).
- Implementation sketch: add `mode: "animatron"` to `src/state/playback.ts`; per-stroke
  clip metadata (startTime, duration) on `Stroke` or a parallel track list; a clip-style
  timeline component (the current grid timeline stays for stop-motion mode).

## 2. Export fidelity

- **Frame-accurate shader export** — shaders currently export as a real-time snapshot from
  the hidden mount, not per-frame deterministic. Paper shaders accept a `frame`/time control
  via ShaderMount; drive it per exported frame.
- Transparent-background export option (WebM alpha / APNG).

## 3. Line effects from @paper-design/shaders-react

D: "consider adding line effects from paper shaders as well." Package already installed.
Candidates: apply a shader pass over the art layer only (not background) — e.g. roughen,
dithering, halftone on strokes. Needs an offscreen art canvas → shader texture pipeline.

## 4. Drawing/editing quality of life

- Brush textures/grain (the stamp pipeline in `renderer.ts` is architected for it — BOIL
  spec §6 in the parent folder's `BOIL_animation_tool_spec.md`).
- Move/rotate/scale selected strokes (selection + bbox exist; only warp handles move points).
- Marquee/lasso selection.
- Pan/zoom of the canvas (currently fit-to-screen only).
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
