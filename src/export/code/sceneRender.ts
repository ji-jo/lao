import { tag, wrapSvg } from "@/export/code/svgDoc";
import type { LaoScene, SceneBackground, SceneGroup, SceneMaskDef, ScenePath } from "@/export/code/sceneJson";
import { smilRepeatAttrs, type SceneLoop } from "@/export/code/exportMeta";
import {
  dotsPatternOrigin,
  dotsStampPoints,
  dotsTileSize,
  type ResolvedDots,
} from "@/lib/dots-background";

function cubicBezierKeySplines(bezier: [number, number, number, number]): string {
  const [x1, y1, x2, y2] = bezier;
  return `${x1} ${y1} ${x2} ${y2}`;
}

function renderDotsBackground(
  bg: Extract<SceneBackground, { kind: "dots" }>,
  width: number,
  height: number,
  idPrefix: string,
): { defs: string; body: string } {
  const d = bg as ResolvedDots;
  const tile = dotsTileSize(d);
  const origin = dotsPatternOrigin(d, width, height);
  const r = Math.max(0.25, d.size / 2);
  const patId = `${idPrefix}-dots`;
  const marks = dotsStampPoints(d)
    .map((p) => {
      const fill = d.dotColor;
      const opacity = d.opacity;
      if (d.shape === "square") {
        return tag("rect", {
          x: p.x - r,
          y: p.y - r,
          width: r * 2,
          height: r * 2,
          fill,
          opacity,
        });
      }
      if (d.shape === "diamond") {
        return tag("polygon", {
          points: `${p.x},${p.y - r} ${p.x + r},${p.y} ${p.x},${p.y + r} ${p.x - r},${p.y}`,
          fill,
          opacity,
        });
      }
      return tag("circle", {
        cx: p.x,
        cy: p.y,
        r,
        fill,
        opacity,
      });
    })
    .join("");
  const filterId = d.softness > 0.02 ? `${idPrefix}-dots-blur` : undefined;
  const filter = filterId
    ? tag("filter", { id: filterId }, tag("feGaussianBlur", { stdDeviation: d.softness * r }))
    : "";
  const inner = filterId ? tag("g", { filter: `url(#${filterId})` }, marks) : marks;
  const pattern = tag(
    "pattern",
    {
      id: patId,
      x: origin.x,
      y: origin.y,
      width: tile.w,
      height: tile.h,
      patternUnits: "userSpaceOnUse",
      ...(Math.abs(d.rotation) > 0.01
        ? { patternTransform: `rotate(${d.rotation} ${width / 2} ${height / 2})` }
        : {}),
    },
    inner,
  );
  return {
    defs: filter + pattern,
    body:
      tag("rect", { width, height, fill: d.color }) +
      tag("rect", { width, height, fill: `url(#${patId})` }),
  };
}

function renderBackground(
  bg: SceneBackground | null,
  width: number,
  height: number,
  idPrefix: string,
): { defs: string; body: string } {
  if (!bg) return { defs: "", body: "" };
  if (bg.kind === "color") {
    return { defs: "", body: tag("rect", { width, height, fill: bg.color }) };
  }
  if (bg.kind === "dots") {
    return renderDotsBackground(bg, width, height, idPrefix);
  }
  const gradId = `${idPrefix}-bg`;
  const stopTags = bg.stops
    .map((s) => tag("stop", { offset: `${Math.round(s.at * 100)}%`, "stop-color": s.color }))
    .join("");
  const grad =
    bg.shape === "radial"
      ? tag("radialGradient", { id: gradId, cx: "50%", cy: "50%", r: "70%" }, stopTags)
      : tag(
          "linearGradient",
          { id: gradId, x1: "0%", y1: "0%", x2: "100%", y2: "100%" },
          stopTags,
        );
  return {
    defs: grad,
    body: tag("rect", { width, height, fill: `url(#${gradId})` }),
  };
}

function renderMaskDef(def: SceneMaskDef, loop: SceneLoop): string {
  if (def.kind === "eraser") {
    const cuts = (def.cuts ?? []).map((d) => tag("path", { d, fill: "black" })).join("");
    return tag(
      "mask",
      { id: def.id },
      tag("rect", { width: "100%", height: "100%", fill: "white" }) + cuts,
    );
  }
  const easing = def.easing ?? [0, 0, 1, 1];
  const durSec = def.durSec ?? 0;
  const looped = smilRepeatAttrs(loop, "100;0", durSec);
  const maskPath = tag(
    "path",
    {
      d: def.centerline,
      fill: "none",
      stroke: "white",
      "stroke-width": def.strokeWidth ?? 8,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      pathLength: "100",
      "stroke-dasharray": "100",
      "stroke-dashoffset": "0",
    },
    tag("animate", {
      attributeName: "stroke-dashoffset",
      values: looped.values,
      begin: `${def.beginSec ?? 0}s`,
      dur: looped.dur,
      fill: looped.fill,
      repeatCount: looped.repeatCount,
      calcMode: "spline",
      keySplines: cubicBezierKeySplines(easing),
      keyTimes: loop === "ping-pong" ? "0;0.5;1" : "0;1",
    }),
  );
  return tag(
    "mask",
    { id: def.id },
    tag("rect", { width: "100%", height: "100%", fill: "black" }) + maskPath,
  );
}

function renderPath(path: ScenePath, loop: SceneLoop): string {
  let inner = "";
  if (path.fillD && path.fillColor) {
    inner += tag("path", { d: path.fillD, fill: path.fillColor });
  }
  const boil = path.boil
    ? tag("animate", {
        attributeName: "d",
        calcMode: "discrete",
        values: path.boil.values.join(";"),
        dur: `${path.boil.durSec}s`,
        repeatCount: "indefinite",
      })
    : "";
  const attrs: Record<string, string | number | undefined> = {
    id: path.id,
    d: path.d,
    fill: path.fill,
  };
  if (path.maskId) attrs.mask = `url(#${path.maskId})`;
  inner += tag("path", attrs, boil || undefined);
  if (path.fade) {
    const looped = smilRepeatAttrs(loop, path.fade.values, path.fade.durSec);
    inner = tag(
      "g",
      {},
      inner +
        tag("animate", {
          attributeName: "opacity",
          keyTimes: loop === "ping-pong" ? undefined : path.fade.keyTimes,
          values: looped.values,
          dur: looped.dur,
          fill: looped.fill,
          repeatCount: looped.repeatCount,
        }),
    );
  } else if (path.opacity !== undefined) {
    inner = tag("g", { opacity: path.opacity }, inner);
  }
  return inner;
}

function exposureSets(
  from: number,
  to: number,
  fps: number,
  durationSec: number,
  loop: SceneLoop,
): string {
  const t0 = from / fps;
  const t1 = to / fps;
  const T = Math.max(durationSec, 0.001);
  const k0 = Math.min(1, Math.max(0, t0 / T));
  const k1 = Math.min(1, Math.max(0, t1 / T));
  let values = "none;inline;none";
  let keyTimes = `0;${k0};${k1}`;
  if (k0 <= 0) {
    values = "inline;none";
    keyTimes = `0;${k1}`;
  }
  if (k1 >= 1 && k0 <= 0) {
    values = "inline";
    keyTimes = "0";
  }
  const looped = smilRepeatAttrs(loop, values, T);
  return tag("animate", {
    attributeName: "display",
    values: looped.values,
    keyTimes: loop === "ping-pong" ? undefined : keyTimes,
    dur: looped.dur,
    calcMode: "discrete",
    fill: looped.fill,
    repeatCount: looped.repeatCount,
  });
}

function renderGroup(group: SceneGroup, scene: LaoScene): string {
  const durationSec = scene.durationMs / 1000;
  let inner = group.paths.map((p) => renderPath(p, scene.loop)).join("") + group.texts.join("");
  if (group.exposure) {
    inner += exposureSets(
      group.exposure.from,
      group.exposure.to,
      scene.fps,
      durationSec,
      scene.loop,
    );
  }
  const attrs: Record<string, string | number | undefined> = {
    id: group.id,
  };
  if (group.layerId) attrs["data-layer"] = group.layerId;
  if (group.celIndex !== undefined) attrs["data-cel"] = group.celIndex;
  if (group.morphId) attrs["data-morph"] = group.morphId;
  if (group.display) attrs.display = group.display;
  if (group.maskId) attrs.mask = `url(#${group.maskId})`;
  return tag("g", attrs, inner);
}

function sceneParts(scene: LaoScene): { defs: string; body: string } {
  const bg = renderBackground(scene.background, scene.width, scene.height, scene.idPrefix);
  const defs = bg.defs + scene.defs.map((d) => renderMaskDef(d, scene.loop)).join("");
  const body = bg.body + scene.groups.map((g) => renderGroup(g, scene)).join("");
  return { defs, body };
}

/** Inner markup (style + defs + body) — used by the React player. */
export function renderSceneInner(scene: LaoScene): string {
  const { defs, body } = sceneParts(scene);
  const style = scene.fontCss ? `<style>${scene.fontCss}</style>` : "";
  return `${style}<defs>${defs}</defs>${body}`;
}

export function renderSceneToSvg(scene: LaoScene): string {
  const { defs, body } = sceneParts(scene);
  return wrapSvg(scene.width, scene.height, defs, body, scene.fontCss, {
    durationMs: scene.durationMs,
    loop: scene.loop,
    fps: scene.fps,
    frameCount: scene.frameCount,
    idPrefix: scene.idPrefix,
    usage: "Standalone SVG. Open in a browser. No React or Lao runtime. Uses SMIL.",
  });
}

export function sceneSvgByteLength(scene: LaoScene): number {
  return new TextEncoder().encode(renderSceneToSvg(scene)).length;
}
