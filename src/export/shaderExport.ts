type Listener = () => void;

export interface ShaderExportState {
  active: boolean;
  frameMs: number;
  width: number;
  height: number;
}

let state: ShaderExportState = {
  active: false,
  frameMs: 0,
  width: 640,
  height: 360,
};

const listeners = new Set<Listener>();

export function getShaderExportState(): ShaderExportState {
  return state;
}

export function setShaderExportFrame(frameMs: number, width: number, height: number) {
  state = { active: true, frameMs, width, height };
  listeners.forEach((l) => l());
}

export function endShaderExport() {
  state = { active: false, frameMs: 0, width: 640, height: 360 };
  listeners.forEach((l) => l());
}

export function subscribeShaderExport(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Wait for React + WebGL to paint the requested shader frame. */
export async function waitForShaderRender() {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await new Promise<void>((r) => setTimeout(r, 24));
}
