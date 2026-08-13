# CLAUDE.md

@AGENTS.md

Also read `docs/ARCHITECTURE.md` before engine/store changes and `docs/ROADMAP.md` for
parked features. Repo is on **X:** (`X:\Line Animations\lao`, NTFS). Installs stay
`npm install` (package-lock.json) — never bun install / never commit a `bun.lock`.
Running & tests: `bun run dev`, `bun test`.

Non-negotiable (full detail in AGENTS.md §"Hard product constraints"):
- Dev server is **http://localhost:5173**.
- UI chrome is specced in **Paper**. Read it via the **Paper MCP** (`get_computed_styles`,
  `get_jsx`) — never by screenshotting `app.paper.design` in a browser (canvas, no DOM →
  wrong values). If `mcp__paper__*` is missing, restart Claude Code with Paper Desktop open.
  See AGENTS.md §"Design source of truth — Paper".
- UI + icons from **exactly four sources**: **fluid functionalism** + **beui** (components),
  **itshover** + **reicon.dev** (`reicon-react`) (icons). Add nothing else — no other
  component library or icon pack. Build by hand if it's not in these four.
