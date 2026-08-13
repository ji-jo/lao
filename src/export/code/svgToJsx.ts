/** Convert SVG markup into React JSX (camelCase attrs, no XML declaration). */

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function toJsxAttrName(name: string): string {
  if (name === "class") return "className";
  if (name === "for") return "htmlFor";
  if (name.startsWith("data-") || name.startsWith("aria-")) return name;
  if (name.includes(":")) {
    const [ns, rest] = name.split(":", 2);
    if (!rest) return name;
    return ns + rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function cssToStyleObject(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of css.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    const jsxKey = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[jsxKey] = value;
  }
  return out;
}

function jsxAttr(name: string, value: string): string {
  if (name === "style") {
    return `style={${JSON.stringify(cssToStyleObject(value))}}`;
  }
  return `${name}={${JSON.stringify(value)}}`;
}

function convertAttrs(raw: string): string {
  const parts: string[] = [];
  const re =
    /([:@A-Za-z_][\w:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s/>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const jsxName = toJsxAttrName(m[1]!);
    const rawVal = m[3] ?? m[4] ?? m[5];
    if (rawVal === undefined) continue;
    parts.push(jsxAttr(jsxName, decodeXmlEntities(rawVal)));
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function escapeJsxText(text: string): string {
  const decoded = decodeXmlEntities(text);
  if (!decoded) return "";
  if (/[{}<>]/.test(decoded)) return `{${JSON.stringify(decoded)}}`;
  return decoded;
}

function stripFontImports(css: string): string {
  return css
    .replace(/@import\s+url\([^)]+\)\s*;?/gi, "")
    .replace(/^\s+|\s+$/g, "");
}

/**
 * Turn an SVG document (or fragment) into JSX element markup.
 * Root `<svg>` is included. Public `@import url(...)` font CSS is dropped.
 */
export function svgToJsx(svg: string): string {
  const stripped = svg.replace(/<\?xml\b[^?]*\?>\s*/i, "").trim();
  return xmlFragmentToJsx(stripped);
}

function xmlFragmentToJsx(xml: string): string {
  let i = 0;
  let out = "";

  const emitStyle = (css: string) => {
    const cleaned = stripFontImports(css);
    if (!cleaned) return;
    out += `<style>{${JSON.stringify(cleaned)}}</style>`;
  };

  while (i < xml.length) {
    if (xml.startsWith("<!--", i)) {
      const end = xml.indexOf("-->", i + 4);
      i = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (xml[i] !== "<") {
      const next = xml.indexOf("<", i);
      const text = xml.slice(i, next < 0 ? xml.length : next);
      i = next < 0 ? xml.length : next;
      if (text.trim()) out += escapeJsxText(text);
      continue;
    }
    if (xml.startsWith("</", i)) {
      const end = xml.indexOf(">", i);
      const name = xml.slice(i + 2, end).trim();
      out += `</${name}>`;
      i = end + 1;
      continue;
    }
    const end = xml.indexOf(">", i);
    if (end < 0) break;
    const body = xml.slice(i + 1, end);
    const selfClose = body.endsWith("/");
    const trimmed = selfClose ? body.slice(0, -1).trimEnd() : body;
    const sp = trimmed.search(/\s/);
    const name = (sp < 0 ? trimmed : trimmed.slice(0, sp)).trim();
    const rawAttrs = sp < 0 ? "" : trimmed.slice(sp);
    const attrs = convertAttrs(rawAttrs);
    i = end + 1;

    if (name.toLowerCase() === "style" && !selfClose) {
      const close = xml.toLowerCase().indexOf("</style>", i);
      const css = close < 0 ? xml.slice(i) : xml.slice(i, close);
      emitStyle(css);
      i = close < 0 ? xml.length : close + "</style>".length;
      continue;
    }

    if (selfClose) {
      out += `<${name}${attrs} />`;
      continue;
    }
    out += `<${name}${attrs}>`;
  }
  return out;
}

/** Insert newlines between tags and indent. */
export function prettyJsx(jsx: string, indent = 2): string {
  const broken = jsx.replace(/>(?=<)/g, ">\n");
  const pad = " ".repeat(indent);
  let depth = 0;
  const lines: string[] = [];
  for (const raw of broken.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const closing = line.startsWith("</");
    const selfClosing = line.endsWith("/>");
    const opening =
      line.startsWith("<") &&
      !closing &&
      !selfClosing &&
      !line.startsWith("<!") &&
      !line.startsWith("<?");
    if (closing) depth = Math.max(0, depth - 1);
    lines.push(pad.repeat(depth) + line);
    if (opening) depth += 1;
  }
  return lines.join("\n");
}
