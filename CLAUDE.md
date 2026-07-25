# CLAUDE.md

@AGENTS.md

Also read `docs/ARCHITECTURE.md` before engine/store changes and `docs/ROADMAP.md` for
parked features. Never use bun for installs on this drive (exFAT) — npm installs, bun runs.

Non-negotiable (full detail in AGENTS.md §"Hard product constraints"):
- Dev server is **http://localhost:5173**.
- UI chrome is specced in **Paper**. Read it via the **Paper MCP** (`get_computed_styles`,
  `get_jsx`) — never by screenshotting `app.paper.design` in a browser (canvas, no DOM →
  wrong values). If `mcp__paper__*` is missing, restart Claude Code with Paper Desktop open.
  See AGENTS.md §"Design source of truth — Paper".
- UI + icons from **exactly four sources**: **fluid functionalism** + **beui** (components),
  **itshover** + **reicon.dev** (`reicon-react`) (icons). Add nothing else — no other
  component library or icon pack. Build by hand if it's not in these four.
