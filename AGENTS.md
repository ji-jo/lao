# lao — agent handbook

**lao** is a browser-based hand-drawn animation studio (stop-motion / flipbook style) with a
signature "boil" (line jitter) engine. Owner goes by **D** — keep replies concise and direct,
create actual files, verify before claiming done. Files save as **`.lao`** (versioned JSON).

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before touching the engine or stores.
Read [docs/ROADMAP.md](docs/ROADMAP.md) for parked features (incl. the **Animatron** mode spec).

## Environment — read first, this bites

- **This drive (E:) is exFAT.** `bun install` / `bun add` FAIL here with a lockfile EINVAL.
  **Installs: `npm install`. Running & tests: `bun run dev`, `bun test`.** Never switch the
  installer to bun; never commit a `bun.lock`.
- Git on exFAT: new clones/repos need
  `git config --global --add safe.directory '<path>'`. This repo uses a **repo-local**
  identity (user "D") — don't set a global one.
- Port 5173 is often taken by another of D's servers; `vite.config.ts` honors `$PORT`
  (see `.claude/launch.json` in the parent folder — `autoPort: true`).
- Windows + Git Bash. Line endings: repo-local `core.autocrlf false`; commit with
  `-c core.safecrlf=false` to silence CRLF warnings.

## Commands

```bash
npm install          # deps (exFAT-safe)
bun run dev          # vite dev server
bun test             # unit tests (src/**/*.test.ts, excluded from app tsconfig)
npx tsc -b           # type-check (must stay clean)
bun run build        # tsc -b && vite build
```

## Hard product constraints (D's explicit decisions — do not violate)

1. **UI components ONLY from the fluid functionalism registry:**
   `npx shadcn@latest add https://www.fluidfunctionalism.com/r/<name>.json -y -o`
   (index at `/r/registry.json`; already installed: button, slider, tooltip, dialog, select,
   switch, color-picker, input-group, dropdown, scroll-area).
2. **Icons ONLY from itshover:** `npx shadcn@latest add https://itshover.com/r/<name>-icon.json`.
   264 icons; there is **no eraser/pause/plus/undo icon** — use substitutes (letter-e-icon,
   letter-p-icon, x-icon rotated, arrow-back-up-icon, history-circle-icon, stack-3-icon…).
3. **Every panel floats** — pattern from `@beui/expandable-action-bar`
   (`src/components/motion/expandable-action-bar.tsx`). No docked sidebars.
4. **No 3D** (no .obj, no three.js). **No ffmpeg.wasm** — export is mediabunny (WebCodecs)
   + gifenc. **No fabric/p5/two.js/paper.js as engines** (evaluated & rejected; steal ideas only).
5. Boil/jitter must stay **deterministic** (seeded) so preview === export. Tests enforce it.
6. Keep `npx tsc -b` clean and `bun test` green before every commit.

## Keyboard map (implemented)

V/B/P/M/E tools · A / Ctrl+A select all · D deselect · Del/Backspace delete selection ·
Ctrl+C / Ctrl+V copy/paste strokes across frames (same coordinates) ·
Ctrl+Z / Ctrl+Shift+Z undo/redo · Ctrl+S / Ctrl+O save/open .lao ·
Shift+drag = straight line · ←/→ or , / . step frames · Enter play/pause.

## Verifying changes (no visible browser needed)

- Dev handle `window.__lao` = `{ project, playback, tools, selection }` zustand stores (DEV only).
- Drive drawing by dispatching `PointerEvent`s at a canvas and reading store state / canvas
  pixels (`getImageData`). Synthetic events: `getCoalescedEvents()` returns `[]` and
  `setPointerCapture` throws — both are already handled in `StageCanvas`.
- Headless/hidden tabs never fire rAF — the stage loop falls back to `setTimeout` (33 ms).
  Remotion Player playback won't advance in hidden tabs; verify via `setFrameIndex` + pixels.
- After editing files, **hard-reload the page before trusting a failed browser test** — stale
  HMR modules have produced false negatives here. Dynamic `import()` from the console can
  create a SECOND module instance; always assert against `window.__lao`, not a fresh import.
