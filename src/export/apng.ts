/**
 * Minimal APNG encoder — stitches PNG IDAT chunks from canvas frames.
 * Each frame is captured via canvas.toBlob("image/png") and parsed for IDAT/IHDR.
 */

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc);
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function findChunk(png: Uint8Array, type: string): Uint8Array | null {
  let i = 8;
  while (i + 8 <= png.length) {
    const len = new DataView(png.buffer, png.byteOffset + i, 4).getUint32(0);
    const t =
      String.fromCharCode(png[i + 4], png[i + 5], png[i + 6], png[i + 7]);
    if (t === type) return png.subarray(i + 8, i + 8 + len);
    i += 12 + len;
  }
  return null;
}

function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("PNG encode failed"));
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, "image/png");
  });
}

/** Encode canvas frames (same dimensions) to APNG. */
export async function encodeApng(
  canvas: HTMLCanvasElement,
  frameCount: number,
  fps: number,
  paintFrame: (frame: number) => void | Promise<void>,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const pngFrames: Uint8Array[] = [];
  for (let f = 0; f < frameCount; f++) {
    await paintFrame(f);
    pngFrames.push(await pngBytes(canvas));
    onProgress?.((f + 1) / frameCount);
  }

  const ihdr = findChunk(pngFrames[0], "IHDR");
  const firstIdat = findChunk(pngFrames[0], "IDAT");
  if (!ihdr || !firstIdat) throw new Error("Invalid PNG frame");

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const acTL = chunk(
    "acTL",
    (() => {
      const d = new Uint8Array(8);
      new DataView(d.buffer).setUint32(0, frameCount);
      new DataView(d.buffer).setUint32(4, 0);
      return d;
    })(),
  );

  const parts: Uint8Array[] = [sig, chunk("IHDR", ihdr), acTL, chunk("IDAT", firstIdat)];

  for (let f = 1; f < frameCount; f++) {
    const idat = findChunk(pngFrames[f], "IDAT");
    if (!idat) throw new Error(`Missing IDAT in frame ${f}`);

    const delay = Math.max(1, Math.round(1000 / fps));
    const fcTL = chunk(
      "fcTL",
      (() => {
        const d = new Uint8Array(26);
        const v = new DataView(d.buffer);
        v.setUint32(0, f);
        v.setUint32(4, canvas.width);
        v.setUint32(8, canvas.height);
        v.setUint32(12, 0);
        v.setUint32(16, 0);
        v.setUint16(20, delay);
        v.setUint16(22, 1000);
        d[24] = 0;
        d[25] = 0;
        return d;
      })(),
    );

    const fdData = new Uint8Array(4 + idat.length);
    new DataView(fdData.buffer).setUint32(0, f);
    fdData.set(idat, 4);
    parts.push(fcTL, chunk("fdAT", fdData));
  }

  parts.push(chunk("IEND", new Uint8Array(0)));
  return new Blob([new Uint8Array(concat(parts))], { type: "image/apng" });
}
