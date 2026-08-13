import { tag, wrapSvg } from "@/export/code/svgDoc";
import type { LaoScene, SceneBackground, SceneGroup, SceneMaskDef, ScenePath } from "@/export/code/sceneJson";

function cubicBezierKeySplines(bezier: [number, number, number, number]): string {
  const [x1, y1, x2, y2] = bezier;
  return `${x1} ${y1} ${x2} ${y2}`;
}

function renderBackground(
  bg: SceneBackground | null,
  width: number,
  height: number,
): { defs: string; body: string } {
  if (!bg) return { defs: "", body: "" };
  if (bg.kind === "color") {
    return { defs: "", body: tag("rect", { width, height, fill: bg.color }) };
  }
  const gradId = "bg";
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

function renderMaskDef(def: SceneMaskDef): string {
  if (def.kind === "eraser") {
    const cuts = (def.cuts ?? []).map((d) => tag("path", { d, fill: "black" })).join("");
    return tag(
      "mask",
      { id: def.id },
      tag("rect", { width: "100%", height: "100%", fill: "white" }) + cuts,
    );
  }
  const easing = def.easing ?? [0, 0, 1, 1];
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
      values: "100;0",
      begin: `${def.beginSec ?? 0}s`,
      dur: `${def.durSec ?? 0}s`,
      fill: "freeze",
      calcMode: "spline",
      keySplines: cubicBezierKeySplines(easing),
      keyTimes: "0;1",
    }),
  );
  return tag(
    "mask",
    { id: def.id },
    tag("rect", { width: "100%", height: "100%", fill: "black" }) + maskPath,
  );
}

function renderPath(path: ScenePath): string {
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
    inner = tag(
      "g",
      {},
      inner +
        tag("animate", {
          attributeName: "opacity",
          keyTimes: path.fade.keyTimes,
          values: path.fade.values,
          dur: `${path.fade.durSec}s`,
          fill: "freeze",
        }),
    );
  } else if (path.opacity !== undefined) {
    inner = tag("g", { opacity: path.opacity }, inner);
  }
  return inner;
}

function exposureSets(from: number, to: number, fps: number): string {
  const t0 = from / fps;
  const t1 = to / fps;
  return (
    tag("set", {
      attributeName: "display",
      to: "none",
      begin: `${t1}s`,
      fill: "freeze",
    }) +
    tag("set", {
      attributeName: "display",
      to: "inline",
      begin: `${t0}s`,
      fill: "freeze",
    })
  );
}

function renderGroup(group: SceneGroup, fps: number): string {
  let inner = group.paths.map(renderPath).join("") + group.texts.join("");
  if (group.exposure) {
    inner += exposureSets(group.exposure.from, group.exposure.to, fps);
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

/** Inner markup (style + defs + body) — used by the React player. */
export function renderSceneInner(scene: LaoScene): string {
  const bg = renderBackground(scene.background, scene.width, scene.height);
  const defs = bg.defs + scene.defs.map(renderMaskDef).join("");
  const body = bg.body + scene.groups.map((g) => renderGroup(g, scene.fps)).join("");
  const style = scene.fontCss ? `<style>${scene.fontCss}</style>` : "";
  return `${style}<defs>${defs}</defs>${body}`;
}

export function renderSceneToSvg(scene: LaoScene): string {
  const bg = renderBackground(scene.background, scene.width, scene.height);
  const defs = bg.defs + scene.defs.map(renderMaskDef).join("");
  const body = bg.body + scene.groups.map((g) => renderGroup(g, scene.fps)).join("");
  return wrapSvg(scene.width, scene.height, defs, body, scene.fontCss);
}

export function sceneSvgByteLength(scene: LaoScene): number {
  return new TextEncoder().encode(renderSceneToSvg(scene)).length;
}
