import { useEffect, useRef, useState, type FC } from "react";
import type { LaoScene } from "@/export/code/sceneJson";
import { parseLaoScene } from "@/export/code/sceneJson";
import { renderSceneToSvg } from "@/export/code/sceneRender";

export type LaoPlayMode = "auto" | "scroll";

export interface LaoPlayerProps {
  /** URL of a `lao-scene` JSON file. Fetched after mount so the JS bundle stays small. */
  src?: string;
  /** Inline scene (tiny clips only — prefer `src` for page load). */
  scene?: LaoScene;
  width?: number;
  height?: number;
  className?: string;
  playMode?: LaoPlayMode;
  paused?: boolean;
}

function extractSvgInner(svg: string): string {
  const stripped = svg.replace(/<\?xml[^>]*>\s*/i, "");
  const match = stripped.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i);
  return match?.[1] ?? stripped;
}

function kickSmil(el: SVGSVGElement) {
  try {
    el.querySelectorAll("animate, animateMotion, set").forEach((node) => {
      const anim = node as SVGAnimationElement & { beginElement?: () => void };
      anim.beginElement?.();
    });
  } catch {
    /* ignore */
  }
}

export const LaoPlayer: FC<LaoPlayerProps> = ({
  src,
  scene: sceneProp,
  width,
  height,
  className,
  playMode = "auto",
  paused = false,
}) => {
  const ref = useRef<SVGSVGElement>(null);
  const [scene, setScene] = useState<LaoScene | null>(sceneProp ?? null);

  useEffect(() => {
    if (sceneProp) {
      setScene(sceneProp);
      return;
    }
    if (!src) return;
    let cancelled = false;
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${src}`);
        return r.json();
      })
      .then((json) => {
        if (!cancelled) setScene(parseLaoScene(json));
      })
      .catch(() => {
        if (!cancelled) setScene(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src, sceneProp]);

  const durationSec = scene ? scene.durationMs / 1000 : 0;
  const w = width ?? scene?.width ?? 0;
  const h = height ?? scene?.height ?? 0;

  useEffect(() => {
    const el = ref.current;
    if (!el || !scene) return;
    const inner = extractSvgInner(renderSceneToSvg(scene));
    el.innerHTML = inner;

    if (playMode === "scroll") {
      el.pauseAnimations?.();
      const scrub = () => {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const start = vh;
        const end = -rect.height;
        const span = start - end || 1;
        const p = Math.min(1, Math.max(0, (start - rect.top) / span));
        el.setCurrentTime?.(p * durationSec);
      };
      scrub();
      window.addEventListener("scroll", scrub, { passive: true });
      window.addEventListener("resize", scrub);
      return () => {
        window.removeEventListener("scroll", scrub);
        window.removeEventListener("resize", scrub);
      };
    }

    el.unpauseAnimations?.();
    el.setCurrentTime?.(0);
    kickSmil(el);
    if (paused) el.pauseAnimations?.();
    else el.unpauseAnimations?.();
  }, [scene, playMode, paused, durationSec]);

  return (
    <svg
      ref={ref}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={w || undefined}
      height={h || undefined}
      viewBox={scene ? `0 0 ${scene.width} ${scene.height}` : undefined}
      fill="none"
      data-lao-duration={durationSec}
      data-lao-play-mode={playMode}
    />
  );
};

export default LaoPlayer;
