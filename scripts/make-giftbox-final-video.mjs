/**
 * Final gift-box demo: lid opens to the back + lao studio UI in the video.
 *
 * Captures real UI screenshots while scrubbing frames, then encodes MP4.
 *
 * Usage (from lao root):
 *   node scripts/make-giftbox-final-video.mjs
 */
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const laoRoot = path.resolve(__dirname, "..");
const demoOut = path.resolve(laoRoot, "../Demo");
const framesDir = path.join(demoOut, ".ui-frames");

async function main() {
  await fs.mkdir(demoOut, { recursive: true });
  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true });

  const server = await createServer({
    configFile: path.join(laoRoot, "vite.config.ts"),
    root: laoRoot,
    server: { port: 5195, strictPort: true, host: "127.0.0.1" },
  });
  await server.listen();
  console.log("Serving http://127.0.0.1:5195/");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (err) => console.error("[pageerror]", err));

  await page.goto("http://127.0.0.1:5195/", {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  await page.waitForFunction(() => Boolean(window.__lao?.project), null, {
    timeout: 90_000,
  });

  // Discard autosave recovery if present
  try {
    const discard = page.getByRole("button", { name: /^Discard$/i });
    if (await discard.isVisible({ timeout: 1500 })) await discard.click();
  } catch {
    /* none */
  }

  console.log("Loading gift-box project…");
  const frameCount = await page.evaluate(async () => {
    const mod = await import("/src/demo/giftBoxProject.ts");
    const project = mod.createGiftBoxDemoProject();
    window.__lao.project.getState().loadProject(project);
    window.__lao.project.getState().setFrameIndex(0);
    window.__lao.playback.getState().setStage("draw");
    window.__lao.playback.getState().setPlaying(false);
    window.__lao.viewport.getState().resetView();
    return project.frameCount;
  });

  // Wait until stage canvas has painted art (center sample not empty/clear)
  await page.waitForFunction(
    () => {
      const canvases = [...document.querySelectorAll("canvas")];
      for (const c of canvases) {
        if (c.width < 200 || c.height < 200) continue;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) continue;
        const { data } = ctx.getImageData(
          (c.width / 2) | 0,
          (c.height / 2) | 0,
          1,
          1,
        );
        // Gift ribbon/box colors or dark artboard — anything opaque
        if (data[3] > 200 && (data[0] + data[1] + data[2] > 30)) return true;
      }
      return false;
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(500);

  console.log(`Capturing ${frameCount} UI frames…`);
  for (let f = 0; f < frameCount; f++) {
    await page.evaluate((frame) => {
      window.__lao.project.getState().setFrameIndex(frame);
    }, f);
    // allow paint
    await page.waitForTimeout(f === 0 ? 200 : 40);
    const file = path.join(framesDir, `f-${String(f).padStart(3, "0")}.png`);
    await page.screenshot({ path: file, type: "png" });
    if (f % 10 === 0) console.log("  frame", f);
  }

  // Also export canvas-only mp4 + .lao
  console.log("Encoding canvas MP4…");
  const b64 = await page.evaluate(async () => {
    const project = window.__lao.project.getState().project;
    const { exportProject } = await import("/src/export/exportProject.ts");
    const blob = await exportProject(project, "mp4");
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  });
  await fs.writeFile(
    path.join(demoOut, "giftbox-demo-canvas.mp4"),
    Buffer.from(b64, "base64"),
  );
  const laoJson = await page.evaluate(() =>
    JSON.stringify(window.__lao.project.getState().project),
  );
  await fs.writeFile(path.join(demoOut, "giftbox-demo.lao"), laoJson, "utf8");

  await browser.close();
  await server.close();

  const finalMp4 = path.join(demoOut, "giftbox-demo.mp4");
  console.log("Encoding final UI MP4…");
  const fps = 12;
  const ff = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      String(fps),
      "-i",
      path.join(framesDir, "f-%03d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      finalMp4,
    ],
    { encoding: "utf8" },
  );
  if (ff.status !== 0) {
    console.error(ff.stderr);
    throw new Error("ffmpeg failed");
  }

  // Keep a couple QA frames, delete the rest
  await fs.copyFile(
    path.join(framesDir, "f-000.png"),
    path.join(demoOut, "giftbox-ui-frame-0.png"),
  );
  await fs.copyFile(
    path.join(framesDir, "f-028.png"),
    path.join(demoOut, "giftbox-ui-frame-28.png"),
  );
  await fs.rm(framesDir, { recursive: true, force: true });

  await fs.writeFile(
    path.join(demoOut, "GIFTBOX_README.md"),
    `# lao gift-box demo (final)

Lid opens **to the back**, confetti bursts, tagline — recorded **inside the lao studio UI**.

## Final video

| File | What |
| --- | --- |
| \`giftbox-demo.mp4\` | **Final** — lao interface + animation |
| \`giftbox-demo-canvas.mp4\` | Canvas-only export |
| \`giftbox-demo.lao\` | Open in lao |

## Re-make

\`\`\`bash
node scripts/make-giftbox-final-video.mjs
\`\`\`
`,
    "utf8",
  );

  const st = await fs.stat(finalMp4);
  console.log("Wrote", finalMp4, `(${st.size} bytes)`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
