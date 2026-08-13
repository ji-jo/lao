/**
 * Demo stop-motion: gift box opens (lid rotateY → back), confetti bursts.
 * Proof that anybody can animate in lao.
 */
import type { Frame, Project, Stroke, StrokePoint, TextElement } from "@/model/types";

export const DEMO_W = 1282;
export const DEMO_H = 914;
export const DEMO_FPS = 12;
/** ~5s at 12fps */
export const DEMO_FRAMES = 60;

const BOX_STROKE = "#2a2220";
const BOX_FILL = "rgba(232, 72, 85, 0.92)";
const LID_FILL = "rgba(240, 113, 120, 0.95)";
const RIBBON = "#ffd166";
const RIBBON_FILL = "rgba(255, 209, 102, 0.95)";

const CONFETTI_COLORS = [
  "#ff6b9d",
  "#ffd93d",
  "#6bcbff",
  "#b8f2e6",
  "#c77dff",
  "#ff9f43",
  "#fff1a8",
];

type Pt = { x: number; y: number };

function pt(x: number, y: number, t = 0, pressure = 0.85): StrokePoint {
  return { x, y, pressure, t };
}

function sampleSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t0: number,
  out: StrokePoint[],
  spacing = 5,
): number {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / spacing));
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    out.push(pt(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, t0 + u));
  }
  return t0 + 1;
}

function poly(corners: Pt[], closed = true, spacing = 5): StrokePoint[] {
  if (!corners.length) return [];
  const out: StrokePoint[] = [pt(corners[0]!.x, corners[0]!.y, 0)];
  let t = 0;
  for (let i = 1; i < corners.length; i++) {
    t = sampleSegment(
      corners[i - 1]!.x,
      corners[i - 1]!.y,
      corners[i]!.x,
      corners[i]!.y,
      t,
      out,
      spacing,
    );
  }
  if (closed && corners.length > 2) {
    sampleSegment(
      corners[corners.length - 1]!.x,
      corners[corners.length - 1]!.y,
      corners[0]!.x,
      corners[0]!.y,
      t,
      out,
      spacing,
    );
  }
  return out;
}

function rotateAround(p: Pt, origin: Pt, angle: number): Pt {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * c - dy * s,
    y: origin.y + dx * s + dy * c,
  };
}

function mkStroke(
  id: string,
  points: StrokePoint[],
  opts: Partial<Stroke> & Pick<Stroke, "color" | "size">,
): Stroke {
  return {
    id,
    brush: "ink",
    seed: hashId(id),
    jitter: true,
    points,
    ...opts,
  };
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function easeOutCubic(u: number): number {
  const t = Math.max(0, Math.min(1, u));
  return 1 - (1 - t) ** 3;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** Layout in project space */
const CX = DEMO_W / 2;
const BOX_W = 300;
const BOX_H = 210;
const BOX_TOP = 430;
const BOX_LEFT = CX - BOX_W / 2;
const BOX_RIGHT = BOX_LEFT + BOX_W;
const BOX_BOTTOM = BOX_TOP + BOX_H;

function boxBodyStrokes(): Stroke[] {
  const body = poly([
    { x: BOX_LEFT, y: BOX_TOP },
    { x: BOX_RIGHT, y: BOX_TOP },
    { x: BOX_RIGHT, y: BOX_BOTTOM },
    { x: BOX_LEFT, y: BOX_BOTTOM },
  ]);
  const ribbonV = poly(
    [
      { x: CX - 16, y: BOX_TOP },
      { x: CX + 16, y: BOX_TOP },
      { x: CX + 16, y: BOX_BOTTOM },
      { x: CX - 16, y: BOX_BOTTOM },
    ],
    true,
    4,
  );
  const ribbonH = poly(
    [
      { x: BOX_LEFT, y: BOX_TOP + BOX_H * 0.42 - 14 },
      { x: BOX_RIGHT, y: BOX_TOP + BOX_H * 0.42 - 14 },
      { x: BOX_RIGHT, y: BOX_TOP + BOX_H * 0.42 + 14 },
      { x: BOX_LEFT, y: BOX_TOP + BOX_H * 0.42 + 14 },
    ],
    true,
    4,
  );
  return [
    mkStroke("box-body", body, {
      color: BOX_STROKE,
      size: 9,
      closed: true,
      fillColor: BOX_FILL,
    }),
    mkStroke("ribbon-v", ribbonV, {
      color: BOX_STROKE,
      size: 5,
      closed: true,
      fillColor: RIBBON_FILL,
    }),
    mkStroke("ribbon-h", ribbonH, {
      color: BOX_STROKE,
      size: 5,
      closed: true,
      fillColor: RIBBON_FILL,
    }),
  ];
}

/* ─── Lid: cardboard-box open (images 2 & 3) ─────────────────────────────
 * Hinge on the back rim. Constant width always — no trapezoid stretch.
 * Phase 1: tip ajar (rigid short rect). Phase 2: upright back panel
 * (same width as the box), like the mailer-box photos.
 */

const LID_H = 58;
const OPEN_PANEL = Math.round(BOX_H * 0.5); // upright face ~ half box tall
const LID_LEFT = BOX_LEFT - 8;
const LID_RIGHT = BOX_RIGHT + 8;

function lidRect(yA: number, yB: number): [Pt, Pt, Pt, Pt] {
  return [
    { x: LID_LEFT, y: yA },
    { x: LID_RIGHT, y: yA },
    { x: LID_RIGHT, y: yB },
    { x: LID_LEFT, y: yB },
  ];
}

/** openT 0→1 — mailer-box lid: ajar, then upright on the back hinge. */
function lidCornersAt(openT: number): [Pt, Pt, Pt, Pt] {
  const u = easeOutCubic(Math.max(0, Math.min(1, openT)));

  if (u < 0.45) {
    // Closed → slightly ajar (free edge lifts a little). Width fixed.
    const a = u / 0.45;
    const yBack = BOX_TOP - LID_H;
    const yFront = lerp(BOX_TOP, BOX_TOP - LID_H * 0.4, a);
    return lidRect(yBack, yFront);
  }

  // Upright on the back rim — same width as box, standing up (photos 2 & 3).
  // Snap to full panel (no height morph = no stretch).
  return lidRect(BOX_TOP, BOX_TOP - OPEN_PANEL);
}

function mapOnLid(u: number, v: number, corners: [Pt, Pt, Pt, Pt]): Pt {
  const [bl, br, fr, fl] = corners;
  const top = lerpPt(bl, br, u);
  const bot = lerpPt(fl, fr, u);
  return lerpPt(top, bot, v);
}

function lidStrokes(openT: number): { strokes: Stroke[]; corners: [Pt, Pt, Pt, Pt] } {
  const corners = lidCornersAt(openT);
  const lid = poly([...corners], true, 5);
  const stripe = poly(
    [
      mapOnLid(0.45, 0, corners),
      mapOnLid(0.55, 0, corners),
      mapOnLid(0.55, 1, corners),
      mapOnLid(0.45, 1, corners),
    ],
    true,
    4,
  );
  const underside = openT > 0.45;
  const tag = openT.toFixed(3);
  return {
    corners,
    strokes: [
      mkStroke(`lid-${tag}`, lid, {
        color: BOX_STROKE,
        size: 8,
        closed: true,
        fillColor: underside ? "rgba(160, 60, 72, 0.96)" : LID_FILL,
      }),
      mkStroke(`lid-stripe-${tag}`, stripe, {
        color: BOX_STROKE,
        size: 4,
        closed: true,
        fillColor: RIBBON_FILL,
      }),
    ],
  };
}

function bowStrokes(corners: [Pt, Pt, Pt, Pt], openT: number): Stroke[] {
  // Bow only while mostly closed — UV-mapping it onto the swinging lid stretches it.
  if (openT > 0.35) return [];
  const onLid = (u: number, v: number) => mapOnLid(u, v, corners);
  const left = poly(
    [
      onLid(0.48, 0.55),
      onLid(0.18, 0.05),
      onLid(0.12, 0.4),
      onLid(0.32, 0.75),
      onLid(0.48, 0.62),
    ],
    true,
    4,
  );
  const right = poly(
    [
      onLid(0.52, 0.55),
      onLid(0.82, 0.05),
      onLid(0.88, 0.4),
      onLid(0.68, 0.75),
      onLid(0.52, 0.62),
    ],
    true,
    4,
  );
  const knot = poly(
    [
      onLid(0.44, 0.35),
      onLid(0.56, 0.35),
      onLid(0.56, 0.7),
      onLid(0.44, 0.7),
    ],
    true,
    3,
  );
  const tag = `${corners[0].y.toFixed(1)}`;
  return [
    mkStroke(`bow-l-${tag}`, left, {
      color: BOX_STROKE,
      size: 5,
      closed: true,
      fillColor: RIBBON_FILL,
    }),
    mkStroke(`bow-r-${tag}`, right, {
      color: BOX_STROKE,
      size: 5,
      closed: true,
      fillColor: RIBBON_FILL,
    }),
    mkStroke(`bow-knot-${tag}`, knot, {
      color: BOX_STROKE,
      size: 5,
      closed: true,
      fillColor: RIBBON,
    }),
  ];
}

type ConfettiPiece = {
  id: string;
  color: string;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  spin: number;
  size: number;
  kind: "rect" | "line" | "diamond";
};

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function makeConfetti(count = 42): ConfettiPiece[] {
  const rand = seededRand(0x61f7b0a1);
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI * 0.15 - rand() * Math.PI * 0.7;
    const speed = 9 + rand() * 16;
    pieces.push({
      id: `c${i}`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      x0: CX + (rand() - 0.5) * 40,
      y0: BOX_TOP - 10,
      vx: Math.cos(angle) * speed * (rand() > 0.5 ? 1 : -1) * (0.55 + rand()),
      vy: Math.sin(angle) * speed - 6 - rand() * 10,
      spin: (rand() - 0.5) * 0.55,
      size: 7 + rand() * 11,
      kind: (["rect", "line", "diamond"] as const)[i % 3]!,
    });
  }
  return pieces;
}

function confettiStroke(piece: ConfettiPiece, frameFromBurst: number): Stroke {
  const t = Math.max(0, frameFromBurst);
  const gravity = 0.55;
  const x = piece.x0 + piece.vx * t;
  const y = piece.y0 + piece.vy * t + 0.5 * gravity * t * t;
  const angle = piece.spin * t;
  const s = piece.size;

  let corners: Pt[];
  if (piece.kind === "line") {
    const a = rotateAround({ x: x - s, y }, { x, y }, angle);
    const b = rotateAround({ x: x + s, y }, { x, y }, angle);
    corners = [a, b];
  } else if (piece.kind === "diamond") {
    corners = [
      rotateAround({ x, y: y - s * 0.7 }, { x, y }, angle),
      rotateAround({ x: x + s * 0.5, y }, { x, y }, angle),
      rotateAround({ x, y: y + s * 0.7 }, { x, y }, angle),
      rotateAround({ x: x - s * 0.5, y }, { x, y }, angle),
    ];
  } else {
    const hw = s * 0.45;
    const hh = s * 0.28;
    corners = [
      rotateAround({ x: x - hw, y: y - hh }, { x, y }, angle),
      rotateAround({ x: x + hw, y: y - hh }, { x, y }, angle),
      rotateAround({ x: x + hw, y: y + hh }, { x, y }, angle),
      rotateAround({ x: x - hw, y: y + hh }, { x, y }, angle),
    ];
  }

  const closed = piece.kind !== "line";
  return mkStroke(`${piece.id}-f${t}`, poly(corners, closed, 3), {
    color: piece.color,
    size: piece.kind === "line" ? 5 : 3.5,
    closed,
    fillColor: closed ? piece.color : undefined,
    jitter: true,
  });
}

const OPEN_START = 10;
const OPEN_END = 24;
const BURST_FRAME = 20;
const TAGLINE_FRAME = 40;

function buildGiftFrame(frame: number, confetti: ConfettiPiece[]): Frame {
  const openT =
    frame <= OPEN_START
      ? 0
      : frame >= OPEN_END
        ? 1
        : (frame - OPEN_START) / (OPEN_END - OPEN_START);

  const { strokes: lid, corners } = lidStrokes(openT);
  // Once open, paint lid behind the body so it reads as the back panel
  // standing up (mailer-box photos) — not a stretched cap on top.
  const body = boxBodyStrokes();
  const bow = bowStrokes(corners, openT);
  const strokes: Stroke[] =
    openT > 0.5
      ? [...lid, ...body, ...bow]
      : [...body, ...lid, ...bow];

  if (frame >= BURST_FRAME) {
    const age = frame - BURST_FRAME;
    for (const piece of confetti) {
      strokes.push(confettiStroke(piece, age));
    }
  }

  const texts: TextElement[] = [];
  if (frame >= TAGLINE_FRAME) {
    const fade = Math.min(1, (frame - TAGLINE_FRAME) / 6);
    texts.push({
      id: "tagline",
      text: "anybody can animate :)",
      x: CX - 320,
      y: 160,
      fontFamily: "Geist",
      size: 42,
      color: "#f4f4f5",
      align: "center",
      boxWidth: 640,
      opacity: Math.round(fade * 100),
      letterSpacing: 1,
    });
  }

  return {
    id: `cel-${frame}`,
    strokes,
    texts,
    images: [],
  };
}

export function createGiftBoxDemoProject(): Project {
  const confetti = makeConfetti(46);
  const frames: (Frame | null)[] = [];
  for (let i = 0; i < DEMO_FRAMES; i++) {
    frames.push(buildGiftFrame(i, confetti));
  }

  return {
    version: 1,
    name: "Gift Box Demo",
    width: DEMO_W,
    height: DEMO_H,
    fps: DEMO_FPS,
    frameCount: DEMO_FRAMES,
    workflow: "stopmotion",
    background: { kind: "color", color: "#141416" },
    boil: {
      amplitude: 1.05,
      jitter: 0.4,
      intensity: 0.5,
      speed: 1.1,
      variety: 3,
    },
    layers: [
      {
        id: "layer-gift",
        name: "Gift",
        visible: true,
        isStatic: false,
        frames,
      },
    ],
  };
}
