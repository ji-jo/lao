# lao — agent handbook

**lao** is a browser-based hand-drawn animation studio (stop-motion / flipbook style) with a
signature "boil" (line jitter) engine. Owner goes by **D** — keep replies concise and direct,
create actual files, verify before claiming done. Files save as **`.lao`** (versioned JSON).

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before touching the engine or stores.
Read [docs/ROADMAP.md](docs/ROADMAP.md) for parked features (incl. the **Animatron** mode spec).
Read [docs/MVP1_REQUIREMENTS.md](docs/MVP1_REQUIREMENTS.md) before touching **any UI layout** —
it is authoritative for MVP 1 chrome and **overrides the UI notes in this file** where they
disagree (Paper wins). Check it before "restoring" a surface that was deliberately removed.
[docs/SESSION_HANDOFF.md](docs/SESSION_HANDOFF.md) is the rolling delta for the current work.

## Environment — read first, this bites

- **Repo lives on X:** (`X:\Line Animations\lao`). The volume is **NTFS** (not the old
  E: exFAT drive). `bun install` is no longer blocked by lockfile EINVAL.
  **Still use `npm install` / `npm add`** — the lockfile is `package-lock.json`. Running
  & tests: `bun run dev`, `bun test`. Never switch the installer to bun; never commit a
  `bun.lock`.
- Git: this clone needs
  `git config --global --add safe.directory 'X:/Line Animations/lao'` if Git marks it
  dubious. This repo uses a **repo-local** identity (user "D") — don't set a global one.
- Port 5173 is often taken by another of D's servers; `vite.config.ts` honors `$PORT`
  (see `.claude/launch.json` — `autoPort: true`).
- Windows + Git Bash. Line endings: repo-local `core.autocrlf false`; commit with
  `-c core.safecrlf=false` to silence CRLF warnings.

## Cursor Cloud

Cloud Agents run on **Ubuntu**, not this Windows `X:` clone. Ignore the drive / Git
safe.directory notes above. Config is [`.cursor/environment.json`](.cursor/environment.json).

- Installs: `npm install` (keep `package-lock.json`). Install bun if missing (`npm i -g bun`).
  Never `bun install` / never commit a `bun.lock`.
- Run: `bun run dev` → **http://localhost:5173**. Tests: `bun test`. Types: `npx tsc -b`.
- Paper MCP is on D's desktop only — skip pixel-perfect chrome unless it is available.
- Git identity is already on the repo; do not set a global one.

## Commands

```bash
npm install          # deps (keep package-lock.json; do not bun install)
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
   **Exception — Leafer UI (`leafer-ui` + `@leafer-in/editor` / `text-editor`):** allowed **only as a
   browser edit overlay** for text/shape interaction. Never replace `paintProjectFrame` / boil /
   export with Leafer; never use `@leafer-ui/node` in the client. Chrome stays fluid/beui.
7. Boil/jitter must stay **deterministic** (seeded) so preview === export. Tests enforce it.
8. Keep `npx tsc -b` clean and `bun test` green before every commit.

## Design source of truth — Paper (read this before touching any chrome)

All UI chrome is specced pixel-perfect in D's Paper file:
`https://app.paper.design/file/01KWXWG7GMJVEGMB4Q9N17YDXT` (nodes referenced as `5S8-0`,
`A08-0`, `A0H-0`, `2W5-0`, …). Match it exactly — padding, gaps, hovers, radii, colors.

**Use the Paper MCP. Do NOT read the design through a browser.**
Paper Desktop runs a local MCP server (`http://127.0.0.1:29979/mcp`, plugin
`paper-desktop@paper`) exposing `get_selection`, `get_node_info`, `find_nodes`,
`get_jsx`, `get_computed_styles`, `get_tokens`, `get_tree_summary`, `get_screenshot`.

Paper's own server instructions: *"use `get_jsx`, `get_computed_styles`, … for exact
values — do not read sizes or colors from screenshots alone."*

- `get_computed_styles` on one node returns real px/hex. `get_jsx` returns real markup
  (incl. exact SVG paths). One call beats twenty screenshots.
- `app.paper.design` in a browser renders to **canvas** — there is no DOM to inspect, so
  browser automation degrades to eyeballing JPEGs and blind-clicking the wrong nodes.
  This has produced wrong values repeatedly. Don't do it.
- If the MCP tools are missing (`mcp__paper__*` absent), the plugin was likely installed
  mid-session — **MCP servers only connect at startup, so restart Claude Code** (keep Paper
  Desktop open with the file loaded). Verify the server independently with:
  `curl -sX POST http://127.0.0.1:29979/mcp -H 'Content-Type: application/json'
  -H 'Accept: application/json, text/event-stream'
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`
- Only fall back to a pasted node export (D right-clicks → Copy as… → SVG / React CSS /
  Tailwind) when the MCP is genuinely unavailable. Screenshots are a last resort for
  *review*, never for deriving values.

`src/components/chrome/paper-tokens.ts` is a hand-maintained mirror and **drifts** — its
`timelineWidth` sat at 686 while Paper said 704, silently squeezing the whole timeline dock.
Re-verify a token against Paper before trusting it; prefer `get_tokens` where it applies.

## Current UI layout (as of the latest commit)

- **Top-left** — `@beui/overflow-actions`: Stop-motion / Animatron toggle + File overflow
  (Save / Open / Export). Ellipsis / close toggle uses D's SVGs (`ellipsis-icon`,
  `ellipsis-close-icon`).
- **Bottom (Draw stage) — settings** — the Paper **conjoined settings docks**
  (`src/components/chrome/SettingsDocks.tsx`): a dock bar whose chips open supporting panels
  that melt into it via the gooey neck (`motion/gooey-conjoined.tsx`). Brush (color / size /
  Boil On-Off + Amplitude…Variety scrubbers), Canvas Background, aspect. Panels **anchor to
  the chip that opened them**. This IS the settings surface.
  - There is **no status island / dynamic island.** `StatusIsland.tsx` was deleted per
    `docs/MVP1_REQUIREMENTS.md` ("Do not leave two settings surfaces"). The beui
    `motion/dynamic-island.tsx` component is still installed but has **no consumer** —
    don't wire a second settings surface back up.
- **Bottom (Draw stage)** — `@beui/dock` tool rail stacked above the timeline: Select/Ink/
  Pencil/Marker/Eraser + duplicate-frame / empty-cel / onion + undo/redo. Ink uses reicon
  `PenNib`.
- **Bottom** — the floating `Timeline`; frame rows share ONE horizontal scrollbar
  (`src/components/ui/horizontal-scroll.tsx` — react-custom-scroll is vertical-only, so this
  is a hand-rolled X scroller); layer labels are a pinned left column. Animatron swaps the
  frame grid for `ClipTimeline`.
- **Export** — fluid `Dialog` (`panels/ExportDialog.tsx`).

## Keyboard map (implemented)

V/B/P/M/E tools · A / Ctrl+A select all on canvas · Ctrl+Shift+A select all timeline
layers · Ctrl+Shift+A then V or A selects every layer’s art for move / path edit ·
D deselect · Del/Backspace delete selection (layers first when timeline layers are
selected, then nodes, then strokes) ·
Ctrl+C / Ctrl+X / Ctrl+V copy / cut / paste art across frames (same coordinates); Ctrl+V with system text creates a text object ·
Ctrl+Z / Ctrl+Shift+Z undo/redo · Ctrl+S / Ctrl+O save/open .lao ·
Shift+drag = straight line · ←/→ or , step frames (arrows nudge 1px / Shift+10px when V or A has a canvas selection; arrows stay in the caret while editing text) · [ / ] send art backward / forward (Ctrl+Alt+[ / ] to back / front); without a V/A selection they reorder timeline layers · Enter play/pause.

## Verifying changes (no visible browser needed)

- Dev handle `window.__lao` = `{ project, playback, tools, selection, viewport }` zustand stores (DEV only).
- Drive drawing by dispatching `PointerEvent`s at a canvas and reading store state / canvas
  pixels (`getImageData`). Synthetic events: `getCoalescedEvents()` returns `[]` and
  `setPointerCapture` throws — both are already handled in `StageCanvas`.
- Headless/hidden tabs never fire rAF — the stage loop falls back to `setTimeout` (33 ms).
  Remotion Player playback won't advance in hidden tabs; verify via `setFrameIndex` + pixels.
- After editing files, **hard-reload the page before trusting a failed browser test** — stale
  HMR modules have produced false negatives here. Dynamic `import()` from the console can
  create a SECOND module instance; always assert against `window.__lao`, not a fresh import.
