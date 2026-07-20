# Architecture

Stack: Vite + React 19 + TypeScript, zustand, Canvas2D + perfect-freehand,
@remotion/player (preview), mediabunny + gifenc (export), Tailwind v4,
fluid-functionalism/itshover/beui shadcn registries, @paper-design/shaders-react (backgrounds).

## Data model — `src/model/types.ts`

```
Project { name, width, height, fps, frameCount, layers[], background?, workflow? }
Layer   { id, name, visible, isStatic, frames: (Frame|null)[] }   // exposure sheet
Frame   { id, strokes[] }                                          // a "cel"
Stroke  { id, brush, color, size, points[], seed, jitter, clip? }
StrokePoint { x, y, pressure (0..1), t (ms from stroke start) }
StrokeClip { startMs, durationMs }                                 // Animatron only
Background = none | color | gradient(linear/radial) | image(fill/cover/contain/crop) | shader
workflow = "stopmotion" | "animatron"                              // optional; default stopmotion
```

**Exposure semantics** (`resolveCel`/`resolveCelIndex`): the cel shown at frame *i* is the
nearest keyframe at or before *i* (a "hold"). `frames[i] === null` ⇒ holding. Static layers
always show `frames[0]`. "Empty cel" (timeline button) = insert an empty keyframe to stop a hold.
Auto-Key ON on a held slot **clones** the held cel into the new key (then appends the stroke).

**Animatron**: `workflow: "animatron"`. Each new path creates a new layer (one stroke on
frame 0) with `Stroke.clip` staggered after the previous path. Playback / export use
`strokeProgress` to progressively reveal points by `t` at composition time.

Everything is **retained vector** — strokes keep their input points; raster is derived. This
powers boil, warp editing, copy/paste, and clean re-rendering at any resolution.

## Stores — `src/state/`

- `project.ts` — the document + `layerIndex`/`frameIndex` + **snapshot undo/redo** (whole
  `Project` refs on a capped stack; every mutation goes through `commit()`). Actions:
  addStroke (stop-motion Auto-Key **or** Animatron layer-per-path), pasteStrokes,
  deleteStrokes, replaceStrokePoints, translateStrokes, updateStrokeClip, addKeyframe,
  duplicateFrameForward, deleteKeyframe, extendTimeline, setProjectSettings, addLayer,
  deleteLayer, reorderLayer, toggleLayerVisible, loadProject.
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
- `components/timeline/Timeline.tsx` — floating transport; Draw/Preview stage toggles;
  **frame count is a single slider** (drag right adds frames, left trims from the end,
  1–240) — no +/− steppers; stop-motion grid **or** `ClipTimeline` for Animatron.
- `components/chrome/` — the floating UI, all beui + fluid:
  - `WorkspaceTabs` (`@beui/expandable-tabs`, top-left): Mode panel (workflow + stage)
    and File panel (Save / Open / Export).
  - `StatusIsland` (`@beui/dynamic-island`, top-center): compact pill = tool · frame · fps;
    unfurls into Brush (color/size/boil/auto-key) and Canvas (background + size) views.
  - `ToolDock` (`@beui/dock`, bottom, stacked above the timeline): tools, frame ops
    (duplicate / empty cel / onion), undo-redo.
  - `CommandBar` (`@beui/command-palette`): Ctrl+K over every action.
  - `Toasts` (`@beui/animated-toast-stack`) fed by the `state/toasts.ts` bridge so
    non-React code can notify; autosave recovery is a toast action.
- `components/panels/ExportDialog` — `@beui/morphing-modal` + fluid Button/Tabs
  (Video Type MP4/WebM/GIF, aspect/res/fps chips).
- `components/ShaderBackground.tsx` — 6 paper-design shader presets + hidden snapshot mount.

## Files & persistence — `src/file/`

- `laoFile.ts` — `.lao` = versioned JSON `{format:"lao", version:1, savedAt, project}`;
  optional `workflow` / `clip` fields are backward compatible.
- `autosave.ts` — debounced (1 s) IndexedDB snapshot; recovery banner on boot.

## Export — `src/export/exportProject.ts`

Per frame: paint background + `paintProjectFrame` (boil baked; Animatron draw-on) into an
offscreen canvas → mediabunny `CanvasSource` (H.264 MP4 / VP9 WebM) or gifenc.
Shader backgrounds are stamped from the hidden snapshot mount (real-time, not frame-accurate —
known limitation, see ROADMAP).
