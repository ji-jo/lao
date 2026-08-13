import type { BezierNode, MotionPath, StrokePoint } from "@/model/types";
import { flattenBezierNodes } from "@/lib/bezier";

/**
 * Built-in motion-path shapes. Each produces editable BezierNodes so the user
 * can reshape after placement the same way as a pen-drawn guide.
 */

export type MotionPathPresetId =
  | "straight"
  | "arc"
  | "sCurve"
  | "zigzag"
  | "loop";

export const MOTION_PATH_PRESETS: {
  id: MotionPathPresetId;
  label: string;
}[] = [
  { id: "straight", label: "Straight" },
  { id: "arc", label: "Arc" },
  { id: "sCurve", label: "S-curve" },
  { id: "zigzag", label: "Zigzag" },
  { id: "loop", label: "Loop" },
];

function node(
  x: number,
  y: number,
  handleIn?: { x: number; y: number },
  handleOut?: { x: number; y: number },
): BezierNode {
  return { x, y, handleIn, handleOut };
}

/**
 * Build preset BezierNodes spanning from A → B in project space.
 * Length defaults to 240px along +X from the anchor when end is omitted.
 */
export function buildPresetBezierNodes(
  preset: MotionPathPresetId,
  start: { x: number; y: number },
  end?: { x: number; y: number },
): BezierNode[] {
  const a = start;
  const b = end ?? { x: a.x + 240, y: a.y };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = Math.max(40, len * 0.28);

  if (preset === "straight") {
    const hx = dx * 0.33;
    const hy = dy * 0.33;
    return [
      node(a.x, a.y, undefined, { x: a.x + hx, y: a.y + hy }),
      node(b.x, b.y, { x: b.x - hx, y: b.y - hy }),
    ];
  }

  if (preset === "arc") {
    const mid = {
      x: (a.x + b.x) / 2 + nx * amp,
      y: (a.y + b.y) / 2 + ny * amp,
    };
    return [
      node(a.x, a.y, undefined, {
        x: a.x + dx * 0.25 + nx * amp * 0.5,
        y: a.y + dy * 0.25 + ny * amp * 0.5,
      }),
      node(mid.x, mid.y, {
        x: mid.x - dx * 0.2,
        y: mid.y - dy * 0.2,
      }, {
        x: mid.x + dx * 0.2,
        y: mid.y + dy * 0.2,
      }),
      node(b.x, b.y, {
        x: b.x - dx * 0.25 + nx * amp * 0.5,
        y: b.y - dy * 0.25 + ny * amp * 0.5,
      }),
    ];
  }

  if (preset === "sCurve") {
    return [
      node(a.x, a.y, undefined, {
        x: a.x + dx * 0.25 + nx * amp,
        y: a.y + dy * 0.25 + ny * amp,
      }),
      node(b.x, b.y, {
        x: b.x - dx * 0.25 - nx * amp,
        y: b.y - dy * 0.25 - ny * amp,
      }),
    ];
  }

  if (preset === "zigzag") {
    const p1 = {
      x: a.x + dx * 0.33 + nx * amp,
      y: a.y + dy * 0.33 + ny * amp,
    };
    const p2 = {
      x: a.x + dx * 0.66 - nx * amp,
      y: a.y + dy * 0.66 - ny * amp,
    };
    return [
      node(a.x, a.y),
      node(p1.x, p1.y),
      node(p2.x, p2.y),
      node(b.x, b.y),
    ];
  }

  // loop — small circular detour mid-path
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const r = amp;
  return [
    node(a.x, a.y, undefined, {
      x: a.x + dx * 0.15,
      y: a.y + dy * 0.15,
    }),
    node(midX + nx * r, midY + ny * r, {
      x: midX + nx * r - dx * 0.15,
      y: midY + ny * r - dy * 0.15,
    }, {
      x: midX + nx * r + dx * 0.15 + ny * r,
      y: midY + ny * r + dy * 0.15 - nx * r,
    }),
    node(midX - nx * r, midY - ny * r, {
      x: midX - nx * r + ny * r,
      y: midY - ny * r - nx * r,
    }, {
      x: midX - nx * r + dx * 0.15,
      y: midY - ny * r + dy * 0.15,
    }),
    node(b.x, b.y, {
      x: b.x - dx * 0.15,
      y: b.y - dy * 0.15,
    }),
  ];
}

/** Create a full MotionPath from a preset, anchored at `start`. */
export function createPresetMotionPath(
  preset: MotionPathPresetId,
  start: { x: number; y: number },
  end?: { x: number; y: number },
  id = crypto.randomUUID(),
): MotionPath {
  const bezierNodes = buildPresetBezierNodes(preset, start, end);
  const points: StrokePoint[] = flattenBezierNodes(bezierNodes);
  return { id, bezierNodes, points };
}

/** Create a MotionPath from pen-authored nodes. */
export function createPenMotionPath(
  bezierNodes: BezierNode[],
  id = crypto.randomUUID(),
): MotionPath {
  return {
    id,
    bezierNodes: bezierNodes.map((n) => ({
      ...n,
      handleIn: n.handleIn ? { ...n.handleIn } : undefined,
      handleOut: n.handleOut ? { ...n.handleOut } : undefined,
    })),
    points: flattenBezierNodes(bezierNodes),
  };
}

/** Re-flatten points after the user edits bezier nodes. */
export function syncMotionPathPoints(path: MotionPath): MotionPath {
  return { ...path, points: flattenBezierNodes(path.bezierNodes) };
}
