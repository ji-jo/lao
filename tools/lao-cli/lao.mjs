#!/usr/bin/env node
/**
 * lao CLI — export .lao projects to animated SVG or React TSX.
 *
 * Usage:
 *   lao export drawing.lao --format svg|tsx --out out.svg --transparent --frame 0
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);

function usage() {
  console.error(
    "Usage: lao export <file.lao> [--format svg|tsx] [--out path] [--transparent] [--frame N] [--animated] [--base-url url]",
  );
  process.exit(1);
}

function parseArgs() {
  if (args[0] !== "export" || !args[1]) usage();
  const file = resolve(args[1]);
  let format: "svg" | "tsx" = "svg";
  let out: string | undefined;
  let transparent = false;
  let frame: number | undefined;
  let animated = false;
  let baseUrl = "http://127.0.0.1:5173";

  for (let i = 2; i < args.length; i++) {
    const a = args[i];
    if (a === "--format") {
      const v = args[++i];
      if (v !== "svg" && v !== "tsx") usage();
      format = v;
    } else if (a === "--out") {
      out = resolve(args[++i]!);
    } else if (a === "--transparent") {
      transparent = true;
    } else if (a === "--frame") {
      frame = Number(args[++i]);
    } else if (a === "--animated") {
      animated = true;
    } else if (a === "--base-url") {
      baseUrl = args[++i]!;
    } else {
      usage();
    }
  }

  if (!out) {
    const base = file.replace(/\.lao$/i, "");
    out = `${base}.${format === "tsx" ? "tsx" : "svg"}`;
  }

  return { file, format, out, transparent, frame, animated, baseUrl };
}

async function main() {
  const opts = parseArgs();
  const raw = readFileSync(opts.file, "utf8");
  const project = JSON.parse(raw);

  const headlessPath = resolve(
    import.meta.dirname,
    "../../src/export/code/headless.ts",
  );
  const { exportProjectCode } = await import(pathToFileURL(headlessPath).href);

  const code = await exportProjectCode(project, {
    format: opts.format,
    transparent: opts.transparent,
    frame: opts.frame,
    animated: opts.animated || opts.frame === undefined,
    baseUrl: opts.baseUrl,
  });

  writeFileSync(opts.out, code, "utf8");
  console.log(`Wrote ${opts.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
