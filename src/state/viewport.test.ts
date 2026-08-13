import { describe, expect, test, beforeEach } from "bun:test";
import { useViewport, MIN_ZOOM, MAX_ZOOM } from "./viewport";

describe("viewport", () => {
  beforeEach(() => {
    useViewport.setState({ zoom: 1, panX: 0, panY: 0 });
  });

  test("clamps zoom", () => {
    useViewport.getState().setZoom(99);
    expect(useViewport.getState().zoom).toBe(MAX_ZOOM);
    useViewport.getState().setZoom(0.01);
    expect(useViewport.getState().zoom).toBe(MIN_ZOOM);
  });

  test("panBy accumulates offset", () => {
    useViewport.getState().panBy(12, -8);
    expect(useViewport.getState().panX).toBe(12);
    expect(useViewport.getState().panY).toBe(-8);
  });

  test("resetView clears zoom and pan", () => {
    useViewport.getState().setZoom(2);
    useViewport.getState().panBy(40, 20);
    useViewport.getState().resetView();
    const s = useViewport.getState();
    expect(s.zoom).toBe(1);
    expect(s.panX).toBe(0);
    expect(s.panY).toBe(0);
  });
});
