declare module "p5.brush/standalone" {
  export function createCanvas(
    width: number,
    height: number,
    options?: { pixelDensity?: number; parent?: string | HTMLElement; id?: string },
  ): HTMLCanvasElement;
  export function load(canvas: HTMLCanvasElement | OffscreenCanvas): void;
  export function render(): void;
  export function clear(color?: string | number, g?: number, b?: number): void;
  export function push(): void;
  export function pop(): void;
  export function translate(x: number, y: number): void;
  export function rotate(angle: number): void;
  export function scale(x: number, y?: number): void;
  export function seed(n: number): void;
  export function noiseSeed(n: number): void;
  export function scaleBrushes(factor: number): void;
  export function set(
    name: string,
    color: string | number | number[],
    weight?: number,
  ): void;
  export function box(): string[];
  export function add(
    name: string,
    params: Record<string, unknown>,
  ): void | Promise<void>;
  export function beginStroke(
    type: "curve" | "segments",
    x: number,
    y: number,
  ): void;
  export function move(x: number, y: number, pressure?: number): void;
  export function endStroke(x: number, y: number): void;
  export function spline(
    points: [number, number, number?][],
    tension?: number,
  ): unknown;
  export function line(x1: number, y1: number, x2: number, y2: number): void;
  export const DEGREES: string;
  export const RADIANS: string;
  export function angleMode(mode: string): void;
}
