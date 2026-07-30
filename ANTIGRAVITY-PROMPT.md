# Antigravity task — ship the LAO waitlist page in Astro

You are building a production port of a finished design. The design already exists and is not up for debate.

## Inputs in this workspace

- `LAO Waitlist.dc.html` — the finished page. **This is the spec.** Read it first, end to end. Every colour, size, offset, easing and string in it is intentional.
- `assets/` — `hero-image.png` (real app screenshot), and Jin's hand-drawn SVGs: `case.svg`, `pen-hand.svg`, `runner.svg`, `numeral-01…04.svg`, `palm.svg`, `wordmark.svg`.
- `fonts/DepartureMono-Regular.woff2` — SIL OFL, self-host it.
- `MIGRATION-PROMPT.md` — long-form section-by-section spec. Read it after the HTML; this file is the plan of work.

Do not redesign, do not add sections, do not "modernize" the layout. Where the HTML and your instincts disagree, the HTML wins. If something genuinely can't be ported, note it in your walkthrough rather than substituting your own solution.

## Stack — locked

pnpm only (no npm/yarn/Bun-as-installer; commit `pnpm-lock.yaml`) · Astro 5, TypeScript strict, static output · React 19 islands (`client:load` above the fold, `client:visible` below) · Tailwind v4 CSS-first `@theme` · shadcn/ui **on Base UI** (only `input`, `textarea`, `button`, `field`) · `@paper-design/shaders-react` for the hero field · CSS scroll-driven animation by default, `motion` only where CSS can't express it, never GSAP · Loops.so behind a Cloudflare Pages Function · deploy Cloudflare Pages, build command `pnpm build`.

Fonts: `@fontsource/redaction-35` (display) + `@fontsource-variable/geist` (body) + the bundled Departure Mono (labels only, 11–13px, uppercase, tracking 0.08em, `font-feature-settings:"locl"`). **The prototype substitutes Instrument Serif for Redaction — replace every `'Instrument Serif'` with Redaction.** No Google Fonts, no font CDN.

Tokens (base colour `#40608E`):

```css
@theme {
  --color-ink-900:#0B0F16; --color-ink-800:#121A26; --color-ink-700:#16202E;
  --color-ink-600:#1D2838; --color-rule:#2A3A56; --color-paper:#F6F4F0;
  --color-text-hi:#E8ECF4; --color-text:#B3BECF; --color-text-mid:#7C8AA3;
  --color-text-low:#4C5A72;               /* reveal start state only, never resting text */
  --color-base:#40608E;                   /* both CTAs, light text on it */
  --color-accent:#7FA6E0;                 /* continuous-line mode, focus rings */
  --color-signal:#E0518E;                 /* stop-motion mode ONLY */
}
```

## Order of work — one commit per step, verify each in the browser before moving on

1. **Scaffold.** `pnpm dlx create-astro@latest`, Tailwind v4, `@theme` tokens in `src/styles/theme.css`, fonts self-hosted in `public/fonts` with `font-display:swap`, `pnpm add -D wrangler`. Prove `pnpm dev` and `pnpm build` both run clean before writing any UI.
2. **Base layout + nav + hero.** Get the hero to finished quality before anything else — if the hero doesn't land, nothing after it matters. Nav is a floating pill (max 1160px, `--color-ink-800` ~78% + backdrop blur, hairline border) that tightens and blurs harder past 80px scroll; `Join Waitlist` is the only solid `--color-base` object above the fold. Hero: Departure Mono eyebrow with a `steps(1)` blinking block caret, centred Redaction headline, then the real app screenshot in a `--color-ink-700` chrome card (12px padding, radius 24, image radius 8), ~0.08× parallax.
3. **Hero shader.** Swap the prototype's hand-written WebGL for `<Dithering>`: `colorBack` `#0B0F16`, a blue `colorFront`, slow speed (~0.15), large scale, `4x4`/blue noise, **max 3 quantization levels**, **cap 24–30fps not 60** (the low framerate reads hand-made and stop-motion — that is the product). Mask it flat to `--color-ink-900` across the top ~180px and bottom ~260px so no Redaction ever sits over live dither.
4. **Static sections** — problem split, cascade diagonal (0 / 143 / 266px offsets), the "Built for local first" held beat, two modes, process staircase (margin-left 0 / 9% / 16% / 26%), who-is-it-for rows, credibility card (inverted to `--color-paper`, radius 59). Textures: ASCII canvas on the process section only (Departure Mono glyphs, 11px cell, ramp `· : - = + * # %`, opacity ~0.12); 2px scanlines at 4% + faint vignette on two-modes only; **everywhere else flat ink** — do not reintroduce dither in the form or footer, that was explicitly cut.
5. **Reveals.** Text starts at `--color-text-low` and brightens to `--color-text-hi` on entry; drawings wipe in left-to-right via `clip-path: inset()` (1200ms, palm 2500ms — brush outlines, so `stroke-dashoffset` does not apply). No fade-and-slide-up. Never more than two things animating in one viewport. Every animation must be something LAO itself could produce — no springs, no 3D transforms.
6. **Form + Pages Function.** `functions/api/waitlist.ts` → Loops.so with `LOOPS_API_KEY` as a Cloudflare secret, server-only. Honeypot field + submission-timing check, no CAPTCHA. **The form must submit and render a result with JS disabled** (native POST); the React island only enhances. Success reveals `You're in — @username is yours.` with a self-drawing check, not a modal. Errors: `Taken. Try another?` / `That email doesn't look right.`
7. **Fixed revealing footer.** `position:fixed; inset:auto 0 0 0; height:100dvh; z-index:0`; all page content in a `z-index:1` wrapper and **every section opaque `--color-ink-900`** or the footer bleeds through; last block `margin-bottom:100dvh`. The oversized Redaction `Lao Anm` is **intentionally cropped** by the bottom edge — keep the crop, it is not a bug.
8. **Ship.** `wrangler.toml`, `.dev.vars.example`, README with pnpm commands only.

## Bugs I already hit — do not rediscover them

- An `animation-timeline: view()` animation whose timeline is **inactive** (page scrolls a non-window container) pins elements to their 0% keyframe with `fill:both`, leaving 40px display type at ~2:1 contrast. Verify the timeline is active, and keep a fallback so text is never stuck at `--color-text-low`.
- Reveal triggers keyed on `IntersectionObserver` alone silently skip anything that flies past above the viewport (fast scroll, anchor jump, restored position). Test with a fling to the bottom, not a slow scroll.
- Canvases/shaders that only paint inside their rAF loop render **blank** on background-tab loads, in static exports and in the OG image. Paint one frame synchronously at mount.
- An inline `transition:transform …` on an element whose wipe comes from a stylesheet `transition:clip-path …` kills the wipe — list both properties.

## Hand-drawn assets — the brand, not decoration

Never replace one with an icon-library glyph (no Lucide/Heroicons/Phosphor anywhere, for anything). Never clean up, smooth or re-path them — the wobble and uneven weight are the signal. They are filled brush outlines using `currentColor`: white on dark via `filter:invert(1)`, ink on the cream card. Still missing and to be left as labelled placeholders: the **continuous-line loop** and **stop-motion loop** videos (when supplied: `autoplay muted loop playsinline preload="metadata"`, WebM + MP4, poster required, `IntersectionObserver`-gated).

## Banned outright

Gradient meshes, glow blobs, aurora backgrounds; glassmorphism beyond the nav pill; icon-library glyphs; stock 3D/isometric art; bento grids; fake "trusted by" rows, invented user counts, countdown timers; pure `#000`; grey-on-grey Tailwind defaults instead of the tokens; uniform `py-24` rhythm; perfectly even alignment — the diagonals must feel hand-placed, keep the 8–24px asymmetries; magenta anywhere except stop-motion mode; bloom on any canvas effect.

Positive test: from a screenshot with no copy, a stranger should be able to tell one person made this by hand.

## Definition of done — verify with the browser, then report

- [ ] Lighthouse ≥95 performance / 100 accessibility desktop; JS < 100kb gzipped excluding the shader; LCP < 2.0s on simulated 4G
- [ ] No CLS from fonts or from any canvas/shader mount
- [ ] Full keyboard traversal, visible focus rings, form usable by screen reader
- [ ] All **resting** text ≥4.5:1 (check `--color-text-mid` and anything still at `--color-text-low`)
- [ ] `prefers-reduced-motion` freezes every canvas/shader (frozen, not slower) and disables parallax and wipes
- [ ] Form submits with JS disabled
- [ ] Correct at 360 / 768 / 1440 / 2560px — every grid stacks below 900px as the prototype does
- [ ] No moiré between Redaction and the shader at 1×, 1.5×, 2× DPR
- [ ] Fixed footer reveals cleanly on iOS Safari (`100dvh`), no rubber-band artifacts, keyboard-reachable
- [ ] Zero icon-library imports in the dependency tree
- [ ] `pnpm-lock.yaml` committed; no `package-lock.json`, no `bun.lockb`, no `npm`/`yarn` in any script or doc

End with a walkthrough listing: every placeholder still awaiting Jin's assets, every checklist item that failed and why, and every deviation from the prototype with a one-line reason. Screenshot the hero, the credibility card and the footer reveal as evidence.
