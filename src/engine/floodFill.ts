import type { StrokePoint } from "@/model/types";

export interface FillMaskCrop {
  /** 0/1 per pixel, row-major, size width*height */
  alpha: Uint8Array;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export interface FloodFillResult {
  boundary: StrokePoint[];
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  pixelCount: number;
  /**
   * Cropped binary mask of the filled pocket. Used so regions with holes don't
   * collapse to a solid polygon that paints over nested voids.
   */
  mask?: FillMaskCrop;
}

function colorMatch(d: Uint8ClampedArray, i: number, j: number, tolerance: number): boolean {
  return (
    Math.abs(d[i] - d[j]) <= tolerance &&
    Math.abs(d[i + 1] - d[j + 1]) <= tolerance &&
    Math.abs(d[i + 2] - d[j + 2]) <= tolerance &&
    Math.abs(d[i + 3] - d[j + 3]) <= tolerance
  );
}

function dilateBinary(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const out = new Uint8Array(width * height);
  const r2 = radius * radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!src[y * width + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            out[ny * width + nx] = 1;
          }
        }
      }
    }
  }
  return out;
}

/** Dilate rendered ink slightly so bucket fill closes hairline loop gaps. */
export function sealInkGaps(ctx: CanvasRenderingContext2D, radiusPx: number): void {
  if (radiusPx <= 0) return;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    ink[i] = data[i * 4 + 3]! > 20 ? 1 : 0;
  }
  const dilated = dilateBinary(ink, width, height, radiusPx);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!dilated[i] || ink[i]) continue;
      let best = radiusPx + 1;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = -radiusPx; dy <= radiusPx; dy++) {
        for (let dx = -radiusPx; dx <= radiusPx; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (!ink[ny * width + nx]) continue;
          const d = Math.hypot(dx, dy);
          if (d < best) {
            best = d;
            const p = (ny * width + nx) * 4;
            r = data[p]!;
            g = data[p + 1]!;
            b = data[p + 2]!;
          }
        }
      }
      const p = i * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export interface FillEdgeAdjust {
  /** Outward shift in canvas pixels (Photoshop “Shift Edge”). */
  shiftPx?: number;
  /** Soft edge reach in canvas pixels (Photoshop “Feather”). */
  featherPx?: number;
}

/** Blur a binary mask so feather expands into anti-aliased ink edges. */
function featherBinaryMask(
  mask: Uint8Array,
  width: number,
  height: number,
  featherPx: number,
): Uint8Array {
  if (featherPx <= 0) return mask;
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const ctx = scratch.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const v = mask[i] ? 255 : 0;
    const p = i * 4;
    img.data[p] = v;
    img.data[p + 1] = v;
    img.data[p + 2] = v;
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.filter = `blur(${featherPx}px)`;
  ctx.drawImage(scratch, 0, 0);
  ctx.filter = "none";
  const blurred = ctx.getImageData(0, 0, width, height).data;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    out[i] = blurred[i * 4]! > 72 ? 1 : 0;
  }
  return out;
}

/** Shift edge + feather on a flood-fill mask (Photoshop-style edge grow). */
export function applyFillEdgeAdjustments(
  visited: Uint8Array,
  width: number,
  height: number,
  adjust: FillEdgeAdjust,
): void {
  const shiftPx = adjust.shiftPx ?? 0;
  const featherPx = adjust.featherPx ?? 0;
  if (shiftPx <= 0 && featherPx <= 0) return;

  const mask: Uint8Array = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (visited[i] === 1) mask[i] = 1;
  }
  const shifted =
    shiftPx > 0 ? dilateBinary(mask, width, height, shiftPx) : mask;
  const feathered =
    featherPx > 0 ? featherBinaryMask(shifted, width, height, featherPx) : shifted;
  for (let i = 0; i < width * height; i++) {
    if (feathered[i]) visited[i] = 1;
  }
}

export function computeFloodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  tolerance = 32,
  edgeAdjust?: FillEdgeAdjust,
): FloodFillResult | null {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  startX = Math.floor(startX);
  startY = Math.floor(startY);
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return null;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const startIdx = (startY * width + startX) * 4;

  const visited = new Uint8Array(width * height);
  const queue: [number, number][] = [[startX, startY]];
  visited[startY * width + startX] = 1;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let filledCount = 0;

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    filledCount++;

    // Check neighbors
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdxStr = ny * width + nx;
        if (visited[nIdxStr] === 0) {
          const nIdx = nIdxStr * 4;
          if (colorMatch(data, startIdx, nIdx, tolerance)) {
            visited[nIdxStr] = 1;
            queue.push([nx, ny]);
          } else {
            visited[nIdxStr] = 2; // boundary/checked
          }
        }
      }
    }
  }

  if (filledCount === 0) return null;

  if (edgeAdjust) {
    applyFillEdgeAdjustments(visited, width, height, edgeAdjust);
  }

  // Moore neighborhood tracing
  let startBx = -1, startBy = -1;
  outer: for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (visited[y * width + x] === 1) {
        startBx = x;
        startBy = y;
        break outer;
      }
    }
  }

  if (startBx === -1) return null;

  const boundaryPoints: { x: number; y: number }[] = [];
  let cx = startBx, cy = startBy;
  // Directions: 0:N, 1:NE, 2:E, 3:SE, 4:S, 5:SW, 6:W, 7:NW
  const dirX = [0, 1, 1, 1, 0, -1, -1, -1];
  const dirY = [-1, -1, 0, 1, 1, 1, 0, -1];
  
  let backtrackDir = 6;
  let loopCount = 0;
  const maxLoops = (maxX - minX + 2) * (maxY - minY + 2) * 8; 

  do {
    boundaryPoints.push({ x: cx, y: cy });
    
    let found = false;
    for (let i = 1; i <= 8; i++) {
      const dir = (backtrackDir + i) % 8;
      const nx = cx + dirX[dir];
      const ny = cy + dirY[dir];
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (visited[ny * width + nx] === 1) {
          // Check if this pixel is on the edge of the filled region
          let isEdge = false;
          for (const [dx, dy] of [[1,0], [-1,0], [0,1], [0,-1]]) {
            const ex = nx + dx;
            const ey = ny + dy;
            if (ex < 0 || ey < 0 || ex >= width || ey >= height || visited[ey * width + ex] !== 1) {
              isEdge = true;
              break;
            }
          }
          if (isEdge) {
            cx = nx;
            cy = ny;
            backtrackDir = (dir + 4 + 2) % 8; 
            found = true;
            break;
          }
        }
      }
    }
    
    if (!found) break; 
    loopCount++;
    if (loopCount > maxLoops) break; 
    
  } while ((cx !== startBx || cy !== startBy) && loopCount > 0);

  let simplified = simplifyPath(boundaryPoints, 1.5);
  // Moore tracing can collapse on large / nested pockets — rebuild from mask.
  if (simplified.length < 3) {
    simplified = contourFromMask(visited, minX, minY, maxX, maxY, width);
  }

  const points: StrokePoint[] = simplified.map(p => ({ x: p.x, y: p.y, pressure: 0.5, t: 0 }));
  const mw = maxX - minX + 1;
  const mh = maxY - minY + 1;
  const alpha = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (visited[(y + minY) * width + (x + minX)] === 1) {
        alpha[y * mw + x] = 1;
      }
    }
  }

  return {
    boundary: points,
    width: mw,
    height: mh,
    offsetX: minX,
    offsetY: minY,
    pixelCount: filledCount,
    mask: { alpha, width: mw, height: mh, offsetX: minX, offsetY: minY },
  };
}

/** Tint a binary fill mask into a PNG data URL (sync). */
export function colorizeFillMask(mask: FillMaskCrop, color: string): string | null {
  const { width: w, height: h, alpha } = mask;
  if (w <= 0 || h <= 0) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < alpha.length; i++) {
    d[i * 4 + 3] = alpha[i] ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  try {
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Left/right scanline contour when Moore boundary walk fails. */
function contourFromMask(
  visited: Uint8Array,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  width: number,
): { x: number; y: number }[] {
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let y = minY; y <= maxY; y++) {
    let lo = -1;
    let hi = -1;
    for (let x = minX; x <= maxX; x++) {
      if (visited[y * width + x] === 1) {
        if (lo < 0) lo = x;
        hi = x;
      }
    }
    if (lo < 0) continue;
    left.push({ x: lo, y });
    right.push({ x: hi, y });
  }
  if (left.length < 2) return [];
  const ring = left.concat(right.reverse());
  return simplifyPath(ring, 1.5);
}

function simplifyPath(points: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = pointLineDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > tolerance) {
    const left = simplifyPath(points.slice(0, index + 1), tolerance);
    const right = simplifyPath(points.slice(index), tolerance);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [points[0], points[end]];
  }
}

function pointLineDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const num = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x);
  const den = Math.hypot(b.y - a.y, b.x - a.x);
  return den === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : num / den;
}
