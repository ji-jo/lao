declare module "gifenc" {
  export interface GIFWriteFrameOptions {
    palette?: number[][];
    delay?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    first?: boolean;
    repeat?: number;
  }
  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: GIFWriteFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
    reset(): void;
  }
  export function GIFEncoder(): GIFEncoderInstance;
  export function quantize(
    rgba: Uint8ClampedArray | Uint8Array,
    maxColors: number,
    options?: {
      format?: "rgb565" | "rgb444" | "rgba4444";
      oneBitAlpha?: boolean | number;
    },
  ): number[][];
  export function applyPalette(
    rgba: Uint8ClampedArray | Uint8Array,
    palette: number[][],
  ): Uint8Array;
}
