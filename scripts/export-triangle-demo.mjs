/**
 * Encode the triangle Animatron demo to MP4 (1282×914) and write ../Demo/.
 *
 * Usage (from lao root):
 *   node scripts/export-triangle-demo.mjs
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
    path.join(laoRoot, "src/demo/TriangleDemo.tsx"),
    "utf8",
  );
  await fs.writeFile(
    path.join(demoOut, "src/TriangleDemo.tsx"),
    demoTsx.replaceAll("@/demo/triangleProject", "./triangleProject"),
    "utf8",
  );

  await fs.copyFile(
    path.join(laoRoot, "src/demo/triangleProject.ts"),
    path.join(demoOut, "src/triangleProject.ts"),
  );

  const main = await fs.readFile(
    path.join(laoRoot, "src/demo/triangleMain.tsx"),
    "utf8",
  );
  await fs.writeFile(
    path.join(demoOut, "src/main.tsx"),
    main
      .replaceAll("@/demo/TriangleDemo", "./TriangleDemo")
      .replaceAll("@/demo/triangleProject", "./triangleProject"),
    "utf8",
  );

  const html = await fs.readFile(
    path.join(laoRoot, "demo-triangle.html"),
    "utf8",
  );
  await fs.writeFile(
    path.join(demoOut, "index.html"),
    html.replace('src="/src/demo/triangleMain.tsx"', 'src="/src/main.tsx"'),
    "utf8",
  );
}

async function main() {
  await ensureDemoCopies();

  const server = await createServer({
    configFile: path.join(laoRoot, "vite.config.ts"),
    root: laoRoot,
    server: { port: 5199, strictPort: true, host: "127.0.0.1" },
  });
  await server.listen();
  const addr = server.resolvedUrls?.local?.[0] ?? "http://127.0.0.1:5199/";
  const url = new URL("demo-triangle.html", addr).href;
  console.log("Serving", url, server.resolvedUrls);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("console", (msg) => console.log("[page]", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.error("[pageerror]", err));

  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForFunction(
    () => Boolean(window.__triangleDemo?.exportMp4Base64),
    null,
    { timeout: 90_000 },
  );

  console.log("Encoding MP4…");
  const b64 = await page.evaluate(async () => {
    return window.__triangleDemo.exportMp4Base64();
  });
  const buf = Buffer.from(b64, "base64");
  const mp4Path = path.join(demoOut, "triangle-demo.mp4");
  await fs.writeFile(mp4Path, buf);
  console.log("Wrote", mp4Path, `(${buf.length} bytes)`);

  const laoJson = await page.evaluate(() =>
    JSON.stringify(window.__triangleDemo.project, null, 2),
  );
  await fs.writeFile(path.join(demoOut, "triangle-demo.lao"), laoJson, "utf8");
  console.log("Wrote", path.join(demoOut, "triangle-demo.lao"));

  await fs.writeFile(
    path.join(demoOut, "README.md"),
    `# lao triangle Animatron demo

Preview-style (debug / Remotion Player) demo — **1282 × 914**.

## Files

| File | What |
| --- | --- |
| \`triangle-demo.mp4\` | Encoded Animatron draw-on of a triangle |
| \`triangle-demo.lao\` | Same project (open in lao) |
| \`src/TriangleDemo.tsx\` | Interactive Remotion Player surface |
| \`index.html\` | Standalone entry |

## Interactive preview

From the **lao** repo:

\`\`\`bash
bun run dev
# open http://localhost:5173/demo-triangle.html
\`\`\`

## Re-export MP4

\`\`\`bash
# from lao root
node scripts/export-triangle-demo.mjs
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
