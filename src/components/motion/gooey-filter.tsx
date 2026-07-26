/**
 * Lucas Bebber gooey — exact blur / matrix / composite from
 * https://github.com/oguzhantufenk/gooey-search
 *
 * Filter region expanded so the absolute supporting dock (above the bar)
 * stays inside the effect; gooey-search results sit closer to the bbox.
 */
export function GooeyFilter({ id = "goo-effect" }: { id?: string }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0">
      <defs>
        <filter
          id={id}
          // Wide enough for a side supporting panel melting off the main dock.
          x="-150%"
          y="-600%"
          width="400%"
          height="900%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -15"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}
