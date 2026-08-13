/**
 * Record the gift-box Remotion player UI playing, then also re-encode the
 * canvas-only MP4 via lao's export path. Writes both into ../Demo/.
 *
 * Usage (from lao root):
 *   node scripts/make-giftbox-video.mjs
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
const recordDir = path.join(demoOut, ".record-tmp");

async function main() {
  await fs.mkdir(demoOut, { recursive: true });
  await fs.rm(recordDir, { recursive: true, force: true });
  await fs.mkdir(recordDir, { recursive: true });

  const server = await createServer({
    configFile: path.join(laoRoot, "vite.config.ts"),
    root: laoRoot,
    server: { port: 5196, strictPort: true, host: "127.0.0.1" },
  });
  await server.listen();
  const url = "http://127.0.0.1:5196/demo-giftbox.html";
  console.log("Serving", url);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    recordVideo: {
      dir: recordDir,
      size: { width: 1440, height: 960 },
    },
  });
  const page = await context.newPage();
  page.on("console", (msg) => console.log("[page]", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.error("[pageerror]", err));

  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForFunction(
    () => Boolean(window.__giftBoxDemo?.exportMp4Base64),
    null,
    { timeout: 90_000 },
  );

  // Let the Remotion player loop through ~2 full plays (~10s @ 12fps×60)
  console.log("Recording player UI…");
  await page.waitForTimeout(10_500);

  // Canvas export (deterministic, boil baked)
  console.log("Encoding canvas MP4…");
  const b64 = await page.evaluate(async () =>
    window.__giftBoxDemo.exportMp4Base64(),
  );
  const mp4Buf = Buffer.from(b64, "base64");
  const mp4Path = path.join(demoOut, "giftbox-demo.mp4");
  await fs.writeFile(mp4Path, mp4Buf);
  console.log("Wrote", mp4Path, `(${mp4Buf.length} bytes)`);

  const laoJson = await page.evaluate(() =>
    JSON.stringify(window.__giftBoxDemo.project, null, 2),
  );
  await fs.writeFile(path.join(demoOut, "giftbox-demo.lao"), laoJson, "utf8");

  await context.close();
  await browser.close();
  await server.close();

  // Playwright writes WebM — keep a copy + try ffmpeg → mp4 if available
  const files = await fs.readdir(recordDir);
  const webmName = files.find((f) => f.endsWith(".webm"));
  if (!webmName) {
    throw new Error("No Playwright video recording found");
  }
  const webmSrc = path.join(recordDir, webmName);
  const webmOut = path.join(demoOut, "giftbox-demo-ui.webm");
  await fs.copyFile(webmSrc, webmOut);
  console.log("Wrote", webmOut);

  const uiMp4 = path.join(demoOut, "giftbox-demo-ui.mp4");
  const ff = spawnSync(
    "ffmpeg",
    ["-y", "-i", webmOut, "-c:v", "libx264", "-pix_fmt", "yuv420p", uiMp4],
    { encoding: "utf8" },
  );
  if (ff.status === 0) {
    console.log("Wrote", uiMp4);
  } else {
    console.log(
      "ffmpeg not available — UI recording left as WebM:",
      webmOut,
    );
  }

  await fs.rm(recordDir, { recursive: true, force: true });
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
