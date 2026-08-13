/**
 * SmoothUI goo filter — liquid melt between a chip blob and morphing panel.
 * Keep the filter region tight; oversized regions bleed into neighboring chrome.
 */
export const GOO_STD_DEVIATION = 10;
export const GOO_MATRIX_ALPHA_MULTIPLIER = 24;
export const GOO_MATRIX_ALPHA_OFFSET = -10;

export function GooeyFilter({ id = "goo-effect" }: { id?: string }) {
  const matrix = `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${GOO_MATRIX_ALPHA_MULTIPLIER} ${GOO_MATRIX_ALPHA_OFFSET}`;
  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0">
      <defs>
        <filter
          id={id}
          x="-80%"
          y="-200%"
          width="260%"
          height="500%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={GOO_STD_DEVIATION}
            result="blur"
          />
          <feColorMatrix
            in="blur"
            type="matrix"
            values={matrix}
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}
