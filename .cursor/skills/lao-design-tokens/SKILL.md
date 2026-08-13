---
name: lao-design-tokens
description: >-
  Apply lao Paper chrome colors, fonts, button hover/pulse, docks, inputs, and
  tabs. Use when building or restyling UI to match lao, porting tokens to another
  site, or choosing hex values for background/dock/active/disabled/primary.
---

# lao design tokens

When styling chrome or porting lao’s look elsewhere, **read and follow** [docs/DESIGN_TOKENS.md](../../../docs/DESIGN_TOKENS.md) (repo: `docs/DESIGN_TOKENS.md`).

## Rules

1. Prefer `PAPER` from `src/components/chrome/paper-tokens.ts` over inventing hex.
2. Dock shells = `#131212`; nested controls = `#252525`; hover/active chips = `#313131`.
3. Accent navy = `#40608E` (frames, fill preview, edge ghosts).
4. Button hover: bg/border only via `GradientHoverButton` — pulse only on pointer hover, never focus.
5. Fonts: Geist (UI), Geist Mono (tabular), Redaction 35 (modal titles).
6. Do not add a new component library or icon pack; see AGENTS.md four-source rule.

## Quick palette

| Role | Hex |
|------|-----|
| Background | `#000000` |
| Dock / panel | `#131212` |
| Nest / pill hover | `#252525` |
| Active / chip hover | `#313131` |
| Text | `#DEDEDE` |
| Accent | `#40608E` |
| Outline | `#363636` |

Full tables, gradients, pulse CSS, inputs/tabs: **docs/DESIGN_TOKENS.md**.
