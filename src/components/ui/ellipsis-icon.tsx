import type { SVGProps } from "react";

/** src/assets/icons/ellipsis.svg — three dots, inherits currentColor */
export default function EllipsisIcon({
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
      <circle cx="5.14406" cy="10" r="1.428" fill="currentColor" />
      <circle cx="10" cy="10" r="1.428" fill="currentColor" />
      <circle cx="14.856" cy="10" r="1.428" fill="currentColor" />
    </svg>
  );
}
