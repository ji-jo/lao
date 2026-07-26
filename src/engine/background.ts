import type { Background, Project } from "@/model/types";

/**
 * Background painting for canvas contexts (edit stage, preview composition,
 * export). Shader backgrounds live as DOM layers (see LaoComposition /
 * ShaderSnapshotMount); here they get either a snapshot drawImage (export)
 * or a flat first-color approximation (edit draft).
 */

/** Parse a CSS gradient string from the color picker into canvas stops. */
export function parseCssGradient(css: string): {
  shape: "linear" | "radial";
  angle: number;
  stops: { color: string; at: number }[];
} | null {
  const v = css.trim();
  if (!/gradient/i.test(v)) return null;
  const shape: "linear" | "radial" = /radial-gradient/i.test(v)
    ? "radial"
    : "linear";
  const angleMatch = v.match(/linear-gradient\(\s*([\d.]+)deg/i);
  const angle = angleMatch ? Math.round(Number(angleMatch[1])) : 90;
  const body = v.replace(/^(?:linear|radial)-gradient\(/i, "").replace(/\)$/, "");
  const parts = body.split(/,(?![^(]*\))/).map((p) => p.trim());
  const stops: { color: string; at: number }[] = [];
  for (const part of parts) {
    if (/^(?:[\d.]+deg|circle|ellipse|to\s+)/i.test(part)) continue;
    // Library marks the selected stop with uppercase RGBA(...)
    const m = part.match(
      /^(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})\s*([\d.]+)?%?\s*$/i,
    );
    if (!m) continue;
    stops.push({
      color: m[1],
      at:
        m[2] !== undefined
          ? Number(m[2]) / 100
          : stops.length === 0
            ? 0
            : 1,
    });
  }
  if (stops.length < 2) return null;
  for (let i = 0; i < stops.length; i++) {
    if (!Number.isFinite(stops[i].at)) stops[i].at = i / (stops.length - 1);
  }
  return { shape, angle, stops };
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const imageCache = new Map<string, HTMLImageElement>();

/** cached lookup; kicks off loading and invokes onReady once decodable */
export function getBackgroundImage(src: string, onReady?: () => void): HTMLImageElement | null {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imageCache.set(src, img);
  }
  if (img.complete && img.naturalWidth > 0) return img;
  if (onReady) img.addEventListener("load", onReady, { once: true });
  return null;
}

export function loadBackgroundImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const cached = imageCache.get(src);
    if (cached?.complete && cached.naturalWidth > 0) return resolve(cached);
    const img = cached ?? new Image();
    if (!cached) {
      img.src = src;
      imageCache.set(src, img);
    }
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", reject, { once: true });
  });
}

export function drawImageFitted(
  ctx: Ctx,
  img: CanvasImageSource & { width?: number; height?: number },
  iw: number,
  ih: number,
  w: number,
  h: number,
  fit: "fill" | "cover" | "contain" | "crop",
  position: { x: number; y: number } = { x: 0.5, y: 0.5 },
  zoom = 1,
) {
  if (!(iw > 0 && ih > 0 && w > 0 && h > 0)) return;
  const px = Math.min(1, Math.max(0, position.x));
  const py = Math.min(1, Math.max(0, position.y));
  const z = Math.max(0.01, zoom);

  // Fill at exactly 100% stretches to the frame. Any other zoom is
  // aspect-preserving so zooming never stretches the image.
  if (fit === "fill" && Math.abs(z - 1) < 0.001) {
    ctx.drawImage(img, 0, 0, w, h);
    return;
  }

  // Crop = natural pixels × zoom (clipped by the artboard).
  if (fit === "crop") {
    const dw = iw * z;
    const dh = ih * z;
    ctx.drawImage(img, (w - dw) * px, (h - dh) * py, dw, dh);
    return;
  }

  // Aspect-preserving base scale for contain / cover (and fill when zoom ≠ 1).
  const base =
    fit === "contain" || (fit === "fill" && z < 1)
      ? Math.min(w / iw, h / ih)
      : Math.max(w / iw, h / ih);
  const scale = base * z;
  const dw = iw * scale;
  const dh = ih * scale;

  // Still covers the frame → source-rect crop (uniform scale, no stretch).
  if (dw >= w - 0.5 && dh >= h - 0.5) {
    const sw = w / scale;
    const sh = h / scale;
    const sx = Math.max(0, Math.min(iw - sw, (iw - sw) * px));
    const sy = Math.max(0, Math.min(ih - sh, (ih - sh) * py));
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return;
  }

  // Letterbox / pillarbox — image aspect preserved.
  ctx.drawImage(img, (w - dw) * px, (h - dh) * py, dw, dh);
}

export interface PaintBackgroundOptions {
  /** live shader canvas to stamp (export path) */
  shaderCanvas?: HTMLCanvasElement | null;
  /** live image-filter WebGL canvas to stamp */
  imageFilterCanvas?: HTMLCanvasElement | null;
  /** draft mode: shader falls back to flat first color */
  onImageReady?: () => void;
}

/** Paints the project background into a project-resolution context. */
export function paintBackground(ctx: Ctx, project: Project, opts: PaintBackgroundOptions = {}) {
  const { width: w, height: h } = project;
  const bg: Background = project.background ?? { kind: "none" };

  switch (bg.kind) {
    case "none":
      return false; // caller decides (checker in edit, dark in export)
    case "color":
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
      return true;
    case "gradient": {
      const parsed = bg.css ? parseCssGradient(bg.css) : null;
      const shape = parsed?.shape ?? bg.shape;
      const angle = parsed?.angle ?? bg.angle;
      const stops =
        parsed?.stops && parsed.stops.length >= 2
          ? parsed.stops
          : [
              { color: bg.from, at: 0 },
              { color: bg.to, at: 1 },
            ];
      let grad: CanvasGradient;
      if (shape === "radial") {
        grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
      } else {
        const rad = ((angle - 90) * Math.PI) / 180;
        const cx = w / 2, cy = h / 2;
        const len = (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) / 2;
        grad = ctx.createLinearGradient(
          cx - Math.cos(rad) * len, cy - Math.sin(rad) * len,
          cx + Math.cos(rad) * len, cy + Math.sin(rad) * len,
        );
      }
      for (const stop of stops) {
        grad.addColorStop(Math.max(0, Math.min(1, stop.at)), stop.color);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      return true;
    }
    case "image": {
      ctx.fillStyle = "#141416";
      ctx.fillRect(0, 0, w, h);
      if (!bg.src) return true;
      const pos = bg.position ?? { x: 0.5, y: 0.5 };
      const zoom = bg.zoom ?? 1;
      if (bg.filter && opts.imageFilterCanvas && opts.imageFilterCanvas.width > 0) {
        drawImageFitted(
          ctx,
          opts.imageFilterCanvas,
          opts.imageFilterCanvas.width,
          opts.imageFilterCanvas.height,
          w,
          h,
          bg.fit,
          pos,
          zoom,
        );
        return true;
      }
      const img = getBackgroundImage(bg.src, opts.onImageReady);
      if (img) {
        drawImageFitted(
          ctx,
          img,
          img.naturalWidth,
          img.naturalHeight,
          w,
          h,
          bg.fit,
          pos,
          zoom,
        );
      }
      return true;
    }
    case "shader": {
      if (opts.shaderCanvas && opts.shaderCanvas.width > 0) {
        drawImageFitted(
          ctx, opts.shaderCanvas,
          opts.shaderCanvas.width, opts.shaderCanvas.height,
          w, h, "cover",
        );
      } else {
        // draft/fallback: flat first color
        ctx.fillStyle = bg.colors[0] ?? "#141416";
        ctx.fillRect(0, 0, w, h);
      }
      return true;
    }
  }
}
