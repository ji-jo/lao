/**
 * Pressure from input. Real pens report PointerEvent.pressure; mice and
 * trackpads report a constant 0.5, so we synthesize pressure from velocity —
 * fast strokes go light, slow deliberate strokes press hard (BOIL spec §5).
 */

const MOUSE_MAX_SPEED = 2.5; // px/ms where synthesized pressure bottoms out
const EMA = 0.35; // smoothing factor for synthesized pressure

export class PressureTracker {
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private smoothed = 0.7;
  private started = false;

  read(e: PointerEvent, x: number, y: number, t: number): number {
    const isPen = e.pointerType === "pen";
    if (isPen && e.pressure > 0) return e.pressure;

    if (!this.started) {
      this.started = true;
      this.lastX = x;
      this.lastY = y;
      this.lastT = t;
      return this.smoothed;
    }
    const dt = Math.max(t - this.lastT, 1);
    const dist = Math.hypot(x - this.lastX, y - this.lastY);
    const speed = dist / dt;
    const target = Math.min(Math.max(1 - speed / MOUSE_MAX_SPEED, 0.15), 1);
    this.smoothed = this.smoothed + (target - this.smoothed) * EMA;
    this.lastX = x;
    this.lastY = y;
    this.lastT = t;
    return this.smoothed;
  }
}
