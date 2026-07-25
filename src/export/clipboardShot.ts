/** Capture current artboard composite to the system clipboard as PNG (Photoshop Copy Merged–style). */
export async function copyArtboardToClipboard(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  paint(ctx);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Failed to encode artboard PNG");
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob }),
  ]);
}
