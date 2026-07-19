# Architecture

Stack: Vite + React 19 + TypeScript, zustand, Canvas2D + perfect-freehand,
@remotion/player (preview), mediabunny + gifenc (export), Tailwind v4,
fluid-functionalism/itshover/beui shadcn registries, @paper-design/shaders-react (backgrounds).

## Data model — `src/model/types.ts`

```
Project { name, width, height, fps, frameCount, layers[], background? }
Layer   { id, name, visible, isStatic, frames: (Frame|null)[] }   // exposure sheet
Frame   { id, strokes[] }                                          // a "cel"
Stroke  { id, brush, color, size, points[], seed, jitter }
StrokePoint { x, y, pressure (0..1), t (ms from stroke start) }
Background = none | color | gradient(linear/radial) | image(fill/cover/contain/crop) | shader
```

**Exposure semantics** (`resolveCel`/`resolveCelIndex`): the cel shown at frame *i* is the
nearest keyframe at or before *i* (a "hold"). `frames[i] === null` ⇒ holding. Static layers
always show `frames[0]`. "Empty cel" (timeline button) = insert an empty keyframe to stop a hold.

Everything is **retained vector** — strokes keep their input points; raster is derived. This
powers boil, warp editing, copy/paste, and clean re-rendering at any resolution.

## Stores — `src/state/`

- `project.ts` — the document + `layerIndex`/`frameIndex` + **snapshot undo/redo** (whole
  `Project` refs on a capped stack; every mutation goes through `commit()`). Actions:
  addStroke (implements **Auto-Key**: ON creates a keyframe on empty/held slots, OFF routes
  to a static layer), pasteStrokes, deleteStrokes, replaceStrokePoints (warp commit),
  addKeyframe, duplicateFrameForward (the core flip loop), deleteKeyframe, extendTimeline,
  setProjectSettings, addLayer, toggleLayerVisible, loadProject.
- `tools.ts` — active tool, color, size, autoKey, jitterByDefault.
- `playback.ts` — mode (`draw` | `preview`), playing, onionSkin.
- `selection.ts` — selected stroke ids in the current cel; auto-clears on frame/layer change.
- `clipboard.ts` — in-app stroke clipboard (plain module).
- `reference.ts` — preview-mode reference image/video (object URL, never exported).
- `playerRef.ts` — shared Remotion `PlayerRef` so the timeline can drive the Player.

## Engine — `src/engine/`

- `renderer.ts` — stroke → canvas. perfect-freehand outlines per brush (ink/pencil/marker/
  eraser); eraser = destination-out **within its own cel** (cels composite via a scratch
  canvas so erasers can't eat other layers). `RenderOptions.displaced` takes a
  Map<strokeId, points> for boil/warp previews; `colorOverride` for onion ghosts.
- `boil.ts` — seeded line jitter: mulberry32 PRNG, 3 variants held 2 frames each ("on 2s"),
  smooth control-point noise. Deterministic per (seed, variant) — unit-tested.
- `pathEdit.ts` — warp-handle math (smoothstep falloff), straight-line interpolation,
  handle spacing, stroke hit-testing. Pure functions, unit-tested.
- `pressure.ts` — pen pressure passthrough; mouse/trackpad get velocity-synthesized pressure.
- `background.ts` — paints color/gradient/image backgrounds into any 2d context;
  image cache; shader kind = flat first-color approx unless given a snapshot canvas.
- `paintFrame.ts` — **single source of truth for full-quality frame rendering** (used by both
  the Remotion composition and the export pipeline). Draft/edit rendering lives in
  `StageCanvas` instead (half-res, smoothing off — intentional "anti-alias off while editing").

## Surfaces

- `components/StageCanvas.tsx` — edit-mode canvas: pointer input, live stroke, onion skin,
  selection overlay + warp handles, backgrounds, draft compositing. Render loop = rAF with
  `setTimeout` fallback when `document.hidden` (headless/hidden tabs never fire rAF).
- `remotion/LaoComposition.tsx` + `components/PreviewStage.tsx` — full-quality playback via
  `@remotion/player`; shader backgrounds render as a live DOM layer under the composition
  canvas; timeline ⟷ player sync via frameupdate events / seekTo.
- `components/timeline/Timeline.tsx` — floating transport + layers×frames grid, fps input,
  onion toggle, keyframe ops. Draw-mode playback is a simple interval; preview delegates to
  the Player.
- `components/panels/` — InspectPanel (brush + background controls), ExportDialog
  (resolution presets, W/H/fps/frames, MP4/WebM/GIF with progress).
- `components/ShaderBackground.tsx` — 6 paper-design shader presets + a hidden
  `ShaderSnapshotMount` whose WebGL canvas gets stamped into exports.

## Files & persistence — `src/file/`

- `laoFile.ts` — `.lao` = versioned JSON `{format:"lao", version:1, savedAt, project}`;
  File System Access API save/open with download/input fallbacks; drag-drop opens too.
- `autosave.ts` — debounced (1 s) IndexedDB snapshot of every project change; recovery
  banner on boot (App.tsx) offers Restore/Discard.

## Export — `src/export/exportProject.ts`

Per frame: paint background + `paintProjectFrame` (boil baked) into an offscreen canvas →
mediabunny `CanvasSource` (H.264 MP4 / VP9 WebM via WebCodecs) or gifenc (per-frame palette).
Shader backgrounds are stamped from the hidden snapshot mount (real-time, not frame-accurate —
known limitation, see ROADMAP).
