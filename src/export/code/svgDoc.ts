export interface SvgAttrs {
  [key: string]: string | number | undefined | null | false;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function attrsToString(attrs: SvgAttrs): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    parts.push(`${k}="${escapeXml(String(v))}"`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

export function tag(name: string, attrs: SvgAttrs, inner?: string): string {
  const open = `<${name}${attrsToString(attrs)}`;
  if (inner === undefined || inner === "") return `${open}/>`;
  return `${open}>${inner}</${name}>`;
}

export function wrapSvg(
  width: number,
  height: number,
  defs: string,
  body: string,
  extraStyle?: string,
  meta?: {
    durationMs: number;
    loop: string;
    fps: number;
    frameCount: number;
    idPrefix: string;
    usage: string;
  },
): string {
  const style = extraStyle
    ? `<style>${extraStyle}</style>`
    : "";
  const comment = meta
    ? `<!-- lao-export durationMs=${meta.durationMs} loop=${meta.loop} fps=${meta.fps} frameCount=${meta.frameCount} idPrefix=${meta.idPrefix} -->\n` +
      `<!-- ${escapeXml(meta.usage)} -->\n`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    comment +
    tag("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: "xMidYMid meet",
      fill: "none",
      "data-lao-duration-ms": meta?.durationMs,
      "data-lao-loop": meta?.loop,
      "data-lao-fps": meta?.fps,
      "data-lao-frames": meta?.frameCount,
    }, `${style}<defs>${defs}</defs>${body}`)
  );
}
