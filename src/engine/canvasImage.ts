/**
 * Canvas ImageElement helpers — place, paint (clipped to artboard), hit-test.
 */

import type { ImageElement } from "@/model/types";

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/** Fit image into ~80% of the artboard, centered. */
export function placeImageInArtboard(
  naturalWidth: number,
  naturalHeight: number,
  projectW: number,
  projectH: number,
): { x: number; y: number; w: number; h: number } {
  const maxW = projectW * 0.8;
  const maxH = projectH * 0.8;
  const scale = Math.min(
    maxW / Math.max(1, naturalWidth),
    maxH / Math.max(1, naturalHeight),
    1,
  );
  const w = Math.max(1, naturalWidth * scale);
  const h = Math.max(1, naturalHeight * scale);
  return {
    x: (projectW - w) / 2,
    y: (projectH - h) / 2,
    w,
    h,
  };
}

/** id → decoded bitmap. Prefer this over src keys (huge data-URLs). */
const imageById = new Map<string, HTMLImageElement>();
/** src → decoded bitmap (fallback / background / reference). */
const imageBySrc = new Map<string, HTMLImageElement>();

function isImageReady(img: HTMLImageElement | null | undefined): boolean {
  return !!img && img.complete && img.naturalWidth > 0;
}

/** Remember a decoded HTMLImageElement for paint (export + stage). */
export function primeImageCache(
  src: string,
  img: HTMLImageElement,
  id?: string,
): void {
  if (!isImageReady(img)) return;
  imageBySrc.set(src, img);
  if (id) imageById.set(id, img);
}

export function cachedImage(src: string): HTMLImageElement | null {
  const hit = imageBySrc.get(src);
  if (hit && isImageReady(hit)) return hit;
  if (!imageBySrc.has(src)) {
    const img = new Image();
    img.src = src;
    imageBySrc.set(src, img);
  }
  return imageBySrc.get(src) ?? null;
}

/** Prefer id-keyed bitmap; fall back to src decode. */
export function cachedImageForElement(
  el: Pick<ImageElement, "id" | "src">,
): HTMLImageElement | null {
  const byId = imageById.get(el.id);
  if (byId && isImageReady(byId)) return byId;
  const bySrc = cachedImage(el.src);
  if (bySrc && isImageReady(bySrc)) {
    imageById.set(el.id, bySrc);
    return bySrc;
  }
  return bySrc;
}

/**
 * Returns a ready image, or null while decoding. Always arms `onReady` when
 * still loading (handles the sync data-URL race where `load` fires before
 * the listener is attached).
 */
export function watchCachedImage(
  src: string,
  onReady: () => void,
  id?: string,
): HTMLImageElement | null {
  const img = id
    ? cachedImageForElement({ id, src })
    : cachedImage(src);
  if (!img) return null;
  if (isImageReady(img)) {
    if (id) imageById.set(id, img);
    return img;
  }

  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    if (id && isImageReady(img)) imageById.set(id, img);
    onReady();
  };
  img.addEventListener("load", done, { once: true });
  img.addEventListener("error", done, { once: true });
  if (isImageReady(img)) {
    queueMicrotask(done);
  } else if (typeof img.decode === "function") {
    void img.decode().then(done).catch(done);
  }
  return null;
}

export async function createImageElementFromFile(
  file: File,
  projectW: number,
  projectH: number,
): Promise<ImageElement> {
  const src = await fileToDataUrl(file);
  const img = await loadHtmlImage(src);
  if (typeof img.decode === "function") {
    try {
      await img.decode();
    } catch {
      /* decode optional — onload already fired */
    }
  }
  const id = crypto.randomUUID();
  primeImageCache(src, img, id);
  const box = placeImageInArtboard(
    img.naturalWidth,
    img.naturalHeight,
    projectW,
    projectH,
  );
  return {
    id,
    src,
    ...box,
    rotation: 0,
    opacity: 1,
    locked: false,
    lockAspect: true,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
  };
}

/** Live Leafer transform preview while a canvas image is being dragged. */
export type ImageLivePreview = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
};

let imageLivePreview: ImageLivePreview | null = null;
const imageLiveListeners = new Set<() => void>();

export function setImageLivePreview(next: ImageLivePreview | null): void {
  // Never publish zero-size previews — they blank StageCanvas paint via resolveImageDrawBox.
  if (next && (!(next.w > 0) || !(next.h > 0))) {
    next = null;
  }
  imageLivePreview = next;
  for (const fn of imageLiveListeners) fn();
}

export function getImageLivePreview(): ImageLivePreview | null {
  return imageLivePreview;
}

export function subscribeImageLivePreview(fn: () => void): () => void {
  imageLiveListeners.add(fn);
  return () => {
    imageLiveListeners.delete(fn);
  };
}

export function resolveImageDrawBox(el: ImageElement): ImageElement {
  const live = imageLivePreview;
  if (!live || live.id !== el.id) return el;
  if (!(live.w > 0) || !(live.h > 0)) return el;
  return {
    ...el,
    x: live.x,
    y: live.y,
    w: live.w,
    h: live.h,
    rotation: live.rotation,
  };
}

function drawOneImage(
  ctx: CanvasRenderingContext2D,
  el: ImageElement,
  alphaMul: number,
) {
  const img = cachedImageForElement(el);
  if (!img || !isImageReady(img)) {
    return false;
  }
  if (!(el.w > 0) || !(el.h > 0)) return false;
  const rot = el.rotation ?? 0;
  const opacity = (el.opacity ?? 1) * alphaMul;
  ctx.save();
  ctx.globalAlpha *= opacity;
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(img, -el.w / 2, -el.h / 2, el.w, el.h);
  ctx.restore();
  return true;
}

/** Paint images under strokes; caller clips to the artboard. Returns false if any src still decoding. */
export function renderImages(
  ctx: CanvasRenderingContext2D,
  images: ImageElement[] | undefined,
  opts?: { skipId?: string | null; onImageReady?: () => void },
): boolean {
  if (!images?.length) return true;
  let allReady = true;
  for (const raw of images) {
    if (opts?.skipId && raw.id === opts.skipId) continue;
    const box = resolveImageDrawBox(raw);
    if (opts?.onImageReady) {
      const ready = watchCachedImage(box.src, opts.onImageReady, box.id);
      if (!ready) allReady = false;
    }
    if (!drawOneImage(ctx, box, 1)) allReady = false;
  }
  return allReady;
}

/**
 * Outside-artboard "outlayer" for a selected image — 10% opacity so handles
 * stay usable. Call after the artboard clip is restored (screen space).
 */
export function paintSelectedImageOverflowGhost(
  ctx: CanvasRenderingContext2D,
  el: ImageElement,
  projectW: number,
  projectH: number,
  fit: { scale: number; ox: number; oy: number },
  canvasW: number,
  canvasH: number,
) {
  const box = resolveImageDrawBox(el);
  if (!imageOverflowsArtboard(box, projectW, projectH)) return;
  const img = cachedImageForElement(box);
  if (!img?.complete || img.naturalWidth <= 0) return;

  const { scale, ox, oy } = fit;
  const bx = ox;
  const by = oy;
  const bw = projectW * scale;
  const bh = projectH * scale;

  ctx.save();
  // Draw only outside the artboard (even-odd: stage minus artboard).
  ctx.beginPath();
  ctx.rect(0, 0, canvasW, canvasH);
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(bx, by, bw, bh, Math.min(12, bw / 2, bh / 2));
  } else {
    ctx.rect(bx, by, bw, bh);
  }
  ctx.clip("evenodd");

  ctx.translate(bx, by);
  ctx.scale(scale, scale);
  drawOneImage(ctx, box, 0.1);
  ctx.restore();
}

/** Axis-aligned hit in project space (rotation approximated via OBB). */
export function hitTestImage(
  el: ImageElement,
  px: number,
  py: number,
): boolean {
  const rot = el.rotation ?? 0;
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const dx = px - cx;
  const dy = py - cy;
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) <= el.w / 2 && Math.abs(ly) <= el.h / 2;
}

/** Snap helpers — Figma-like edge/center guides against the artboard. */
export type GuideLine = { axis: "x" | "y"; at: number };

export function snapImageBox(
  box: { x: number; y: number; w: number; h: number; rotation?: number },
  projectW: number,
  projectH: number,
  threshold = 6,
): { box: { x: number; y: number; w: number; h: number }; guides: GuideLine[] } {
  const guides: GuideLine[] = [];
  let { x, y, w, h } = box;
  const rot = box.rotation ?? 0;
  // Only snap AABB when roughly axis-aligned.
  if (Math.abs(Math.sin(rot)) > 0.08) {
    return { box: { x, y, w, h }, guides };
  }

  const left = x;
  const right = x + w;
  const cx = x + w / 2;
  const top = y;
  const bottom = y + h;
  const cy = y + h / 2;

  const xTargets = [
    { value: left, target: 0, apply: (d: number) => { x += d; } },
    { value: cx, target: projectW / 2, apply: (d: number) => { x += d; } },
    { value: right, target: projectW, apply: (d: number) => { x += d; } },
  ];
  const yTargets = [
    { value: top, target: 0, apply: (d: number) => { y += d; } },
    { value: cy, target: projectH / 2, apply: (d: number) => { y += d; } },
    { value: bottom, target: projectH, apply: (d: number) => { y += d; } },
  ];

  let bestX: { d: number; target: number; apply: (d: number) => void } | null = null;
  for (const t of xTargets) {
    const d = t.target - t.value;
    if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) {
      bestX = { d, target: t.target, apply: t.apply };
    }
  }
  if (bestX) {
    bestX.apply(bestX.d);
    guides.push({ axis: "x", at: bestX.target });
  }

  let bestY: { d: number; target: number; apply: (d: number) => void } | null = null;
  for (const t of yTargets) {
    const d = t.target - t.value;
    if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) {
      bestY = { d, target: t.target, apply: t.apply };
    }
  }
  if (bestY) {
    bestY.apply(bestY.d);
    guides.push({ axis: "y", at: bestY.target });
  }

  return { box: { x, y, w, h }, guides };
}

export function imageOverflowsArtboard(
  el: ImageElement,
  projectW: number,
  projectH: number,
): boolean {
  const box = resolveImageDrawBox(el);
  const rot = box.rotation ?? 0;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const hw = box.w / 2;
  const hh = box.h / 2;
  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of corners) {
    const wx = cx + p.x * c - p.y * s;
    const wy = cy + p.x * s + p.y * c;
    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wx > maxX) maxX = wx;
    if (wy > maxY) maxY = wy;
  }
  return minX < -0.5 || minY < -0.5 || maxX > projectW + 0.5 || maxY > projectH + 0.5;
}
