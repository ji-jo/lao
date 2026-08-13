/**
 * Stage cursors — Remix Icon glyphs as 32×32 SVG data-URIs.
 * Drawing tools put the tip / click point at the **bottom-left** so the
 * glyph reads up-and-right from where the stroke starts.
 */
import type { ToolId } from "@/state/tools";

type CursorSpec = {
  /** Inner SVG markup (no outer <svg>). */
  body: string;
  viewBox: string;
  /** Hotspot in cursor image pixels (32×32). */
  hx: number;
  hy: number;
  fallback: string;
};

/** Remix Icon path `d` values (24×24 viewBox). */
const RI = {
  cursor:
    "M15.3873 13.4975L17.9403 20.5117L13.2418 22.2218L10.6889 15.2076L6.79004 17.6529L8.4086 1.63318L19.9457 12.8646L15.3873 13.4975ZM15.3768 19.3163L12.6618 11.8568L15.6212 11.4459L9.98201 5.9561L9.19088 13.7863L11.7221 12.1988L14.4371 19.6583L15.3768 19.3163Z",
  /** Filled Mac-style pointer (tip at 3,3) — Path tool. */
  pathCursor:
    "M3 3L10 22L12.0513 15.8461C12.6485 14.0544 14.0544 12.6485 15.846 12.0513L22 10L3 3Z",
  penNib:
    "M16.5962 1.03651L22.9428 7.38312C23.1381 7.57838 23.1381 7.89496 22.9428 8.09022C22.8679 8.16513 22.7712 8.21431 22.6665 8.23067L21.1924 8.46113L15.5356 2.80428L15.7477 1.31935C15.7868 1.04599 16.04 0.856036 16.3134 0.895088C16.4205 0.910388 16.5197 0.960011 16.5962 1.03651ZM4.59487 20.1478C8.31725 16.8163 12.5899 15.82 17.2379 14.6273L17.6843 10.6099L13.3869 6.31241L9.36936 6.7588C8.17674 11.4068 7.18038 15.6795 3.84886 19.4018L2.4541 18.0071C5.28253 14.7072 6.34319 11.0539 7.7574 4.9256L14.1214 4.21849L19.7783 9.87539L19.0711 16.2393C12.9429 17.6535 9.28947 18.7142 5.98964 21.5426L4.59487 20.1478ZM9.87872 14.118C9.09767 13.3369 9.09767 12.0706 9.87872 11.2896C10.6598 10.5085 11.9261 10.5085 12.7071 11.2896C13.4882 12.0706 13.4882 13.3369 12.7071 14.118C11.9261 14.899 10.6598 14.899 9.87872 14.118Z",
  brush:
    "M15.4565 9.67503L15.3144 9.53297C14.6661 8.90796 13.8549 8.43369 12.9235 8.18412C10.0168 7.40527 7.22541 9.05273 6.43185 12.0143C6.38901 12.1742 6.36574 12.3537 6.3285 12.8051C6.17423 14.6752 5.73449 16.0697 4.5286 17.4842C6.78847 18.3727 9.46572 18.9986 11.5016 18.9986C13.9702 18.9986 16.1644 17.3394 16.8126 14.9202C17.3306 12.9869 16.7513 11.0181 15.4565 9.67503ZM13.2886 6.21301L18.2278 2.37142C18.6259 2.0618 19.1922 2.09706 19.5488 2.45367L22.543 5.44787C22.8997 5.80448 22.9349 6.37082 22.6253 6.76891L18.7847 11.7068C19.0778 12.8951 19.0836 14.1721 18.7444 15.4379C17.8463 18.7897 14.8142 20.9986 11.5016 20.9986C8 20.9986 3.5 19.4967 1 17.9967C4.97978 14.9967 4.04722 13.1865 4.5 11.4967C5.55843 7.54658 9.34224 5.23935 13.2886 6.21301ZM16.7015 8.09161C16.7673 8.15506 16.8319 8.21964 16.8952 8.28533L18.0297 9.41984L20.5046 6.23786L18.7589 4.4921L15.5769 6.96698L16.7015 8.09161Z",
  pencil:
    "M15.7279 9.57627L14.3137 8.16206L5 17.4758V18.89H6.41421L15.7279 9.57627ZM17.1421 8.16206L18.5563 6.74785L17.1421 5.33363L15.7279 6.74785L17.1421 8.16206ZM7.24264 20.89H3V16.6473L16.435 3.21231C16.8256 2.82179 17.4587 2.82179 17.8492 3.21231L20.6777 6.04074C21.0682 6.43126 21.0682 7.06443 20.6777 7.45495L7.24264 20.89Z",
  markPen:
    "M15.2427 4.5115L8.50547 11.2487L7.79836 13.37L6.7574 14.411L9.58583 17.2394L10.6268 16.1985L12.7481 15.4914L19.4853 8.75414L15.2427 4.5115ZM21.6066 8.04704C21.9972 8.43756 21.9972 9.07073 21.6066 9.46125L13.8285 17.2394L11.7071 17.9465L10.2929 19.3607C9.90241 19.7513 9.26925 19.7513 8.87872 19.3607L4.63608 15.1181C4.24556 14.7276 4.24556 14.0944 4.63608 13.7039L6.0503 12.2897L6.7574 10.1684L14.5356 2.39018C14.9261 1.99966 15.5593 1.99966 15.9498 2.39018L21.6066 8.04704ZM15.2427 7.33993L16.6569 8.75414L11.7071 13.7039L10.2929 12.2897L15.2427 7.33993ZM4.28253 16.8859L7.11096 19.7143L5.69674 21.1285L1.4541 19.7143L4.28253 16.8859Z",
  paint:
    "M19.2277 18.7323L20.9955 16.9645L22.7632 18.7323C23.7395 19.7086 23.7395 21.2915 22.7632 22.2678C21.7869 23.2441 20.204 23.2441 19.2277 22.2678C18.2514 21.2915 18.2514 19.7086 19.2277 18.7323ZM8.87861 1.07971L20.1923 12.3934C20.5828 12.7839 20.5828 13.4171 20.1923 13.8076L11.707 22.2929C11.3165 22.6834 10.6833 22.6834 10.2928 22.2929L1.80754 13.8076C1.41702 13.4171 1.41702 12.7839 1.80754 12.3934L9.58572 4.61525L7.4644 2.49393L8.87861 1.07971ZM10.9999 6.02946L3.92886 13.1005H18.071L10.9999 6.02946Z",
  eraser:
    "M8.58564 8.85449L3.63589 13.8042L8.83021 18.9985L9.99985 18.9978V18.9966H11.1714L14.9496 15.2184L8.58564 8.85449ZM9.99985 7.44027L16.3638 13.8042L19.1922 10.9758L12.8283 4.61185L9.99985 7.44027ZM13.9999 18.9966H20.9999V20.9966H11.9999L8.00229 20.9991L1.51457 14.5113C1.12405 14.1208 1.12405 13.4877 1.51457 13.0971L12.1212 2.49053C12.5117 2.1 13.1449 2.1 13.5354 2.49053L21.3136 10.2687C21.7041 10.6592 21.7041 11.2924 21.3136 11.6829L13.9999 18.9966Z",
  text: "M13 6V21H11V6H5V4H19V6H13Z",
  square:
    "M4 3H20C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM5 5V19H19V5H5Z",
  circle:
    "M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20Z",
  diamond:
    "M12 2.5L21.5 12L12 21.5L2.5 12L12 2.5ZM12 5.328L5.328 12L12 18.672L18.672 12L12 5.328Z",
  shapes:
    "M11.9998 1L6 11H18L11.9998 1ZM11.9998 4.8873L14.4676 9H9.53232L11.9998 4.8873ZM6.75 20C5.23122 20 4 18.7688 4 17.25C4 15.7312 5.23122 14.5 6.75 14.5C8.26878 14.5 9.5 15.7312 9.5 17.25C9.5 18.7688 8.26878 20 6.75 20ZM6.75 22C9.37335 22 11.5 19.8734 11.5 17.25C11.5 14.6266 9.37335 12.5 6.75 12.5C4.12665 12.5 2 14.6266 2 17.25C2 19.8734 4.12665 22 6.75 22ZM15 15.5V19.5H19V15.5H15ZM13 21.5V13.5H21V21.5H13Z",
  arrowUpRight:
    "M5.63589 19.7784L4.22169 18.3644L15.657 6.92908L10.0712 6.92908V4.92908L19.0712 4.92908L19.0712 13.9291H17.0712L17.0712 8.34326L5.63589 19.7784Z",
} as const;

/** Bottom-left hotspot — stroke / drag origin. */
const BL = { hx: 2, hy: 30 } as const;

function cssCursor(spec: CursorSpec): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="${spec.viewBox}">${spec.body}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${spec.hx} ${spec.hy}, ${spec.fallback}`;
}

/**
 * White glyph with a dark offset shadow for contrast on light & dark artboards.
 * `transform` places the 24×24 Remix path inside the 32×32 cursor.
 */
function glyph(path: string, transform: string): string {
  return (
    `<g transform="${transform}">` +
    `<path d="${path}" fill="#111" transform="translate(0.85 0.85)"/>` +
    `<path d="${path}" fill="#fff"/>` +
    `</g>`
  );
}

/**
 * Place a Remix 24×24 tip at the cursor hotspot.
 * Optional `flipX` mirrors the glyph so pour/tips that face BR become BL.
 */
function tipAt(
  path: string,
  tipX: number,
  tipY: number,
  opts: {
    hx?: number;
    hy?: number;
    scale?: number;
    flipX?: boolean;
    fallback?: string;
  } = {},
): CursorSpec {
  const hx = opts.hx ?? BL.hx;
  const hy = opts.hy ?? BL.hy;
  const scale = opts.scale ?? 1.05;
  const flipX = opts.flipX ?? false;
  // After flipX around x=12: tip maps to (24 - tipX).
  const srcX = flipX ? 24 - tipX : tipX;
  const tx = hx - srcX * scale;
  const ty = hy - tipY * scale;
  const transform = flipX
    ? `translate(${tx + 24 * scale} ${ty}) scale(${-scale} ${scale})`
    : `translate(${tx} ${ty}) scale(${scale})`;
  return {
    viewBox: "0 0 32 32",
    hx,
    hy,
    fallback: opts.fallback ?? "crosshair",
    body: glyph(path, transform),
  };
}

/**
 * Centered glyph (shapes pack) — still anchored so the visual mass sits
 * up-right of the BL hotspot for a consistent draw origin.
 */
function floatBl(
  path: string,
  opts: { scale?: number; fallback?: string } = {},
): CursorSpec {
  const scale = opts.scale ?? 0.95;
  // Nudge the 24 glyph so its lower-left corner sits near the hotspot.
  const tx = BL.hx - 2 * scale;
  const ty = BL.hy - 22 * scale;
  return {
    viewBox: "0 0 32 32",
    ...BL,
    fallback: opts.fallback ?? "crosshair",
    body: glyph(path, `translate(${tx} ${ty}) scale(${scale})`),
  };
}

const SPECS: Partial<Record<ToolId, CursorSpec>> = {
  // Pointer tip at top-left (standard select cursor).
  select: tipAt(RI.cursor, 8.41, 1.63, {
    hx: 6,
    hy: 2,
    scale: 1.0,
    fallback: "default",
  }),

  // Path (a) — filled pointer, no stroke (tip at 3,3).
  path: tipAt(RI.pathCursor, 3, 3, {
    hx: 4,
    hy: 4,
    scale: 1.0,
    fallback: "default",
  }),

  // Drawing tools — tip / pour / start at bottom-left.
  ink: tipAt(RI.brush, 4.2, 18.2, { scale: 1.0 }),
  // Pen (p) — nib tip (matches dock PenToolIcon), not pencil.
  pen: tipAt(RI.penNib, 4.0, 20.5, { scale: 1.0 }),
  marker: tipAt(RI.markPen, 1.45, 19.71, { scale: 1.0 }),
  // Bucket pour faces BR in Remix — flip so pour sits at BL.
  fill: tipAt(RI.paint, 20.5, 22.3, { flipX: true, scale: 1.0, fallback: "cell" }),
  eraser: tipAt(RI.eraser, 1.8, 20.5, { scale: 1.0, fallback: "cell" }),
  text: tipAt(RI.text, 12, 4, { hx: 10, hy: 4, scale: 1.0, fallback: "text" }),

  // Shape create — glyph floats up-right of the BL drag origin.
  rect: floatBl(RI.square),
  diamond: floatBl(RI.diamond),
  circle: floatBl(RI.circle),
  shapes: floatBl(RI.shapes, { scale: 0.9 }),
  arrow: tipAt(RI.arrowUpRight, 4.22, 18.36, { scale: 1.0 }),
  line: tipAt(RI.arrowUpRight, 4.22, 18.36, { scale: 1.0 }),

  hand: {
    viewBox: "0 0 32 32",
    hx: 16,
    hy: 16,
    fallback: "grab",
    body: "",
  },
};

const cache = new Map<ToolId, string>();

/** CSS `cursor` value for a tool (custom icon + keyword fallback). */
export function cursorForTool(tool: ToolId): string {
  const hit = cache.get(tool);
  if (hit) return hit;

  if (tool === "hand") {
    const v = "grab";
    cache.set(tool, v);
    return v;
  }

  const spec = SPECS[tool];
  if (!spec || !spec.body) {
    const v = spec?.fallback ?? "crosshair";
    cache.set(tool, v);
    return v;
  }
  const v = cssCursor(spec);
  cache.set(tool, v);
  return v;
}
