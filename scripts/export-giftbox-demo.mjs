/**
 * Encode the gift-box stop-motion demo to MP4 (1282×914) and write ../Demo/.
 *
 * Usage (from lao root):
 *   node scripts/export-giftbox-demo.mjs
 */
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const laoRoot = path.resolve(__dirname, "..");
const demoOut = path.resolve(laoRoot, "../Demo");

async function ensureDemoCopies() {
  await fs.mkdir(path.join(demoOut, "src"), { recursive: true });

  const demoTsx = await fs.readFile(
    path.join(laoRoot, "src/demo/GiftBoxDemo.tsx"),
    "utf8",
  );
  await fs.writeFile(
    path.join(demoOut, "src/GiftBoxDemo.tsx"),
    demoTsx.replaceAll("@/demo/giftBoxProject", "./giftBoxProject"),
    "utf8",
  );

  await fs.copyFile(
    path.join(laoRoot, "src/demo/giftBoxProject.ts"),
    path.join(demoOut, "src/giftBoxProject.ts"),
  );

  const main = await fs.readFile(
    path.join(laoRoot, "src/demo/giftBoxMain.tsx"),
    "utf8",
  );
  await fs.writeFile(
    path.join(demoOut, "src/giftBoxMain.tsx"),
    main
      .replaceAll("@/demo/GiftBoxDemo", "./GiftBoxDemo")
      .replaceAll("@/demo/giftBoxProject", "./giftBoxProject"),
    "utf8",
  );

  // Keep triangle files; add giftbox entry alongside.
  const html = await fs.readFile(
    path.join(laoRoot, "demo-giftbox.html"),
    "utf8",
  );
  await fs.writeFile(
    path.join(demoOut, "giftbox.html"),
    html.replace('src="/src/demo/giftBoxMain.tsx"', 'src="/src/giftBoxMain.tsx"'),
    "utf8",
  );
}

async function main() {
  await ensureDemoCopies();

  const server = await createServer({
    configFile: path.join(laoRoot, "vite.config.ts"),
    root: laoRoot,
    server: { port: 5198, strictPort: true, host: "127.0.0.1" },
  });
  await server.listen();
  const addr = server.resolvedUrls?.local?.[0] ?? "http://127.0.0.1:5198/";
  const url = new URL("demo-giftbox.html", addr).href;
  console.log("Serving", url);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("console", (msg) => console.log("[page]", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.error("[pageerror]", err));

  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForFunction(
    () => Boolean(window.__giftBoxDemo?.exportMp4Base64),
    null,
    { timeout: 90_000 },
  );

  console.log("Encoding MP4…");
  const b64 = await page.evaluate(async () => {
    return window.__giftBoxDemo.exportMp4Base64();
  });
  const buf = Buffer.from(b64, "base64");
  const mp4Path = path.join(demoOut, "giftbox-demo.mp4");
  await fs.writeFile(mp4Path, buf);
  console.log("Wrote", mp4Path, `(${buf.length} bytes)`);

  const laoJson = await page.evaluate(() =>
    JSON.stringify(window.__giftBoxDemo.project, null, 2),
  );
  await fs.writeFile(path.join(demoOut, "giftbox-demo.lao"), laoJson, "utf8");
  console.log("Wrote", path.join(demoOut, "giftbox-demo.lao"));

  await fs.writeFile(
    path.join(demoOut, "GIFTBOX_README.md"),
    `# lao gift-box demo

Stop-motion gift box opening + confetti — **1282 × 914** @ 12fps.

Tagline: **anybody can animate :)**

## Files

| File | What |
| --- | --- |
| \`giftbox-demo.mp4\` | Encoded stop-motion scene |
| \`giftbox-demo.lao\` | Same project (open in lao) |
| \`src/GiftBoxDemo.tsx\` | Interactive Remotion Player surface |
| \`giftbox.html\` | Standalone entry |

## Interactive preview

From the **lao** repo:

\`\`\`bash
bun run dev
# open http://localhost:5173/demo-giftbox.html
\`\`\`

## Re-export MP4

\`\`\`bash
# from lao root
node scripts/export-giftbox-demo.mjs
\`\`\`
`,
    "utf8",
  );

  await browser.close();
  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
