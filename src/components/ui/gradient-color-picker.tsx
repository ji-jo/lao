"use client";

import { useEffect, useRef, useState } from "react";
import ColorPicker from "react-best-gradient-color-picker";
import { PAPER } from "@/components/chrome/paper-tokens";
import { cn } from "@/lib/utils";
import type { Background } from "@/model/types";

/** Picker content width: 220 + 32px each side. */
export const BG_PICKER_WIDTH = 284;

function hexToRgba(hex: string, a = 1): string {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(255,255,255,${a})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function channelToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) =>
        Math.max(0, Math.min(255, Math.round(c)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

function normalizeSolid(value: string): string {
  const v = value.trim().replace(/\s+/g, "");
  if (/^rgba?\(/i.test(v)) return v;
  if (v.startsWith("#") || /^[0-9a-fA-F]{3,8}$/.test(v)) {
    return hexToRgba(v.startsWith("#") ? v : `#${v}`);
  }
  return v;
}

function bgSyncKey(bg: Background | undefined): string {
  if (!bg) return "none";
  if (bg.kind === "gradient") {
    return `g:${bg.css ?? ""}|${bg.shape}|${bg.angle}|${bg.from}|${bg.to}`;
  }
  if (bg.kind === "color") return `c:${bg.color}`;
  if (bg.kind === "shader") return `s:${bg.preset}`;
  if (bg.kind === "image") return `i:${bg.src.slice(0, 32)}`;
  if (bg.kind === "dots") {
    return `d:${bg.color}|${bg.dotColor}|${bg.size}|${bg.gapX}|${bg.gapY}|${bg.pattern}|${bg.shape}`;
  }
  return bg.kind;
}

/** Convert project Background → picker value string. */
export function backgroundToPickerValue(bg: Background | undefined): string {
  if (bg?.kind === "gradient") {
    if (bg.css && bg.css.includes("gradient")) return bg.css;
    const from = normalizeSolid(bg.from);
    const to = normalizeSolid(bg.to);
    if (bg.shape === "radial") {
      return `radial-gradient(circle, ${from} 0%, ${to} 100%)`;
    }
    return `linear-gradient(${bg.angle}deg, ${from} 0%, ${to} 100%)`;
  }
  if (bg?.kind === "color") return normalizeSolid(bg.color);
  if (bg?.kind === "shader") return hexToRgba(bg.colors[0] ?? "#FFFFFF");
  return "rgba(255,255,255,1)";
}

/** Convert picker onChange string → project Background (keeps full CSS for gradients). */
export function pickerValueToBackground(value: string): Background {
  const v = value.trim();
  if (v.includes("gradient")) {
    const isRadial = /radial-gradient/i.test(v);
    const angleMatch = v.match(/linear-gradient\(\s*([\d.]+)deg/i);
    const stops = [
      ...v.matchAll(
        /(rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)|#[0-9a-fA-F]{3,8})/gi,
      ),
    ].map((m) => m[1]);
    const first = stops[0] ?? "#000000";
    const last = stops[stops.length - 1] ?? first;
    const toHex = (c: string) => {
      const m = c.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
      );
      if (m) return channelToHex(+m[1], +m[2], +m[3]);
      if (c.startsWith("#")) return c.toUpperCase();
      return "#000000";
    };
    return {
      kind: "gradient",
      shape: isRadial ? "radial" : "linear",
      from: toHex(first),
      to: toHex(last),
      angle: angleMatch ? Math.round(Number(angleMatch[1])) : 90,
      // Preserve exact picker string (stop % positions, selection casing).
      css: v,
    };
  }
  return { kind: "color", color: normalizeSolid(v) };
}

function setNativeInputValue(input: HTMLInputElement, next: string) {
  const proto = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  proto?.set?.call(input, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clampForInput(input: HTMLInputElement, n: number): number {
  const id = input.id.toLowerCase();
  if (id.includes("degree")) return Math.max(0, Math.min(360, n));
  if (id.includes("stop")) return Math.max(0, Math.min(100, n));
  if (id.includes("-a-input") || id.includes("a-input"))
    return Math.max(0, Math.min(100, n));
  if (
    id.includes("-r-input") ||
    id.includes("-g-input") ||
    id.includes("-b-input")
  )
    return Math.max(0, Math.min(255, n));
  if (id.includes("-h-input")) return Math.max(0, Math.min(360, n));
  if (
    id.includes("-s-input") ||
    id.includes("-l-input") ||
    id.includes("-v-input") ||
    id.includes("-c-input") ||
    id.includes("-m-input") ||
    id.includes("-y-input") ||
    id.includes("-k-input")
  )
    return Math.max(0, Math.min(100, n));
  return n;
}

/**
 * Dark-themed `react-best-gradient-color-picker` for canvas background.
 * Local value stays authoritative while editing so stops / hue aren't
 * clobbered by a lossy Background store echo.
 */
export function GradientColorPicker({
  background,
  onChange,
  className,
  width = BG_PICKER_WIDTH,
  height = 140,
}: {
  background: Background | undefined;
  onChange: (bg: Background) => void;
  className?: string;
  width?: number;
  height?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ignoreStoreEcho = useRef(false);
  const prevKey = useRef<string | null>(null);
  const [value, setValue] = useState(() => backgroundToPickerValue(background));

  useEffect(() => {
    const key = bgSyncKey(background);
    if (ignoreStoreEcho.current) {
      ignoreStoreEcho.current = false;
      prevKey.current = key;
      return;
    }
    if (prevKey.current === key) return;
    prevKey.current = key;
    setValue(backgroundToPickerValue(background));
  }, [background]);

  // Arrow Up/Down nudges on library numeric fields (degree, stop, rgba…).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (t.id.toLowerCase().includes("hex")) return;

      const dir = e.key === "ArrowUp" ? 1 : -1;
      const step = e.shiftKey ? 10 : 1;
      const raw = t.value.replace(/[^\d.-]/g, "");
      const cur = Number.parseFloat(raw);
      if (!Number.isFinite(cur)) return;
      e.preventDefault();
      e.stopPropagation();
      const next = clampForInput(t, cur + dir * step);
      setNativeInputValue(t, String(Math.round(next)));
    };

    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, []);

  // Library toggles RGB/HSL/HSV/CMYK on click only — close after leave, but
  // keep open while hovering the menu (there's a gap under the 24px button).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    let boundBtn: HTMLElement | null = null;
    let boundDropdown: HTMLElement | null = null;

    const isDropdownOpen = (dropdown: HTMLElement) => {
      const style = getComputedStyle(dropdown);
      return (
        style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0.05
      );
    };

    const cancelClose = () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    };

    const scheduleClose = (btn: HTMLElement) => {
      cancelClose();
      closeTimer = setTimeout(() => {
        closeTimer = null;
        const dropdown = btn.querySelector<HTMLElement>(
          '[id*="rbgcp-color-model-dropdown"]',
        );
        if (!dropdown || !isDropdownOpen(dropdown)) return;
        // Still over the trigger or the menu — keep open.
        if (btn.matches(":hover") || dropdown.matches(":hover")) return;
        btn.click();
      }, 280);
    };

    const onLeave = (e: Event) => {
      const btn =
        (e.currentTarget as HTMLElement).closest<HTMLElement>(
          '[id*="rbgcp-color-model-btn"]',
        ) ?? boundBtn;
      if (btn) scheduleClose(btn);
    };

    const onEnter = () => cancelClose();

    const bind = () => {
      const btn = root.querySelector<HTMLElement>(
        '[id*="rbgcp-color-model-btn"]',
      );
      const dropdown = btn?.querySelector<HTMLElement>(
        '[id*="rbgcp-color-model-dropdown"]',
      );
      if (!btn) return;

      if (btn !== boundBtn) {
        if (boundBtn) {
          boundBtn.removeEventListener("mouseleave", onLeave);
          boundBtn.removeEventListener("mouseenter", onEnter);
        }
        boundBtn = btn;
        btn.addEventListener("mouseleave", onLeave);
        btn.addEventListener("mouseenter", onEnter);
      }

      if (dropdown && dropdown !== boundDropdown) {
        if (boundDropdown) {
          boundDropdown.removeEventListener("mouseleave", onLeave);
          boundDropdown.removeEventListener("mouseenter", onEnter);
        }
        boundDropdown = dropdown;
        dropdown.addEventListener("mouseleave", onLeave);
        dropdown.addEventListener("mouseenter", onEnter);
      }
    };

    bind();
    const mo = new MutationObserver(bind);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      cancelClose();
      mo.disconnect();
      boundBtn?.removeEventListener("mouseleave", onLeave);
      boundBtn?.removeEventListener("mouseenter", onEnter);
      boundDropdown?.removeEventListener("mouseleave", onLeave);
      boundDropdown?.removeEventListener("mouseenter", onEnter);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn("lao-bg-color-picker", className)}
      style={{
        width,
        maxWidth: width,
        fontFamily: PAPER.fontSans,
      }}
    >
      <ColorPicker
        value={value}
        onChange={(next) => {
          setValue(next);
          ignoreStoreEcho.current = true;
          onChange(pickerValueToBackground(next));
        }}
        width={width}
        height={height}
        disableLightMode
        hideColorGuide
        hideEyeDrop
        className="lao-rbgcp"
      />
    </div>
  );
}
