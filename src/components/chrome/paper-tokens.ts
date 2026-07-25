/** Pixel values from Paper Stop-motion Interface (2F0-0), 1440×1024 artboard. */
export const PAPER = {
  bg: "#000000",
  surface: "#131212",
  surfaceAlt: "#131313",
  surfaceDeep: "#121212",
  outline: "#363636",
  outlineSubtle: "#2D2E2E",
  borderHairline: "#292A2A",
  text: "#DEDEDE",
  textMuted: "#DADADA",
  icon: "#DADADAE6",
  sep: "#838383",
  frameActive: "#40608E",
  frameActiveBorder: "#304263",
  handle: "#797979",
  layerPill: "#363636",

  /* timeline player — Paper "Stop-motion player" (2LM-0) */
  /** layer-row card behind label + cells (A08-0 / A2M-0) */
  trackBg: "#0D0D0D",
  /** idle frame cell (note: #121213, one hair off `surfaceDeep`) */
  cellBg: "#121213",
  /** 24px square button, idle / hover (5QE-0 hover state = #313131) */
  squareBg: "#161717",
  squareHover: "#313131",
  /** draw|preview segmented control */
  segmentBg: "#121212",
  segmentActive: "#313131",
  /** selected / hovered layer row — Paper 61L-0 ("the more button becomes delete") */
  rowActiveBg: "#3563B84D",
  pillActiveBg: "#364F8C",
  pillActiveBorder: "#4562A999",
  /** "Delete Layer n" flyout (2W5-0) */
  deleteBg: "#160E0C",
  deleteBorder: "#22110F",
  deleteIcon: "#F96D57",
  deleteText: "#CB4639",
  modeActiveGradient:
    "linear-gradient(in oklab 180deg, oklab(66.8% 0 0) 0%, oklab(19% 0 0) 100%)",
  modeActiveOutline: "#C9C9C980",
  insetX: 62,
  insetTop: 24,
  insetBottom: 48,
  settingGap: 24,
  timelineWidth: 704,
  barHeight: 36,
  fontSans: "'Geist', 'Inter Variable', system-ui, sans-serif",
  fontMono: "'Geist Mono', ui-monospace, monospace",
} as const;
