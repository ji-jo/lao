# Architecture

Stack: Vite + React 19 + TypeScript (dev server **http://localhost:5173**), zustand,
Canvas2D + perfect-freehand, @remotion/player (preview), mediabunny + gifenc (export),
Tailwind v4, @paper-design/shaders-react (backgrounds).

UI + icons come from **four sources only** (see AGENTS.md §"Hard product constraints"):
fluid functionalism + beui (components), itshover + reicon.dev/`reicon-react` (icons).
No other component library or icon pack.

## Data model — `src/model/types.ts`

```
Project { name, width, height, fps, frameCount, layers[], background?, workflow? }
Layer   { id, name, visible, isStatic, frames: (Frame|null)[] }   // exposure sheet
Frame   { id, strokes[] }                                          // a "cel"
Stroke  { id, brush, color, size, points[], seed, jitter, clip? }
StrokePoint { x, y, pressure (0..1), t (ms from stroke start) }
StrokeClip { startMs, durationMs, hold? }                          // Animatron; hold:false = pop-off
Background = none | color | gradient(linear/radial) | image(fill/cover/contain/crop) | shader
workflow = "stopmotion" | "animatron"                              // optional; default animatron
```

**Exposure semantics** (`resolveCel`/`resolveCelIndex`): the cel shown at frame *i* is the
nearest keyframe at or before *i* (a "hold"). `frames[i] === null` ⇒ holding. Static layers
always show `frames[0]`. "Empty cel" (timeline button) = insert an empty keyframe to stop a hold.
Auto-Key ON on a held slot **clones** the held cel into the new key (then appends the stroke).

**Animatron**: `workflow: "animatron"`. Each new path creates a new layer (one stroke on
frame 0) with `Stroke.clip` staggered after the previous path. Playback / export use
`strokeProgress` to progressively reveal points by `t` at composition time.

**Mode switch** (Animatron ↔ Stop-motion): each workflow keeps its own document in
`useWorkflowMemory`. First visit **converts**; later visits restore the remembered
document. Animatron → Stop-motion flattens every visible path onto **one layer / one
frame**. Stop-motion → Animatron maps **one timeline frame → one layer**, with
`clip.hold: false` so each frame pops on fully and pops off (flipbook feel, no draw-on).
`SaveFirstDialog` stays for New; mode switch does not prompt.

Everything is **retained vector** — strokes keep their input points; raster is derived. This
powers boil, warp editing, copy/paste, and clean re-rendering at any resolution.

## Stores — `src/state/`

- `project.ts` — the document + `layerIndex`/`frameIndex` + **snapshot undo/redo** (whole
  `Project` refs on a capped stack; every mutation goes through `commit()`). Actions:
  addStroke (stop-motion Auto-Key **or** Animatron layer-per-path), pasteStrokes,
  deleteStrokes, replaceStrokePoints, translateStrokes, updateStrokeClip, addKeyframe,
  duplicateFrameForward, deleteKeyframe, extendTimeline, setProjectSettings, addLayer,
  deleteLayer, reorderLayer, toggleLayerVisible, loadProject, switchWorkflow.
- `workflowMemory.ts` — inactive-mode document (+ playhead / undo) so mode switch round-trips.
- `tools.ts` — active tool, color, size, autoKey (also Animatron auto-record), jitterByDefault.
- `playback.ts` — `stage` (`draw` | `preview`), `workflow` (`stopmotion` | `animatron`),
  playing, onionSkin. (`mode` mirrors `stage` for compatibility.)
- `selection.ts` — selected stroke ids in the current cel; clears on frame/layer change;
  prunes stale ids on project mutations.
- `clipboard.ts` — in-app stroke clipboard (plain module).
- `reference.ts` — preview-mode reference image/video (object URL, never exported).
- `playerRef.ts` — shared Remotion `PlayerRef` so the timeline can drive the Player.

## Engine — `src/engine/`

- `renderer.ts` — stroke → canvas. perfect-freehand outlines per brush (ink/pencil/marker/
  eraser); eraser = destination-out **within its own cel** (cels composite via a scratch
  canvas so erasers can't eat other layers). `RenderOptions.displaced` takes a
  Map<strokeId, points> for boil/warp/move previews; `colorOverride` for onion ghosts.
- `boil.ts` — seeded line jitter: mulberry32 PRNG, 3 variants held 2 frames each ("on 2s"),
  smooth control-point noise. Deterministic per (seed, variant) — unit-tested.
- `pathEdit.ts` — warp-handle math, translatePoints, bounds, straight-line interpolation,
  handle spacing, stroke hit-testing. Pure functions, unit-tested.
- `strokeProgress.ts` — Animatron draw-on (`truncateStrokePoints` / `strokeAtTime`).
- `pressure.ts` — pen pressure passthrough; mouse/trackpad get velocity-synthesized pressure.
- `background.ts` — paints color/gradient/image backgrounds into any 2d context;
  image cache; shader kind = flat first-color approx unless given a snapshot canvas.
- `paintFrame.ts` — **single source of truth for full-quality frame rendering** (used by both
  the Remotion composition and the export pipeline). Animatron-aware progressive paint.
  Draft/edit rendering lives in `StageCanvas` instead.

## Surfaces

- `components/StageCanvas.tsx` — edit-mode canvas: pointer input, live stroke, onion skin,
  selection overlay + warp handles + **group move**, backgrounds, draft compositing.
- `remotion/LaoComposition.tsx` + `components/PreviewStage.tsx` — full-quality playback via
  `@remotion/player` (fit-container sizing + callback `playerRef`); timeline ⟷ player sync.
- `components/timeline/Timeline.tsx` — floating transport; Draw/Preview stage toggles
  (Expand icon); range extend 1–120; stop-motion grid **or** `ClipTimeline` for Animatron.
- Top-left `@beui/overflow-actions`: Stop Motion / Animatron + File overflow (Save/Open/Extract).
- `components/panels/` — horizontal auto-collapsing InspectPanel; ExportDialog (Video Type
  MP4/WebM/GIF, aspect/res/fps chips, Soft Extrude CTA).
- `components/ShaderBackground.tsx` — 6 paper-design shader presets + hidden snapshot mount.

## Files & persistence — `src/file/`

- `laoFile.ts` — `.lao` = versioned JSON `{format:"lao", version:1, savedAt, project, workflowMemory?}`;
  optional `workflow` / `clip` / `workflowMemory` fields are backward compatible.
- `autosave.ts` — debounced (1 s) IndexedDB snapshot (includes workflow memory); recovery banner on boot.

## Export — `src/export/exportProject.ts`

Per frame: paint background + `paintProjectFrame` (boil baked; Animatron draw-on) into an
offscreen canvas → mediabunny `CanvasSource` (H.264 MP4 / VP9 WebM) or gifenc.
Shader backgrounds are stamped from the hidden snapshot mount (real-time, not frame-accurate —
known limitation, see ROADMAP).
