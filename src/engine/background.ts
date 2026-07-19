import type { Background, Project } from "@/model/types";

/**
 * Background painting for canvas contexts (edit stage, preview composition,
 * export). Shader backgrounds live as DOM layers (see LaoComposition /
 * ShaderSnapshotMount); here they get either a snapshot drawImage (export)
 * or a flat first-color approximation (edit draft).
 */

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
) {
  if (fit === "fill") {
    ctx.drawImage(img, 0, 0, w, h);
    return;
  }
  if (fit === "crop") {
    // natural size, centered, overflow cropped
    ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
    return;
  }
  const scale = fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export interface PaintBackgroundOptions {
  /** live shader canvas to stamp (export path) */
  shaderCanvas?: HTMLCanvasElement | null;
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
      let grad: CanvasGradient;
      if (bg.shape === "radial") {
        grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
      } else {
        const rad = ((bg.angle - 90) * Math.PI) / 180;
        const cx = w / 2, cy = h / 2;
        const len = (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) / 2;
        grad = ctx.createLinearGradient(
          cx - Math.cos(rad) * len, cy - Math.sin(rad) * len,
          cx + Math.cos(rad) * len, cy + Math.sin(rad) * len,
        );
      }
      grad.addColorStop(0, bg.from);
      grad.addColorStop(1, bg.to);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      return true;
    }
    case "image": {
      const img = getBackgroundImage(bg.src, opts.onImageReady);
      ctx.fillStyle = "#141416";
      ctx.fillRect(0, 0, w, h);
      if (img) drawImageFitted(ctx, img, img.naturalWidth, img.naturalHeight, w, h, bg.fit);
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
