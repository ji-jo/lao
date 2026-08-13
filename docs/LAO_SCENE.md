# lao-scene JSON

`lao-scene` is Lao’s canonical animation IR. **It is not a browser document.** Open SVG in a browser. Use React/TSX in a React app. Use JSON to inspect, validate, or regenerate the other two.

All three formats are generated from `buildLaoScene()` (`src/export/code/sceneJson.ts`).

## Fields

| Field | Meaning |
|---|---|
| `format` | Always `"lao-scene"` |
| `version` | `1` |
| `usage` | Human/agent note: JSON is not renderable |
| `width` `height` | Canvas px |
| `viewBox` | `"0 0 {width} {height}"` |
| `fps` | Timeline fps |
| `frameCount` | Timeline length in frames |
| `durationMs` | `frameCount / fps * 1000` |
| `loop` | `"once"` \| `"infinite"` \| `"ping-pong"` |
| `idPrefix` | Prefix on every SVG/React id (safe to mount several animations) |
| `formats` | `{ svg, react, json }` — SVG is standalone SMIL; JSON is not renderable |
| `background` | `null` (transparent) or color/gradient |
| `defs` | Draw-on and eraser masks (unused defs are stripped) |
| `groups` | Draw-order list of path groups (layers / cels) |

## Regenerating other formats

```ts
import { parseLaoScene } from "./sceneJson";
import { renderSceneToSvg } from "./sceneRender";

const scene = parseLaoScene(JSON.parse(jsonText));
const svg = renderSceneToSvg(scene); // same SMIL, ids, loop
```

React/TSX is that SVG converted to JSX (`svgToJsx`) plus a small playback wrapper (`className`, `loop`, `paused`, `playbackRate`). External-SVG mode emits the SVG file beside a thin `<object>` component.

## Loop

- `once` — SMIL `fill="freeze"`, plays through `durationMs`
- `infinite` — `repeatCount="indefinite"`
- `ping-pong` — values reverse after the forward pass, then repeat

Boil (line jitter) always cycles independently (`repeatCount="indefinite"` on `d`).

## Optimization

Unused mask defs are dropped. Comments, SMIL tags, animated `d`, ids, and hidden layers are **not** rewritten. There is no visual-verified / lossy optimizer.

## Do not

- Treat JSON as HTML/SVG
- Fetch JSON from the React component (inline mode has no `src`)
- Rename ids without updating `mask="url(#…)"` references
