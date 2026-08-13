/**
 * Hand-wrapped text-align icons from `assets/icons/text/*.svg`.
 * Uses `currentColor` so dock hover / active / purple accent work.
 */
import type { ReactNode, SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number | string };

function AlignSvg({
  size = 16,
  className,
  children,
  ...rest
}: Props & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      className={className}
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export function TextAlignLeftIcon(p: Props) {
  return (
    <AlignSvg {...p}>
      <path d="M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64Zm8,48H168a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16Zm176,24H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm-48,40H40a8,8,0,0,0,0,16H168a8,8,0,0,0,0-16Z" />
    </AlignSvg>
  );
}

export function TextAlignCenterIcon(p: Props) {
  return (
    <AlignSvg {...p}>
      <path d="M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64ZM64,96a8,8,0,0,0,0,16H192a8,8,0,0,0,0-16Zm152,40H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm-24,40H64a8,8,0,0,0,0,16H192a8,8,0,0,0,0-16Z" />
    </AlignSvg>
  );
}

export function TextAlignRightIcon(p: Props) {
  return (
    <AlignSvg {...p}>
      <path d="M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64ZM216,96H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm0,40H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm0,40H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z" />
    </AlignSvg>
  );
}
