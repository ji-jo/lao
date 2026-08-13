/**
 * Tip PNG URLs kept for offline tools / extract scripts.
 * Paint path is procedural in brushStyles — do not import this from draw code.
 */

export const TIP_ASSET_IDS = [
  "watercolor",
  "acrylic",
  "charcoal",
  "pencil",
  "brush",
  "airbrush",
  "stipple",
] as const;

export type TipAssetId = (typeof TIP_ASSET_IDS)[number];

import tipAcrylic from "@/assets/brush/tips/acrylic.png";
import tipAirbrush from "@/assets/brush/tips/airbrush.png";
import tipBrush from "@/assets/brush/tips/brush.png";
import tipCharcoal from "@/assets/brush/tips/charcoal.png";
import tipPencil from "@/assets/brush/tips/pencil.png";
import tipStipple from "@/assets/brush/tips/stipple.png";
import tipWatercolor from "@/assets/brush/tips/watercolor.png";

export const TIP_URLS: Record<TipAssetId, string> = {
  watercolor: tipWatercolor,
  acrylic: tipAcrylic,
  charcoal: tipCharcoal,
  pencil: tipPencil,
  brush: tipBrush,
  airbrush: tipAirbrush,
  stipple: tipStipple,
};
