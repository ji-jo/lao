# lao session handoff — stop-motion settings + timeline

**Date:** 2026-07-26  
**Commit:** `f7d7477` — `timeline and setting dock fix in stop motion`  
**Branch:** `master`  
**Dev:** `bun run dev` → http://localhost:5173 (Vite may pick another port if busy; `$PORT` honored). Installs: `npm install` only (exFAT — never `bun install`).

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md` first. This file is the **delta** since that commit so Claude/Cursor can continue without re-deriving context.

---

## Product surface touched

Stop-motion **settings dock** (bottom Paper setting bar) + **timeline chrome**, plus canvas **background** / **brush boil** behavior.

UI sources stay the four allowed ones only (fluid / beui / itshover / reicon). All panels float.

---

## What landed (by area)

### 1. Canvas Background panel (`BackgroundExpandedPanel`)

**File:** `src/components/chrome/SettingsDocks.tsx`

- Panel width restored to **`BG_PICKER_WIDTH + 32` (316px)** — not 400.
- **None / Color / Shader:** no outer `ScrollArea` (size to content).
- **Image tab:** filter chips → preview → Type / Zoom / Position. No nested Properties dropdown in the main column.
- **Default image fit:** **`cover`** (`makeEmptyImageBackground` in `src/lib/image-filters.ts`).
- Type chips + Zoom share **`IMAGE_CONTROL_TRACK`** (`-ml-9 w-[calc(100%+36px)]`) so they align end-to-end without overflowing the panel the way earlier `+48px` nudges did.
- Image **position** pad: `DotGridSpotlight` + `background.position` / `zoom`; live updates via `setBackgroundLive` (commit on pointer-up for position).
- Drawing: `drawImageFitted` in `src/engine/background.ts`.

### 2. Filter Properties = side gooey panel (not inline)

- Picking a filter (Paper / Fluted Glass / Water / Image Dithering) opens a **separate** supporting panel to the **right**, **top-aligned**, melted into the main panel via the same goo filter as the dock.
- **No** “Properties · …” toggle button inside the Image column — side panel follows filter selection; **None** / leaving Image clears it.
- Wired through **`GooeyConjoined`** extras:
  - `sideOpen` / `sidePanel` / `sidePanelKey` / `sideGap`
  - Horizontal neck between main + side blobs (same SVG goo as dock↔panel).
- Implementation: `src/components/motion/gooey-conjoined.tsx`, `gooey-filter.tsx` (wide filter region for side panel).
- Side UI: `ImageFilterPropertiesSidePanel` in `SettingsDocks.tsx`.

### 3. Panel anchoring to dock chips

- Supporting panels **center above the chip that opened them** (neck under that control), not always dock-center.
- `anchorRef` + `openFrom(kind, anchor)` in `SettingsDocks`.
- Re-clicking the **same** chip+kind toggles closed; switching chip while same kind **re-anchors** (e.g. color → brush size).

### 4. Boil Lines properties (brush panel)

**Model:** `BoilSettings` on `Project` (`src/model/types.ts`) — `amplitude`, `jitter`, `intensity`, `speed`, `variety` + `DEFAULT_BOIL`.

**Engine:** `src/engine/boil.ts` — `resolveBoil`, settings-aware amplitude / wavelength / hold / variety; `paintFrame` passes `project.boil`. Defaults preserve classic look (tests updated in `boil.test.ts`).

**UI:** When Boil Lines is **On**, Zoom-style scrubbers under the On/Off row in `BrushExpandedPanel`. Live scrub via `setBoilLive` (no undo spam) in `src/state/project.ts`.

**Crash fix:** Brush panel always latches as default `panelKey`; missing `boil` / `onBoil` black-screened the app — wired in `SettingsDocks`.

### 5. Timeline / chrome (also in the same commit)

Large timeline + scroll + dock polish landed in the same commit (timing bar, scrollbars, tokens, etc.). Prefer `git show f7d7477 --stat` for the full file list. Settings-dock / background / boil work above is the densest unfinished-adjacent area for follow-ups.

---

## Key files

| Area | Path |
|------|------|
| Settings + Image/Brush UI | `src/components/chrome/SettingsDocks.tsx` |
| Gooey dock + side panel | `src/components/motion/gooey-conjoined.tsx` |
| Gooey SVG filter | `src/components/motion/gooey-filter.tsx` |
| Image filter helpers | `src/lib/image-filters.ts` |
| Shader presets | `src/lib/shader-presets.ts` |
| Background draw | `src/engine/background.ts` |
| Boil engine | `src/engine/boil.ts` |
| Project / live setters | `src/state/project.ts` |
| Types (`BoilSettings`, image `position`/`zoom`) | `src/model/types.ts` |
| Motion tooltip (replaced fluid tooltip) | `src/components/motion/tooltip.tsx` |

---

## Intentionally not committed

Still untracked after `f7d7477` (do **not** commit casually):

- `.tmp-*`, `tsc-out.txt` — scratch
- `src/components/motion/gooey-side-conjoined.tsx` — abandoned; side support lives **inside** `gooey-conjoined.tsx`
- `.env.example`, `.claude/` — local/tooling

---

## How to continue (Claude Code / Cursor)

1. `git log -1 --oneline` → confirm `f7d7477` (or newer).
2. `npm install` if deps missing; `bun run dev`.
3. Hard-reload after HMR weirdness (known false negatives in this repo).
4. Verify: `npx tsc -b`, `bun test` (especially `src/engine/boil.test.ts`).
5. Paper MCP for chrome pixels if touching dock layout again (`get_computed_styles` / `get_jsx` — not browser screenshots of Paper).

### Sensible next tasks

- [ ] Delete or ignore unused `gooey-side-conjoined.tsx`.
- [ ] Commit boil scrubbers with undo-on-pointer-up if undo spam becomes an issue (today: `setBoilLive` only).
- [ ] Status island still has an older Boil toggle — decide whether to mirror Amplitude…Variety there or keep brush panel only.
- [ ] Re-verify Image Type/Zoom against Paper if D wants exact px again (track nudge is intentional: `IMAGE_CONTROL_TRACK`).
- [ ] Animatron path: same settings dock patterns may need parity checks.

---

## Quick mental model

```
[ Filter Properties side ] ← gooey neck → [ Canvas Background ]
                                              ↕ gooey neck
                                         [ setting dock bar ]
                                              ↑
                         panels also re-anchor to color / brush / aspect / background chips
```

Brush panel: color + size + Boil On/Off + (if on) Amplitude / Jitter / Intensity / Speed / Variety → `project.boil` → `boilDisplacement(..., project.boil)`.
