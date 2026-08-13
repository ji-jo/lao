# lao design tokens

Source of truth for the studio chrome. Prefer `PAPER` in `src/components/chrome/paper-tokens.ts` over guessing hex. Fluid/beui shadcn CSS vars live in `src/index.css` (`.dark` is what the app uses).

---

## Fonts

| Role | Token / stack |
|------|----------------|
| UI sans | `PAPER.fontSans` → `'Geist', 'Inter Variable', system-ui, sans-serif` |
| Mono (FPS, frame counts) | `PAPER.fontMono` → `'Geist Mono', ui-monospace, monospace` |
| Display / modal titles | `PAPER.fontSerif` → `'Redaction 35', serif` |
| CSS | `--font-sans`, `--font-mono`, `--font-redaction` |

---

## Core surfaces (Paper chrome)

| Role | Hex | Token |
|------|-----|--------|
| App / stage background | `#000000` | `PAPER.bg` |
| Dock / panel shell | `#131212` | `PAPER.surface` |
| Alt shell (zoom/feedback chips) | `#131313` | `PAPER.surfaceAlt` |
| Deep / segment idle | `#121212` | `PAPER.surfaceDeep` |
| Nested scrubber / pill hover nest | `#252525` | `PAPER.pillHover` (also `.dark --surface-3`) |
| Square / chip hover, segment active | `#313131` | `PAPER.squareHover` / `segmentActive` |
| Timeline layer track behind rows | `#0D0D0D` | `PAPER.trackBg` |
| Frame cell idle | `#121213` | `PAPER.cellBg` |
| Square btn idle | `#161717` | `PAPER.squareBg` |

---

## Borders / separators

| Role | Hex | Token |
|------|-----|--------|
| Strong outline (workflow bar) | `#363636` | `PAPER.outline` |
| Subtle panel outline | `#2D2E2E` | `PAPER.outlineSubtle` |
| Hairline (zoom dock) | `#292A2A` | `PAPER.borderHairline` |
| Dock separator stroke | `#838383` | `PAPER.sep` |
| Mode active outline | `#C9C9C980` | `PAPER.modeActiveOutline` |
| Close chip rim | `#C9C9C933` | `PAPER.closeChipBorder` |

---

## Text / icons

| Role | Value | Token |
|------|-------|--------|
| Primary text | `#DEDEDE` | `PAPER.text` |
| Muted / secondary text | `#DADADA` | `PAPER.textMuted` |
| Icons | `#DADADAE6` | `PAPER.icon` |
| Ellipsis glyph | `#D9D9D9` | `PAPER.ellipsisIcon` |
| Collapse handle | `#797979` | `PAPER.handle` |
| Dim label pattern | `text-white opacity-50` / `text-white/60` | utility |
| Disabled / quiet | `text-white/50`, `opacity-60` on idle grips | utility |

---

## Accent / active / highlight

| Role | Hex | Notes |
|------|-----|--------|
| Navy accent (frames, fill preview, dock preview) | `#40608E` | `PAPER.frameActive` |
| Navy border | `#304263` | `PAPER.frameActiveBorder` |
| Layer row selected wash | `#3563B84D` | `PAPER.rowActiveBg` (30% alpha) |
| Pill active fill | `#364F8C` | `PAPER.pillActiveBg` |
| Pill active border | `#4562A999` | `PAPER.pillActiveBorder` |
| Brushes chip ring (open) | `#6B97FF` @ 60% | `ring-1 ring-[#6B97FF]/60` |
| Fill / side-dock ghost preview | `#40608E` @ **20%** opacity | ToolDock edge preview |
| Bucket hover fill preview | `#40608E` @ **15%** | path `fillOpacity` |

---

## Destructive

| Role | Hex | Token |
|------|-----|--------|
| Delete flyout bg | `#160E0C` | `PAPER.deleteBg` |
| Delete border | `#22110F` | `PAPER.deleteBorder` |
| Delete icon | `#F96D57` | `PAPER.deleteIcon` |
| Delete text | `#CB4639` | `PAPER.deleteText` |

---

## Playhead / Animatron

| Role | Hex | Token |
|------|-----|--------|
| Clip time badge | `#6E231B` | `PAPER.clipPlayheadBadge` |
| Clip playhead line | `#66261D` | `PAPER.clipPlayheadLine` |
| Stop-motion playhead | red stamp + line | TimelinePlayheadStamp (UI red) |

---

## Buttons

### Mode / workflow active pill
```
background: PAPER.modeActiveGradient
  linear-gradient(in oklab 180deg, oklab(66.8% 0 0) 0%, oklab(19% 0 0) 100%)
outline: PAPER.modeActiveOutline (#C9C9C980)
```
Inactive hover: `PAPER.pillHover` (`#252525`) — **not** applied on the active gradient pill.

### Modal primary (`GradientHoverButton`)
| State | Value |
|-------|--------|
| Idle | `PAPER.primaryBtnGradient` — black → deep navy-ish oklab |
| Hover | `PAPER.primaryBtnHoverGradient` — brighter vertical gradient |
| Pulse | CSS `gradient-hover-pulse` pans `background-position-y` **only while hovered** |

```css
@keyframes gradient-hover-pulse {
  0%, 100% { background-position-y: 0%; }
  50% { background-position-y: 100%; }
}
/* typical: background-size taller than box; ~2s cycle; pointer-hover only — never focus/autoFocus */
```

### Modal secondary
| State | Value |
|-------|--------|
| Idle | flat dark / surface |
| Hover | `PAPER.secondaryBtnHoverGradient` — `linear-gradient(180deg, #313131 0%, #262626 100%)` |

### Close chip
| State | Value |
|-------|--------|
| Border | `PAPER.closeChipBorder` |
| Hover wash | `PAPER.closeChipHoverWash` — white alpha gradient (same pulse pan) |

### Dock / timeline chips
| State | Fill |
|-------|------|
| Idle square | `#161717` |
| Hover / open / active segment | `#313131` |
| Nested control nest | `#252525` |
| Transport dim | `opacity-50`–`60`; hover → full + `#313131` |

**Rule:** hover treatments change **bg/border only** — no scale, no shadow, no layout shift (`GradientHoverButton`).

---

## Inputs / steppers / tabs

| Control | Idle | Active / focus |
|---------|------|----------------|
| Nested input / scrubber track | `#252525`, borderless, `rounded-lg` | mono value text |
| Segmented tabs (Ink/Pen/Marker, etc.) | nest `#252525` | selected `#313131` or indicator `#252525` |
| Fluid Tabs indicator override | — | `!bg-[#252525]` or `!bg-[#313131]` |
| Stepper (− value +) | square/chip `#161717` | hover `#313131` |
| shadcn `--input` (dark) | `oklch(1 0 0 / 15%)` | `--ring: oklch(0.556 0 0)` |

---

## Layout insets (Paper)

| Token | px |
|-------|-----|
| `insetX` | 62 |
| `insetTop` | 24 |
| `insetBottom` | 48 |
| `settingGap` | 12 |
| `barHeight` (tool / workflow) | 36 (`h-9`) |
| `timelineWidth` | 845 |

---

## Dark shadcn / fluid surfaces (`.dark`)

| CSS var | Approx |
|---------|--------|
| `--background` | near black oklch |
| `--foreground` | near white |
| `--card` / `--popover` | ~`#1a1a1a` oklch |
| `--primary` | light gray (inverted for dark UI) |
| `--secondary` / `--muted` / `--accent` | ~`#2a2a2a` |
| `--surface-1`…`8` | `#171717` → `#484848` |
| `--destructive` | warm red oklch |

App chrome should still prefer **`PAPER.*`** for docks/timeline/modals so it matches Paper, not generic shadcn gray.

---

## Custom motion snippets to port

1. **Gradient hover pulse** — `index.css` `@keyframes gradient-hover-pulse` + `GradientHoverButton` (`pulsate`, `pulsateSeconds`).
2. **Bucket fill** — `#40608E` @ 15% preview; `lao-bucket-fill` clip-path rise.
3. **Side-dock preview** — `#40608E` @ 20% rounded pill ghost.
4. **Gooey morph** — surface `#131212`; blob-only SVG goo filter while morphing (never filter idle chrome).

---

## Quick copy map (website)

```
bg:           #000000
dock:         #131212
nest:         #252525
hover/active: #313131
text:         #DEDEDE
muted:        #DADADA
accent:       #40608E
outline:      #363636
hairline:     #292A2A
danger:       #F96D57 / #CB4639
font-ui:      Geist / Inter Variable
font-mono:    Geist Mono
font-display: Redaction 35
```

Canonical code: `src/components/chrome/paper-tokens.ts`  
Hover primitive: `src/components/ui/gradient-hover-button.tsx`  
Pulse CSS: `src/index.css` (`gradient-hover-pulse`)
