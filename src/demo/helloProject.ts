/**
 * Animatron demo: typewriter "Hello".
 * Used by scripts/make-web-demos.mjs to load into the full lao UI.
 */
import type { Project, TextElement } from "@/model/types";
import {
  canvasSizeForAspect,
  type DemoAspect,
} from "@/demo/stickWalkProject";
import { typewriterDurationMs } from "@/engine/strokeProgress";

export const HELLO_FPS = 24;
export const HELLO_TEXT = "Hello";

export function createHelloProject(aspect: DemoAspect = "4x3"): Project {
  const { width, height } = canvasSizeForAspect(aspect);
  const cps = 6;
  const typeMs = typewriterDurationMs(HELLO_TEXT, cps);
  const holdMs = 1800;
  const startMs = 200;
  const durationMs = typeMs + holdMs;
  const frameCount = Math.ceil(((startMs + durationMs + 400) / 1000) * HELLO_FPS);

  const fontSize = Math.round(Math.min(width, height) * 0.16);
  const text: TextElement = {
    id: "hello-text",
    text: HELLO_TEXT,
    x: Math.round(width * 0.05),
    y: Math.round(height / 2 - fontSize * 0.5),
    boxWidth: Math.round(width * 0.9),
    fontFamily: "Geist",
    size: fontSize,
    color: "#f4f4f5",
    bold: true,
    align: "center",
    letterSpacing: 2,
    typewriterSpeed: cps,
    clip: {
      startMs,
      durationMs,
      easing: {
        bezier: [0.44, 0, 0.56, 1],
        fadeInFrames: 0,
        fadeOutFrames: 0,
        presetId: "smooth",
        _userSet: true,
      },
    },
  };

  return {
    version: 1,
    name: `Hello Animatron (${aspect})`,
    width,
    height,
    fps: HELLO_FPS,
    frameCount,
    workflow: "animatron",
    background: { kind: "color", color: "#141416" },
    boil: {
      amplitude: 1,
      jitter: 0.45,
      intensity: 0.5,
      speed: 1,
      variety: 3,
    },
    layers: [
      {
        id: "layer-hello",
        name: "Hello",
        visible: true,
        isStatic: false,
        frames: [
          {
            id: "cel-0",
            strokes: [],
            texts: [text],
            images: [],
          },
        ],
      },
    ],
  };
}
