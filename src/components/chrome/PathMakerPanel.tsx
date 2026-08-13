import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { PAPER } from "@/components/chrome/paper-tokens";
import { SliderComfortable } from "@/components/ui/slider";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { useSelection } from "@/state/selection";
import { usePathMaker } from "@/state/pathMaker";
import {
  MOTION_PATH_PRESETS,
  createPenMotionPath,
  createPresetMotionPath,
  type MotionPathPresetId,
} from "@/engine/motionPathPresets";
import { pointsBounds, boundsCenter } from "@/engine/pathEdit";
import { resolveCel, DEFAULT_CLIP_EASING, type MotionAssignment } from "@/model/types";

/**
 * Path Maker panel — attach selection to a motion guide.
 * Presets (straight/arc/…) and custom pen draw both produce editable BezierNodes.
 */

function selectionAnchor(): { x: number; y: number } | null {
  const { project, layerIndex, frameIndex } = useProject.getState();
  const ids = useSelection.getState().ids;
  if (!ids.length) return null;
  const layer = project.layers[layerIndex];
  if (!layer) return null;
  const workflow = project.workflow ?? usePlayback.getState().workflow;
  const cel =
    workflow === "animatron"
      ? layer.frames.find((f) => f) ?? null
      : resolveCel(layer, frameIndex);
  if (!cel) return null;
  const idSet = new Set(ids);
  const pts = cel.strokes.filter((s) => idSet.has(s.id)).flatMap((s) => s.points);
  for (const t of cel.texts ?? []) {
    if (idSet.has(t.id)) pts.push({ x: t.x, y: t.y, pressure: 1, t: 0 });
  }
  for (const im of cel.images ?? []) {
    if (idSet.has(im.id)) {
      pts.push({
        x: im.x + im.w / 2,
        y: im.y + im.h / 2,
        pressure: 1,
        t: 0,
      });
    }
  }
  const b = pointsBounds(pts);
  return b ? boundsCenter(b) : null;
}

export function PathMakerPanel({ className }: { className?: string }) {
  const workflow = usePlayback((s) => s.workflow);
  const clipEasing = useProject((s) => s.clipEasing);
  const project = useProject((s) => s.project);
  const layerIndex = useProject((s) => s.layerIndex);
  const frameIndex = useProject((s) => s.frameIndex);
  const addMotionPath = useProject((s) => s.addMotionPath);
  const addMotionAssignment = useProject((s) => s.addMotionAssignment);
  const removeMotionAssignment = useProject((s) => s.removeMotionAssignment);
  const removeMotionPath = useProject((s) => s.removeMotionPath);
  const addMorphClip = useProject((s) => s.addMorphClip);

  const ids = useSelection((s) => s.ids);
  const mode = usePathMaker((s) => s.mode);
  const draftNodes = usePathMaker((s) => s.draftNodes);
  const durationMs = usePathMaker((s) => s.durationMs);
  const reverse = usePathMaker((s) => s.reverse);
  const orient = usePathMaker((s) => s.orient);
  const lastPreset = usePathMaker((s) => s.lastPreset);
  const startFrame = usePathMaker((s) => s.startFrame);
  const endFrame = usePathMaker((s) => s.endFrame);
  const setMode = usePathMaker((s) => s.setMode);
  const clearDraft = usePathMaker((s) => s.clearDraft);
  const setDurationMs = usePathMaker((s) => s.setDurationMs);
  const setReverse = usePathMaker((s) => s.setReverse);
  const setOrient = usePathMaker((s) => s.setOrient);
  const setLastPreset = usePathMaker((s) => s.setLastPreset);
  const setStartFrame = usePathMaker((s) => s.setStartFrame);
  const setEndFrame = usePathMaker((s) => s.setEndFrame);

  const layer = project.layers[layerIndex];
  const assignments = layer?.motionAssignments ?? [];

  const morphLayerOptions = useMemo(
    () =>
      project.layers.map((l, i) => ({
        id: l.id,
        name: l.name || `Layer ${i + 1}`,
      })),
    [project.layers],
  );

  const canAttach = ids.length > 0;

  function commitPathAndAssignment(
    pathId: string,
    anchor: { x: number; y: number },
  ) {
    if (!layer || !canAttach) return;
    // Always start at 0 so scrubbing/playing from the timeline head shows motion.
    // (Previously used current frameIndex, which silently delayed the ride.)
    const startMs = 0;
    const assignment: MotionAssignment = {
      id: crypto.randomUUID(),
      pathId,
      targetIds: [...ids],
      anchor,
      startMs,
      durationMs,
      startFrame: workflow === "stopmotion" ? startFrame : undefined,
      endFrame: workflow === "stopmotion" ? Math.max(startFrame + 1, endFrame) : undefined,
      easing: { ...(clipEasing ?? DEFAULT_CLIP_EASING), _userSet: true },
      reverse,
      orient,
    };
    addMotionAssignment(layer.id, assignment);
    clearDraft();
    setMode("idle");
  }

  function applyPreset(preset: MotionPathPresetId) {
    if (!layer || !canAttach) return;
    const anchor = selectionAnchor();
    if (!anchor) return;
    setLastPreset(preset);
    const path = createPresetMotionPath(preset, anchor);
    addMotionPath(layer.id, path);
    commitPathAndAssignment(path.id, anchor);
    // Jump playhead to start so the ride is visible immediately on scrub.
    useProject.getState().setFrameIndex(0);
  }

  function commitDrawnPath() {
    if (!layer || !canAttach || draftNodes.length < 2) return;
    const anchor = selectionAnchor();
    if (!anchor) return;
    const nodes = draftNodes.map((n, i) =>
      i === 0 ? { ...n, x: anchor.x, y: anchor.y } : { ...n },
    );
    const path = createPenMotionPath(nodes);
    addMotionPath(layer.id, path);
    commitPathAndAssignment(path.id, anchor);
    useProject.getState().setFrameIndex(0);
  }

  function createMorphFromNeighbors() {
    if (workflow !== "animatron") return;
    if (layerIndex < 0 || layerIndex >= project.layers.length - 1) return;
    const from = project.layers[layerIndex]!;
    const to = project.layers[layerIndex + 1]!;
    const startMs = Math.round((frameIndex / Math.max(project.fps, 1)) * 1000);
    addMorphClip({
      id: crypto.randomUUID(),
      fromLayerId: from.id,
      toLayerId: to.id,
      startMs,
      durationMs,
      easing: { ...(clipEasing ?? DEFAULT_CLIP_EASING), _userSet: true },
    });
  }

  const chip = (active: boolean) =>
    cn(
      "rounded-lg px-2.5 py-1 text-[12px] transition-colors",
      active
        ? "bg-white/15 text-white"
        : "text-white/70 hover:bg-white/10 hover:text-white",
    );

  return (
    <div
      className={cn(
        "flex w-[300px] flex-col gap-3 rounded-[18px] p-3 text-white",
        className,
      )}
      style={{ background: PAPER.surface }}
    >
      <div className="text-[13px] font-medium tracking-wide">Path Maker</div>
      <p className="text-[11px] leading-snug text-white/55">
        Select art (V), then attach a preset or draw a path. Drawing uses pen
        nodes: click to place, drag to pull handles. Scrub the timeline to ride
        the blue guide.
      </p>

      {!canAttach ? (
        <div className="rounded-lg bg-white/5 px-2.5 py-2 text-[12px] text-white/50">
          Select strokes, shapes, text, or images first.
        </div>
      ) : (
        <>
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            Presets
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MOTION_PATH_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={chip(lastPreset === p.id && mode !== "draw")}
                onClick={() => applyPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={chip(mode === "draw")}
              onClick={() => setMode(mode === "draw" ? "idle" : "draw")}
            >
              Draw path
            </button>
            {mode === "draw" ? (
              <>
                <span className="text-[11px] text-white/45">
                  {draftNodes.length} nodes — click + drag handles
                </span>
                <button
                  type="button"
                  disabled={draftNodes.length < 2}
                  className={cn(
                    "ml-auto rounded-lg px-2.5 py-1 text-[12px]",
                    draftNodes.length >= 2
                      ? "bg-white text-black"
                      : "bg-white/10 text-white/30",
                  )}
                  onClick={commitDrawnPath}
                >
                  Attach
                </button>
              </>
            ) : null}
          </div>
        </>
      )}

      <div className="h-px bg-white/10" />

      {workflow === "animatron" ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-white/50">Duration (ms)</span>
          <SliderComfortable
            min={80}
            max={8000}
            step={20}
            value={durationMs}
            onChange={(v) => setDurationMs(v)}
          />
          <span className="text-right text-[11px] tabular-nums text-white/40">
            {durationMs} ms
          </span>
        </label>
      ) : (
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-white/50">Start frame</span>
            <input
              type="number"
              min={0}
              value={startFrame}
              onChange={(e) => setStartFrame(Number(e.target.value) || 0)}
              className="h-7 rounded-lg bg-white/10 px-2 text-[12px] text-white outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-white/50">End frame</span>
            <input
              type="number"
              min={0}
              value={endFrame}
              onChange={(e) => setEndFrame(Number(e.target.value) || 0)}
              className="h-7 rounded-lg bg-white/10 px-2 text-[12px] text-white outline-none"
            />
          </label>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className={chip(reverse)}
          onClick={() => setReverse(!reverse)}
        >
          Reverse
        </button>
        <button
          type="button"
          className={chip(orient)}
          onClick={() => setOrient(!orient)}
        >
          Orient to path
        </button>
      </div>

      {workflow === "animatron" && morphLayerOptions.length >= 2 ? (
        <>
          <div className="h-px bg-white/10" />
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            Morph clip
          </div>
          <p className="text-[11px] text-white/45">
            Morph this layer into the next layer over the duration above.
          </p>
          <button
            type="button"
            className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[12px] text-white hover:bg-white/15 disabled:opacity-40"
            onClick={createMorphFromNeighbors}
            disabled={layerIndex >= project.layers.length - 1}
          >
            Morph → next layer
          </button>
        </>
      ) : null}

      {assignments.length > 0 ? (
        <>
          <div className="h-px bg-white/10" />
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            On this layer
          </div>
          <ul className="flex max-h-28 flex-col gap-1 overflow-y-auto">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-[12px]"
              >
                <span className="flex-1 truncate text-white/70">
                  {a.targetIds.length} object{a.targetIds.length === 1 ? "" : "s"} ·{" "}
                  {workflow === "stopmotion"
                    ? `f${a.startFrame ?? 0}–${a.endFrame ?? 0}`
                    : `${a.durationMs}ms`}
                </span>
                <button
                  type="button"
                  className="text-white/40 hover:text-white"
                  onClick={() => {
                    removeMotionAssignment(layer!.id, a.id);
                    const still = (layer!.motionAssignments ?? []).filter(
                      (x) => x.id !== a.id && x.pathId === a.pathId,
                    );
                    if (still.length === 0) removeMotionPath(layer!.id, a.pathId);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** Tiny path glyph for the dock chip. */
export function PathMakerGlyph() {
  return (
    <svg viewBox="0 0 18 18" width={18} height={18} aria-hidden className="overflow-visible">
      <path
        d="M3 14 C6 4, 12 14, 15 4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <circle cx="3" cy="14" r="1.5" fill="currentColor" />
      <circle cx="15" cy="4" r="1.5" fill="currentColor" />
    </svg>
  );
}
