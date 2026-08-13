import type { SVGProps } from "react";

/** src/assets/icons/ellipsis with close.svg — the dots crossed into an X */
export default function EllipsisCloseIcon({
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      <circle
        cx="6.56641"
        cy="6.56637"
        r="1.428"
        transform="rotate(45 6.56641 6.56637)"
        fill="currentColor"
      />
      <circle
        cx="10"
        cy="9.99996"
        r="1.428"
        transform="rotate(45 10 9.99996)"
        fill="currentColor"
      />
      <circle
        cx="13.4338"
        cy="13.4338"
        r="1.428"
        transform="rotate(45 13.4338 13.4338)"
        fill="currentColor"
      />
      <circle
        cx="6.56637"
        cy="13.4338"
        r="1.428"
        transform="rotate(-45 6.56637 13.4338)"
        fill="currentColor"
      />
      <circle
        cx="9.99996"
        cy="10.0002"
        r="1.428"
        transform="rotate(-45 9.99996 10.0002)"
        fill="currentColor"
      />
      <circle
        cx="13.4338"
        cy="6.56641"
        r="1.428"
        transform="rotate(-45 13.4338 6.56641)"
        fill="currentColor"
      />
    </svg>
  );
}
