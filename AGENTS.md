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
bun run dev          # vite dev server → http://localhost:5173
bun test             # unit tests (src/**/*.test.ts, excluded from app tsconfig)
npx tsc -b           # type-check (must stay clean)
bun run build        # tsc -b && vite build
```

**Dev server URL is `http://localhost:5173`.** `vite.config.ts` honours `$PORT` and falls
back to 5173; if 5173 is busy it will pick another port — free 5173 or read the port Vite
prints, but 5173 is the canonical local port for this app.

## Hard product constraints (D's explicit decisions — DO NOT VIOLATE)

There are exactly **four** allowed sources for UI + icons. Never add any other component
library, icon pack, or design system. If something you need isn't in one of these, build it
by hand with Tailwind + the existing tokens — do not reach for a new dependency.

1. **UI components — fluid functionalism** (`@fluid`, wired in `components.json`):
   `npx shadcn@latest add -y -o @fluid/<name>`
   (or the URL form `https://www.fluidfunctionalism.com/r/<name>.json`; index at `/r/registry.json`).
   Installed: button, slider, tooltip, dialog, select, switch, color-picker, input-group,
   dropdown, scroll-area, tabs, custom-scroll.
2. **UI components — beui** (`@beui`, wired in `components.json`):
   `npx shadcn@latest add -y -o @beui/<name>` (index at `https://beui.dev/r/registry.json`, 71 items).
   Installed: expandable-action-bar, overflow-actions, popover, range-slider, dock, dynamic-island.
   The beui MCP (`claude mcp add --transport http beui https://mcp.beui.dev/mcp`) is docs/search
   only — NOT required to install components.
3. **Icons — itshover** (animated SVG icons):
   `npx shadcn@latest add -y -o https://itshover.com/r/<name>-icon.json`.
   264 icons; there is **no eraser/pause/plus/undo icon** — use substitutes (letter-e-icon,
   letter-p-icon, x-icon, arrow-back-up-icon, history-circle-icon, stack-3-icon…).
4. **Icons — reicon.dev** (`reicon-react`, 2674+ icons, tree-shakeable):
   `import { PenNib } from "reicon-react"; <PenNib size={24} />`. Already used for the pen icon.
   Prefer reicon when itshover lacks a good match; both are allowed.
   - D-supplied one-off SVGs live in `src/assets/icons/` and are hand-wrapped as
     `currentColor` components (see `ellipsis-icon.tsx`, `ellipsis-close-icon.tsx`) — that's fine
     for bespoke marks, but for general icons use itshover or reicon.

5. **Every panel floats** — no docked sidebars. Patterns: `@beui/dock` (bottom tool rail),
   `@beui/dynamic-island` (top ink/canvas status + settings), `@beui/overflow-actions`
   (top-left Stop-motion/Animatron + File), `@beui/expandable-action-bar`.
6. **No 3D** (no .obj, no three.js). **No ffmpeg.wasm** — export is mediabunny (WebCodecs)
   + gifenc. **No fabric/p5/two.js/paper.js as engines** (evaluated & rejected; steal ideas only).
7. Boil/jitter must stay **deterministic** (seeded) so preview === export. Tests enforce it.
8. Keep `npx tsc -b` clean and `bun test` green before every commit.

## Current UI layout (as of the latest commit)

- **Top-left** — `@beui/overflow-actions`: Stop-motion / Animatron toggle + File overflow
  (Save / Open / Export). Ellipsis / close toggle uses D's SVGs (`ellipsis-icon`,
  `ellipsis-close-icon`).
- **Top-center (Draw stage)** — `@beui/dynamic-island` "status island": compact pill shows
  `tool · frame/total · fps`; tap expands into Brush (color/size/boil/auto-key) and Canvas
  (background + size) settings. This IS the settings panel — there is no separate InspectPanel.
- **Bottom (Draw stage)** — `@beui/dock` tool rail stacked above the timeline: Select/Ink/
  Pencil/Marker/Eraser + duplicate-frame / empty-cel / onion + undo/redo. Ink uses reicon
  `PenNib`.
- **Bottom** — the floating `Timeline`; frame rows share ONE horizontal scrollbar
  (`src/components/ui/horizontal-scroll.tsx` — react-custom-scroll is vertical-only, so this
  is a hand-rolled X scroller); layer labels are a pinned left column. Animatron swaps the
  frame grid for `ClipTimeline`.
- **Export** — fluid `Dialog` (`panels/ExportDialog.tsx`).

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
