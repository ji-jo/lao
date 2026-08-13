/**
 * Offline: SVG tip sheets → square alpha PNG tips for the stamp engine.
 * Usage: node scripts/extract-brush-tips.mjs
 *
 * Does not import the huge watercolor brushes.svg — uses watercolor 1.svg.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BRUSH_DIR = path.join(ROOT, "src", "assets", "brush");
const OUT_DIR = path.join(BRUSH_DIR, "tips");

/** Max edge when rasterizing the full sheet (before crop). */
const MAX_SHEET = 1024;
/** Output tip edge length. */
const TIP_SIZE = 384;
const WHITE_CUTOFF = 245;
const PAD_FRAC = 0.06;

/**
 * @typedef {{
 *   id: string;
 *   file: string;
 *   cell?: { x: number; y: number; w: number; h: number };
 * }} TipJob
 */

/** @type {TipJob[]} */
const JOBS = [
  { id: "watercolor", file: "watercolor 1.svg" },
  { id: "acrylic", file: "acrylic brushes.svg" },
  { id: "charcoal", file: "charcoal brushes.svg" },
  { id: "pencil", file: "pencil brushes.svg" },
  { id: "brush", file: "brush 1.svg" },
  // airbrush sheet 1200×400 → three cells; center tip
  { id: "airbrush", file: "airbrush.svg", cell: { x: 1 / 3, y: 0, w: 1 / 3, h: 1 } },
  { id: "stipple", file: "stipple brushes.svg" },
];

function isBg(r, g, b, a) {
  if (a < 8) return true;
  // near-white / paper beige
  if (r >= WHITE_CUTOFF && g >= WHITE_CUTOFF && b >= WHITE_CUTOFF) return true;
  if (r >= 220 && g >= 210 && b >= 200 && Math.abs(r - g) < 25 && Math.abs(g - b) < 30) {
    return true;
  }
  return false;
}

/** Ink density 0..1 from RGB (distance from white). */
function inkDensity(r, g, b) {
  const dist = (255 - r + (255 - g) + (255 - b)) / (255 * 3);
  return Math.min(1, Math.max(0, dist * 1.15));
}

/**
 * @param {PNG} src
 * @param {{ x: number; y: number; w: number; h: number } | null} cell
 */
function sheetToAlphaTip(src, cell) {
  const sx0 = cell ? Math.floor(cell.x * src.width) : 0;
  const sy0 = cell ? Math.floor(cell.y * src.height) : 0;
  const sw = cell ? Math.max(1, Math.floor(cell.w * src.width)) : src.width;
  const sh = cell ? Math.max(1, Math.floor(cell.h * src.height)) : src.height;

  let minX = sw;
  let minY = sh;
  let maxX = 0;
  let maxY = 0;
  const dens = new Float32Array(sw * sh);

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = ((sy0 + y) * src.width + (sx0 + x)) << 2;
      const r = src.data[i];
      const g = src.data[i + 1];
      const b = src.data[i + 2];
      const a = src.data[i + 3];
      let d = 0;
      if (!isBg(r, g, b, a)) {
        d = inkDensity(r, g, b) * (a / 255);
        if (d > 0.04) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      dens[y * sw + x] = d;
    }
  }

  if (maxX < minX) {
    // fallback: use full cell
    minX = 0;
    minY = 0;
    maxX = sw - 1;
    maxY = sh - 1;
  }

  const padX = Math.floor((maxX - minX + 1) * PAD_FRAC);
  const padY = Math.floor((maxY - minY + 1) * PAD_FRAC);
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(sw - 1, maxX + padX);
  maxY = Math.min(sh - 1, maxY + padY);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const side = Math.max(cw, ch);
  const out = new PNG({ width: TIP_SIZE, height: TIP_SIZE, colorType: 6 });
  out.data.fill(0);

  const scale = TIP_SIZE / side;
  const ox = Math.floor((side - cw) / 2);
  const oy = Math.floor((side - ch) / 2);

  for (let y = 0; y < TIP_SIZE; y++) {
    for (let x = 0; x < TIP_SIZE; x++) {
      const sx = Math.floor(x / scale) - ox + minX;
      const sy = Math.floor(y / scale) - oy + minY;
      if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
      const d = dens[sy * sw + sx];
      if (d <= 0.01) continue;
      const alpha = Math.min(255, Math.round(d * 255));
      const o = (y * TIP_SIZE + x) << 2;
      out.data[o] = 255;
      out.data[o + 1] = 255;
      out.data[o + 2] = 255;
      out.data[o + 3] = alpha;
    }
  }

  return out;
}

function rasterizeSvg(svgPath) {
  const svg = fs.readFileSync(svgPath);
  // Parse viewBox for aspect
  const text = svg.toString("utf8").slice(0, 2000);
  const m = text.match(/viewBox\s*=\s*"([^"]+)"/i);
  let vw = 1024;
  let vh = 1024;
  if (m) {
    const parts = m[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      vw = parts[2] || vw;
      vh = parts[3] || vh;
    }
  }
  const scale = Math.min(MAX_SHEET / vw, MAX_SHEET / vh);
  const width = Math.max(1, Math.round(vw * scale));
  const height = Math.max(1, Math.round(vh * scale));

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "rgba(255,255,255,0)",
  });
  const rendered = resvg.render();
  const pngData = rendered.asPng();
  const png = PNG.sync.read(pngData);
  // If height drifted, ok — cell fractions use rendered size
  void height;
  return png;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const job of JOBS) {
    const svgPath = path.join(BRUSH_DIR, job.file);
    if (!fs.existsSync(svgPath)) {
      console.error("missing", job.file);
      process.exitCode = 1;
      continue;
    }
    console.log(`→ ${job.id} from ${job.file}…`);
    const t0 = Date.now();
    const sheet = rasterizeSvg(svgPath);
    const tip = sheetToAlphaTip(sheet, job.cell ?? null);
    const outPath = path.join(OUT_DIR, `${job.id}.png`);
    fs.writeFileSync(outPath, PNG.sync.write(tip));
    const kb = Math.round(fs.statSync(outPath).size / 1024);
    console.log(`  wrote ${path.relative(ROOT, outPath)} (${kb} KB, ${Date.now() - t0} ms)`);
  }
  console.log("done");
}

main();
