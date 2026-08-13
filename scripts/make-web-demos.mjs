/**
 * Record full lao app UI demos via screenshot frames → ffmpeg MP4.
 * (Playwright recordVideo was blank white on this host; screenshots work.)
 *
 * Usage (from lao root):
 *   node scripts/make-web-demos.mjs
 */
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const laoRoot = path.resolve(__dirname, "..");
const demoOut = path.resolve(laoRoot, "../demo - web");
const recordRoot = path.join(demoOut, ".record-tmp");

const FFMPEG =
  process.env.FFMPEG ||
  "C:\\Users\\Ji-jo\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe";

const VIEWPORTS = {
  "1x1": { width: 1200, height: 1200 },
  "4x3": { width: 1440, height: 1080 },
};

const DEMOS = [
  { kind: "stopmotion", aspect: "1x1", out: "stopmotion-stick-walk-1x1.mp4", seconds: 6 },
  { kind: "stopmotion", aspect: "4x3", out: "stopmotion-stick-walk-4x3.mp4", seconds: 6 },
  { kind: "animatron", aspect: "1x1", out: "animatron-hello-1x1.mp4", seconds: 7 },
  { kind: "animatron", aspect: "4x3", out: "animatron-hello-4x3.mp4", seconds: 7 },
];

const CAPTURE_FPS = 12;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rmRetry(target, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return;
    } catch (err) {
      if (i === tries - 1) {
        console.warn("cleanup failed:", target, err.message);
        return;
      }
      await sleep(400 * (i + 1));
    }
  }
}

function framesToMp4(framesDir, mp4Path, fps) {
  const pattern = path.join(framesDir, "frame-%04d.png");
  const ff = spawnSync(
    FFMPEG,
    [
      "-y",
      "-framerate",
      String(fps),
      "-i",
      pattern,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4Path,
    ],
    { encoding: "utf8" },
  );
  if (ff.status !== 0) {
    throw new Error(`ffmpeg failed for ${mp4Path}:\n${ff.stderr || ff.stdout}`);
  }
}

async function recordOne(serverUrl, demo, page) {
  const viewport = VIEWPORTS[demo.aspect];
  await page.setViewportSize(viewport);

  const framesDir = path.join(recordRoot, `${demo.kind}-${demo.aspect}`);
  await rmRetry(framesDir);
  await fs.mkdir(framesDir, { recursive: true });

  console.log(`\n=== ${demo.kind} ${demo.aspect} @ ${viewport.width}x${viewport.height} ===`);

  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      indexedDB.deleteDatabase("lao");
    } catch {
      /* ignore */
    }
  });
  await page.goto(serverUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  // Dismiss autosave recovery banner if it still appears
  await page.evaluate(async () => {
    try {
      indexedDB.deleteDatabase("lao");
    } catch {
      /* ignore */
    }
    const btns = Array.from(document.querySelectorAll("button"));
    const discard = btns.find((b) => /discard/i.test(b.textContent || ""));
    discard?.click();
  });
  await page.waitForFunction(() => Boolean(window.__lao?.project), null, {
    timeout: 90_000,
  });

  const loadInfo = await page.evaluate(async ({ kind, aspect }) => {
    const stick = await import("/src/demo/stickWalkProject.ts");
    const hello = await import("/src/demo/helloProject.ts");
    const project =
      kind === "stopmotion"
        ? stick.createStickWalkProject(aspect)
        : hello.createHelloProject(aspect);

    window.__lao.project.getState().loadProject(project);
    window.__lao.playback.getState().setStage("draw");
    window.__lao.playback.getState().setWorkflow(project.workflow ?? "animatron");
    window.__lao.project.getState().setFrameIndex(0);
    window.__lao.viewport.getState().resetView();
    window.__lao.playback.getState().setPlaying(true);

    const p = window.__lao.project.getState().project;
    return {
      name: p.name,
      workflow: p.workflow,
      frames: p.frameCount,
      w: p.width,
      h: p.height,
      strokes: p.layers[0]?.frames?.[0]?.strokes?.length ?? 0,
      texts: p.layers[0]?.frames?.[0]?.texts?.length ?? 0,
      playing: window.__lao.playback.getState().playing,
    };
  }, { kind: demo.kind, aspect: demo.aspect });

  console.log("loaded", loadInfo);
  await sleep(600);

  const totalFrames = Math.max(1, Math.round(demo.seconds * CAPTURE_FPS));
  const interval = 1000 / CAPTURE_FPS;
  console.log(`Capturing ${totalFrames} frames @ ${CAPTURE_FPS}fps…`);

  for (let i = 0; i < totalFrames; i++) {
    const file = path.join(framesDir, `frame-${String(i + 1).padStart(4, "0")}.png`);
    await page.screenshot({ path: file, type: "png" });
    if (i + 1 < totalFrames) await sleep(interval);
  }

  // Sanity: first frame must not be tiny/blank-ish
  const first = await fs.stat(path.join(framesDir, "frame-0001.png"));
  if (first.size < 20_000) {
    throw new Error(`first frame too small (${first.size}) — UI likely blank`);
  }

  const mp4Path = path.join(demoOut, demo.out);
  framesToMp4(framesDir, mp4Path, CAPTURE_FPS);
  const st = await fs.stat(mp4Path);
  console.log(`Wrote ${mp4Path} (${st.size} bytes)`);
  await rmRetry(framesDir);
}

async function main() {
  await fs.mkdir(demoOut, { recursive: true });
  await rmRetry(recordRoot);
  await fs.mkdir(recordRoot, { recursive: true });

  const server = await createServer({
    configFile: path.join(laoRoot, "vite.config.ts"),
    root: laoRoot,
    server: { port: 5197, strictPort: true, host: "127.0.0.1" },
  });
  await server.listen();
  const url = "http://127.0.0.1:5197/";
  console.log("Serving", url);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  console.log("Warming Vite…");
  await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.__lao?.project), null, {
    timeout: 90_000,
  });
  console.log("Warm complete.");

  try {
    for (const demo of DEMOS) {
      await recordOne(url, demo, page);
    }
  } finally {
    await browser.close();
    await server.close();
    await rmRetry(recordRoot);
  }
  console.log("\nDone. Outputs in", demoOut);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});