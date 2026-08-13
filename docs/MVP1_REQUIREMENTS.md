# MVP 1 — Implementation requirements (Cursor)

**Source of truth for UI/UX:** Paper design  
`https://app.paper.design/file/01KWXWG7GMJVEGMB4Q9N17YDXT`

**Do not invent chrome that contradicts Paper.** Ignore older “dynamic island is the settings panel” notes in `AGENTS.md` for MVP 1 UI layout — Paper wins. Engine/file/export constraints in `AGENTS.md` still apply unless this doc explicitly exceptions them.

**Agent rule:** Do not delete or rewrite D’s numbered points below. Everything listed as MVP 1 below is **must-have** — ship all of it.

---

## A. Already shipped in codebase (fact check — not a design claim)

Use this so Cursor does not rebuild working core, and does not assume Paper chrome is done.

### Engine / document
- [x] Stop-motion exposure sheet (layers × frames, holds, auto-key)
- [x] Animatron workflow shell (layer-per-path clips, clip timeline drag move/resize, draw-on via point `t`)
- [x] Retained-vector strokes + deterministic boil (`seed`) — preview ≈ export for boil
- [x] Pointer pressure + mouse velocity pressure
- [x] Tools: Select / Ink / Pencil / Marker / Eraser
- [x] Selection: pick, multi (shift), warp handles, **group move**, **rotate/scale** bbox handles
- [x] Copy/paste strokes, undo/redo, delete selection
- [x] Onion skin toggle (default **ON** in `playback.ts`)
- [x] Canvas **pan/zoom** (wheel pan, Ctrl/Cmd+wheel zoom, Space/middle-drag, Ctrl/Cmd+0 reset)
- [x] Paper grain stroke flag (UI location moves to conjoined docks — see §C.7 / §F.4)
- [x] `.lao` save/open + IndexedDB autosave recovery banner
- [x] Export: MP4 / WebM / GIF / APNG; transparent option; frame-driven shader snapshot export
- [x] Keyboard: V/B/P/M/E, A select-all, D deselect, Del, Ctrl+C/V, Ctrl+Z/Shift+Z, Ctrl+S/O, ←/→ or ,/. frames, Enter play
- [x] Floating ToolDock + Timeline (basic); WorkflowBar Stop-motion / Animatron + File overflow
- [x] Preview stage via Remotion Player + reference attach (preview mode only today)
- [x] Stub `AnimationPanel` + DotGridSpotlight easing editor (Animatron draw — **not** Paper-conjoined / not wired to clip data)

### MVP 1 must-ship gaps (all required)

- [ ] Dock hover 18→24px + shortcut letter badges + Paper tooltip pills (`1FB-0`)
- [ ] Conjoined sub-tool flyouts (shapes pack `9IB-0`, etc.)
- [ ] Timeline-attached Animation edit panel (easing trigger on dock — `8KU-0` / `8TY-0`)
- [ ] Easing / fade stored + applied on Animatron clips (preview === export)
- [ ] Animatron Interface per `94K-0` (top tool rail, seconds timeline)
- [ ] Collapsible timeline drag-handle → 56px peek (`9JI-0`)
- [ ] **Remove StatusIsland**; replace with Paper conjoined settings docks (brush size, canvas settings, aspect lock)
- [ ] Fill (bucket `4WR-0`), shapes pack, text tool + text animation, image-on-canvas (`2`), reference box (`1` / `245-0`)
- [ ] Mode-switch save prompt (Animatron ↔ Stop-motion)
- [ ] Esc preview → draw
- [ ] File-bar hover animation (top-left) — §D.28
- [ ] Ctrl+N → new file; Photoshop-style artboard screenshot → **clipboard** (§F)
- [ ] Help / Feedback / Warning modals as designed in Paper
- [ ] neumorphism primary CTAs / mode active buttons; gradient picker only when gradient
- [ ] Fluid slider install: `npx shadcn@latest add https://www.fluidfunctionalism.com/r/slider.json` (Comfortable / elastic usage per §C.3)

---

## B. Build order (do these first, in order)

1. **Dock redesign** — Paper `1FB-0`  
   Hover 18→24px, shortcut labels, tooltips, conjoined sub-tool flyouts.
2. **Timeline conjoined trigger** — Paper `8KU-0`  
   Easing button opens AnimationPanel **attached** to timeline (not floating orphan). Dot grid bezier per `8TY-0`.
3. **Wire easing to data model**  
   Store/apply cubic-bezier + fade in/out on Animatron clip keyframes; preview === export.
4. **Animatron Interface** — Paper `94K-0`  
   Top tool rail + seconds-based clip timeline.

Then implement clarifications + checklist 21–28 + §F approved decisions (can parallelize only when they do not fight the above order). **All items remain must-have for MVP 1.**

---

## C. Clarifications (D — keep verbatim intent)

### 1. Onion skin
- Default **ON**.
- Toggle button behavior.
- When **OFF**, must **not** show the red opacity ghost of the previous frame.

### 2. Timeline collapse handle
- Clicking the handle and dragging collapses the timeline under the screen and shows only **56px** from the top.
- Design: https://app.paper.design/file/01KWXWG7GMJVEGMB4Q9N17YDXT/1-0/9JI-0

### 3. Elastic slider
Install fluid slider:

```bash
npx shadcn@latest add https://www.fluidfunctionalism.com/r/slider.json
```

Usage pattern (Comfortable / elastic roundness control):

```tsx
import { SliderComfortable } from "./components";

const [roundness, setRoundness] = useState(2);
<SliderComfortable
  label="Roundness"
  value={roundness}
  onChange={setRoundness}
  min={0}
  max={4}
/>
```

Wire to the actual export name from the fluid registry after install (do not leave a broken `./components` import). Prefer Comfortable/elastic variant if the package exposes it; otherwise map this API onto the installed fluid slider.

### 4. General shortcuts / capture
- **Ctrl+S** — save `.lao`
- **Ctrl+O** — open `.lao`
- **Ctrl+N** — **new file** (new empty project). No “dirty document” jargon required — just open a new project. If the current session has unsaved work, follow the same save-prompt spirit as mode switch (prompt to save first).
- **Screenshot (Photoshop-style)** — capture the **current artboard/canvas composite** and put a **PNG on the system clipboard** (like Photoshop Copy Merged). This is not “export video” and not a vague OS screenshot of the whole browser chrome.

### 5. Color pickers
- **Single solid color:** `@fluid/color-picker`, matching the solid-color UX pattern used by `react-best-gradient-color-picker` backgrounds.
- **Gradient only:** use `react-best-gradient-color-picker`.
- Do **not** use the gradient library for flat solid fills.

### 6. Neumorphism exception (primary only)
- Exception for **primary** buttons only: use `neumorphism-react` for:
  - modal CTAs
  - email (where that CTA exists)
  - mode active buttons: **Animatron**, **Stop-motion**

### 7. Checklist #14 / settings chrome (no dynamic island)
- There is **no** requirement for dynamic island in MVP 1.
- Intent of #14: **conjoined dock** examples when clicking:
  - brush size
  - canvas settings
  - aspect lock input (Figma-like)
- **Remove StatusIsland** (the current top-center pill settings UI). Settings live only in Paper-style **conjoined docks** attached to the relevant controls. Do not leave two settings surfaces.

### 8. Paper overrides prior agent gap commentary
- Ignore prior “Paper chrome not shipped so ignore Paper” framing for MVP 1 scope.
- **Paper design is source of truth for MVP 1.**

### 9. Paper MCP
- Prompt-only note: Cursor MCP will access Paper later; include Paper URLs in tasks.

### Mode switch (Animatron ↔ Stop-motion)
- When switching modes either direction, **prompt the user to save the session** for MVP 1 — the two modes are fundamentally different.

---

## D. Checklist additions (D) — all must-have

### 21. Text animation
- Add **text animation** (Animatron / timeline-capable). MVP scope approved: text objects participate in Animatron clips (fade / draw-on / timing) — not a full typesetting suite first.

### 22. More shapes — conjoined dock
- Extra shapes accessed by clicking this dock button:  
  https://app.paper.design/file/01KWXWG7GMJVEGMB4Q9N17YDXT/1-0/9IB-0
- On click, **conjoined dock** appears with 5 shapes/lines:
  | Tool | Shortcut |
  |---|---|
  | Rectangle | `r` |
  | Diamond | `Shift+r` |
  | Circle | `o` |
  | Arrow line | `Shift+l` |
  | Line | `l` |
- All of these should animate with **boil lines** or **start→end** (Animatron draw-on), consistent with path animation rules.

### 23. Bucket / fill tool
- Dock ref: https://app.paper.design/file/01KWXWG7GMJVEGMB4Q9N17YDXT/1-0/4WR-0
- Fill **closed shapes with no holes** — works best for **rectangle, circle, diamond** (`r`, `Shift+r`, `o`).
- Bucket hits that **closed-shape target** when the path is a proper closed loop (no holes).
- If the target is **not** a closed loop: bucket fills the **canvas** (project artboard fill for that action).

### 24. Camera / reference (key `1`)
- Camera icon in dock; shortcut **`1`**.
- Opens image in the web and shows the **reference box**:  
  https://app.paper.design/file/01KWXWG7GMJVEGMB4Q9N17YDXT/1-0/245-0

### 25. Add image (key `2`)
- Pressing **`2`** adds an image on the **canvas**.
- Selecting it and pressing **Delete** deletes the image **and** its layer.

### 26. Text tool (key `t`)
- Pressing **`t`** adds text.
- Settings dock design:  
  https://app.paper.design/file/01KWXWG7GMJVEGMB4Q9N17YDXT/1-0/9Z2-0

### 27. Esc in preview
- Pressing **Esc** in preview mode returns to **edit canvas** (draw) mode.

### 28. File / mode bar hover
- Add hover mode to the **top-left file bar** (modes) using proper hover animation from the skills.

---

## E. Hard product constraints (still apply)

From `AGENTS.md` unless this doc exceptions them:

- Installs: `npm install` (repo on **X:**, keep `package-lock.json`). Run: `bun run dev` / `bun test`. Dev URL `http://localhost:5173`.
- UI/icons default sources: fluid + beui + itshover + reicon — **except** D’s explicit MVP 1 exceptions in §C.5–C.6 (`react-best-gradient-color-picker`, `neumorphism-react`) and §C.3 (fluid slider URL above).
- No ffmpeg.wasm; export via mediabunny + gifenc (+ APNG path already present).
- Boil stays deterministic (seeded).
- Keep `npx tsc -b` clean and `bun test` green before claiming done.
- Every panel floats — no docked sidebars (conjoined docks are floating attached chrome, not app sidebars).

---

## F. Approved decisions (was “agent additions” — now must-have)

D approved these as requirements:

1. **Ctrl+N** — opens a **new file** (new empty project). Prompt to save current session first if there is unsaved work (same spirit as mode switch) — not a separate “dirty flag” product concept.
2. **Screenshot** — **clipboard PNG** of the current artboard composite (Photoshop Copy Merged–style). Not “pick clipboard vs file”; file stills/video stay under Export.
3. **Slider** — install via  
   `npx shadcn@latest add https://www.fluidfunctionalism.com/r/slider.json`  
   and use Comfortable/elastic pattern from §C.3.
4. **StatusIsland** — **delete/remove** it after (or as) conjoined brush/canvas/aspect docks ship. Plain English: StatusIsland is today’s top-center settings pill; Paper replaces that with conjoined docks, so the pill goes away.
5. **Bucket** — fill closed no-hole shapes (rect / circle / diamond); otherwise fill canvas (§D.23).
6. **Text animation** — yes, MVP must-have (§D.21).
7. **Forked chat** — implement MVP 1 from this doc in a fresh chat so prior thread history does not confuse the agent.

---

## G. Forked-chat starter prompt (paste as-is)

```text
Implement lao MVP 1 from docs/MVP1_REQUIREMENTS.md. Paper is UI source of truth:
https://app.paper.design/file/01KWXWG7GMJVEGMB4Q9N17YDXT

ALL gaps in section A “MVP 1 must-ship” are required — do not drop any.

Build in order (section B):
1) Dock redesign (1FB-0) — hover 18→24, shortcut labels, tooltips, conjoined sub-tool flyouts
2) Timeline conjoined Animation panel (8KU-0 / 8TY-0) — not floating orphan
3) Wire easing + fade into Animatron clip data model (preview === export)
4) Animatron Interface (94K-0) — top tool rail + seconds timeline

Then clarifications C1–C9, checklist D21–D28, and approved §F. Do not remove any checklist points.
Remove StatusIsland; settings = Paper conjoined docks (brush size, canvas, aspect lock).
Ctrl+N = new file (save prompt if unsaved). Screenshot = artboard PNG to clipboard.
Bucket fills closed no-hole shapes (r / ⇧r / o); else fills canvas.
Text animation is in scope for MVP 1.
Read AGENTS.md + docs/ARCHITECTURE.md; Paper overrides AGENTS UI layout notes (no dynamic island).
Exceptions: neumorphism-react (primary CTAs / mode active), react-best-gradient-color-picker (gradients only),
fluid slider via: npx shadcn@latest add https://www.fluidfunctionalism.com/r/slider.json
Mode switch Animatron ↔ Stop-motion must prompt save for MVP 1.
Verify with npx tsc -b and bun test. Use Paper MCP on each linked node before coding that surface.
```
