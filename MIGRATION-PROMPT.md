# LAO waitlist page — migration brief

Port an existing, finished single-page design into the locked production stack. The design already exists as one self-contained HTML page (`LAO Waitlist.dc.html` in the handoff folder) — **treat it as the spec**. Do not redesign it, do not "improve" the layout, do not add sections. Your job is a faithful port plus the server-side pieces the HTML prototype cannot do.

## What LAO is

Line Art Object Animation — a drawing-first animation tool with two modes (continuous line, stop motion). Almost nothing to learn. Built solo, in public, by Jin. First person singular in all copy; never "we".

## Stack — locked, do not substitute

| Layer | Choice |
|---|---|
| Package manager | **pnpm** only (no npm, yarn, or Bun as installer). Commit `pnpm-lock.yaml`. |
| Framework | **Astro 5**, TypeScript strict, static output |
| Interactivity | **React 19 islands** — `client:load` for above-the-fold, `client:visible` below |
| Styles | **Tailwind CSS v4**, CSS-first `@theme` |
| Components | **shadcn/ui on Base UI** (not the Radix variant). Only `input`, `textarea`, `button`, `field`. |
| Shaders | **`@paper-design/shaders-react`** (`<Dithering>`) for the hero field; the prototype hand-writes an equivalent WebGL shader — replace it with the library component and match the look. |
| Motion | CSS scroll-driven animations (`animation-timeline: view()`) by default; **`motion`** (React) only where CSS can't express it. No GSAP. |
| Forms | **Loops.so** through a Cloudflare Pages Function. Never call Loops from the client. |
| Deploy | **Cloudflare Pages**, static + `/functions` |

```bash
pnpm dlx create-astro@latest
pnpm add @paper-design/shaders-react motion
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add input textarea button field
pnpm add -D wrangler
```

## Fonts — self-hosted woff2 in `/public/fonts`, `font-display: swap`

```bash
pnpm add @fontsource/redaction-35        # display
pnpm add @fontsource-variable/geist      # body / UI
```

- **Redaction 35 / Redaction 20** — display and section heads. The prototype substitutes Instrument Serif because the real face wasn't installable there; **swap it for Redaction everywhere** (`font-family:'Instrument Serif'` → Redaction). Hard floor 32px — its halftone erosion reads as a rendering bug below that.
- **Geist** — body, 17px/1.6, measure max 65ch.
- **Departure Mono** — labels only (11–13px, uppercase, tracking 0.08em): eyebrows, field labels, `.lao`, footer meta. The woff2 ships in the handoff at `fonts/DepartureMono-Regular.woff2` (SIL OFL). Never body copy, never a headline.

No Google Fonts, no external font CDN.

## Tokens — base colour is `#40608E`

```css
@theme {
  --color-ink-900: #0B0F16;   /* page */
  --color-ink-800: #121A26;   /* surface */
  --color-ink-700: #16202E;   /* raised, inputs */
  --color-ink-600: #1D2838;   /* hover */
  --color-rule:    #2A3A56;   /* 1px hairlines */

  --color-paper:   #F6F4F0;   /* the canvas — line art lives on paper */

  --color-text-hi:  #E8ECF4;
  --color-text:     #B3BECF;
  --color-text-mid: #7C8AA3;
  --color-text-low: #4C5A72;  /* scroll-reveal start state only, never a resting text colour */

  --color-base:    #40608E;   /* CTAs, solid accent objects — light text on it */
  --color-accent:  #7FA6E0;   /* continuous-line mode, focus rings, line art highlights */
  --color-signal:  #E0518E;   /* stop-motion mode ONLY */
}
```

Accent budget under 5% of any viewport. Magenta has exactly one job: stop-motion mode. Never pure `#000`.

## Hand-drawn assets — the brand

`assets/case.svg`, `pen-hand.svg`, `runner.svg`, `numeral-01…04.svg`, `palm.svg`, `wordmark.svg` — Jin's drawings, exported from Figma stroke by stroke as filled brush outlines using `currentColor`.

1. **Never** replace one with an icon-library glyph. No Lucide, Heroicons, Phosphor — anywhere, for anything.
2. **Never** clean up, smooth, or re-path them. The wobble and uneven weight are the signal.
3. They are brush *outlines*, so `stroke-dashoffset` self-drawing does not apply — they reveal with a left-to-right `clip-path: inset()` wipe (1200ms; the palm 2500ms). Keep that.
4. On dark sections they render white via `filter: invert(1)`; on the cream card they stay ink. If you inline them as React components instead, drive colour with `currentColor` and drop the filter.

Still missing, keep as labelled placeholders and list them in your final report: the **continuous-line loop** and **stop-motion loop** videos in the two-modes section. When supplied: `<video autoplay muted loop playsinline preload="metadata">`, WebM (VP9/AV1) + MP4 fallback, poster required, `IntersectionObserver`-gated.

The hero uses the real app screenshot `assets/hero-image.png` inside a `--color-ink-700` chrome card (12px padding, radius 24, image radius 8). If a screen recording replaces it later, same card, same radii.

## Backgrounds — restrained on purpose

- **Hero only:** the shader field. `<Dithering>` with `colorBack: #0B0F16`, `colorFront: #1A2632`-ish blue, slow speed (~0.15), large scale, `4x4` or blue noise. **Max 3 quantization levels.** Cap the loop at 24–30fps, not 60 — the slightly low framerate reads hand-made and stop-motion, which is the product. Mask it flat to `--color-ink-900` across the top ~180px and the bottom ~260px so type and the nav never sit over live dither (Redaction's halftone + a dot dither = moiré; verify at 1×, 1.5×, 2× DPR).
- **Process section:** ASCII texture — canvas of Departure Mono glyphs on a 11px cell grid, ramp `· : - = + * # %`, opacity ~0.12. Felt, not read.
- **Two-modes section:** arcade — 2px scanlines at 4%, faint vignette. No bloom.
- **Everywhere else:** no texture. Flat ink, hairline rules, air. Do not reintroduce dither in the form or the footer; that was explicitly cut.

For every canvas/shader: freeze to one static frame under `prefers-reduced-motion: reduce` (frozen, not slower); paint one frame synchronously at mount so background-tab loads, static exports and the OG image are never blank; pause via `IntersectionObserver` and `visibilitychange`; render to a downscaled buffer upscaled with `image-rendering: pixelated`; budget ≤4ms/frame — if over, cut resolution, not framerate.

## Motion

Durations 180ms micro / 260ms standard / 420ms entrance. Entrance easing `cubic-bezier(0.22, 1, 0.36, 1)`, state change `cubic-bezier(0.4, 0, 0.2, 1)`.

Scroll reveal: text starts at `--color-text-low` and brightens to `--color-text-hi` on entry; drawings wipe in. No fade-and-slide-up. Never animate more than two things at once in a viewport. Every animation must be something LAO itself could plausibly produce — no springs, no 3D transforms.

**Port note:** the prototype latches reveals in JS (a rect test + a `[data-revealed] { … !important }` rule) because its host scrolls a non-window container. In Astro, prefer real `animation-timeline: view()` scroll-driven animations — but verify the timeline is *active*; an inactive view timeline with `fill: both` pins elements to their 0% keyframe and leaves display type at ~2:1 contrast, which is exactly the bug that rule was working around. Keep a no-JS fallback so text is never stuck at `--color-text-low`.

## Sections, in order

1. **Nav** — floating pill, `--color-ink-800` at ~78% + backdrop blur, hairline border, max 1160px. `Story` left, the LAO wordmark SVG centre, `Join Waitlist` right as the only solid `--color-base` object in the viewport. Pill tightens and blurs harder past 80px scroll. Optional: a ~120px progressive blur band under it (`@skiper-ui/skiper41`) — only if it holds ≤1.5ms/frame during scroll and never overlaps live shader (the hero mask already handles that).
2. **Hero** — mono eyebrow `EARLY ACCESS · BUILDING IN PUBLIC`, centred Redaction headline *"Animate the thing you're trying to explain."*, then the app screenshot card. Slight parallax on the card (~0.08× scroll), subtle enough that a reviewer can't name it.
3. **Problem** — asymmetric 12-col split, no texture: left *"I spent more time learning animation tools than animating."*, right block offset ~96px down *"LAO is the tool I wanted."* + one Geist paragraph.
4. **Cascade** — case / pen-hand / runner stepping down a diagonal (0 / 143 / 266px offsets from the Figma), labels in Redaction below, staggered 120ms wipes. The diagonal is a signature; keep the uneven offsets.
5. **Held beat** — *"Built for local first"*, centred, nothing else.
6. **Two modes** — hairline-split pair. Left continuous line (`--color-accent`), right stop motion (`--color-signal`). Arcade texture. This is where the two mode colours are established, so they appear nowhere earlier.
7. **Process 01–04** — descending staircase (margin-left 0 / 9% / 16% / 26%), hand-drawn numeral, Redaction title, Geist body, hairline between rows, ASCII texture. Copy is final: Work on it / Save it (`.lao` in Departure Mono) / Open it / Share it. Head above: *"It's a file. You keep it."* Closer below: *"Your work outlives the tool. That's the deal."*
8. **Who is it for?** — four hairline rows, Departure Mono row labels, body brightening on reveal: Teachers, Explainers & writers, Designers, Anyone who thinks by drawing.
9. **Credibility card** — inverted to `--color-paper`, radius 59, palm in ink at right wiping in over 2.5s (the longest animation on the page and the only one allowed to take its time). Redaction head *"Designed screen by screen, not prompted."* + the Paper / fluid functionalism / beUI / chanhdai paragraph.
10. **Waitlist** — Redaction head *"Get in early. Take a good username."* Fields on `--color-ink-700`, 1px rule, 4px radius, `--color-accent` focus ring, Departure Mono labels: `USERNAME` (with `lao.so/` prefix rendered inside the field), `EMAIL`, `WHAT WOULD YOU ANIMATE FIRST?` (textarea, optional, placeholder *a diagram I keep redrawing for my students*). Button **Claim my spot** in solid `--color-base`. Under-form: *No spam. One email when it's ready, and the occasional build update you can leave anytime.* Success: `You're in — @username is yours.` revealed with a self-drawing check, not a modal. Errors: username taken → `Taken. Try another?`; bad email → `That email doesn't look right.`
11. **Fixed revealing footer** — `position: fixed; inset: auto 0 0 0; height: 100dvh; z-index: 0`; page content in a `z-index: 1` wrapper with an opaque `--color-ink-900` background (every section opaque, or the footer bleeds through); last block carries `margin-bottom: 100dvh`. Departure Mono `LINE ART OBJECT` … `ANIMATION` spread wide, oversized Redaction **Lao Anm** intentionally cropped by the bottom edge, small meta row `Built in public by Jin · X · Email`. No JS.

## What you must add beyond the prototype

- `functions/api/waitlist.ts` — Cloudflare Pages Function posting to Loops.so with `LOOPS_API_KEY` (Cloudflare secret, server-only). Honeypot field + submission-timing check for spam. No CAPTCHA.
- **Progressive enhancement:** the form must submit and respond with JS disabled (native POST to the function, server-rendered result). The React island only enhances it.
- `wrangler.toml`, `.dev.vars.example`, build command `pnpm build`.

```
src/layouts/Base.astro
src/pages/index.astro
src/components/              # .astro static, .tsx islands
src/components/backgrounds/  # Shader, Ascii, Arcade
src/assets/drawings/         # hand-drawn SVGs — NEVER regenerate
src/styles/theme.css         # @theme tokens
functions/api/waitlist.ts
public/fonts/
```

## Anti-generic contract — banned outright

Gradient meshes, radial glow blobs, aurora backgrounds; glassmorphism beyond the nav pill (+ optional blur band); icon-library glyphs anywhere; stock 3D renders and isometric illustrations; bento grids; fake "trusted by" rows, invented user counts, countdown timers; pure `#000000`; grey-on-grey Tailwind defaults instead of the tokens; uniform `py-24` rhythm; perfectly even alignment (the diagonals must feel hand-placed — keep the 8–24px asymmetries); cyan/magenta as general decoration; bloom on any canvas effect.

Positive test: from a screenshot with no copy, a stranger should be able to tell one person made this by hand. If it could belong to any YC company, start over.

## Acceptance checklist — verify each, report failures

- [ ] Lighthouse ≥95 performance, 100 accessibility on desktop
- [ ] Total JS < 100kb gzipped (shader excluded); LCP < 2.0s on simulated 4G
- [ ] No layout shift from fonts or from any canvas/shader mount
- [ ] Full keyboard traversal, visible focus rings, form usable by screen reader
- [ ] All resting text ≥4.5:1 — check `--color-text-mid` and any element still sitting at `--color-text-low`
- [ ] `prefers-reduced-motion` freezes every canvas/shader and disables parallax and wipes
- [ ] Form submits with JS disabled
- [ ] Renders correctly at 360px, 768px, 1440px, 2560px (the prototype stacks every grid below 900px — keep that)
- [ ] No moiré between Redaction and the shader at 1×, 1.5×, 2× DPR
- [ ] Every video `IntersectionObserver`-gated with a poster
- [ ] Fixed footer reveals cleanly on iOS Safari (`100dvh`), no rubber-band artifacts, reachable by keyboard
- [ ] Zero icon-library imports in the dependency tree
- [ ] `pnpm-lock.yaml` committed; no `package-lock.json`, no `bun.lockb`, no `npm`/`yarn` in any script or doc

Final report: every placeholder still awaiting Jin's assets, every acceptance item that failed and why, and every place you deviated from the prototype with a one-line reason.
