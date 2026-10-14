/** Internal glyphs. 16px grid, 1.75 stroke, currentColor. Not exported: the system has no public icon set yet. */
import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

export const ArrowUpRight = () => (
  <svg {...base}>
    <path d="M5 11 11 5M6 5h5v5" />
  </svg>
);

export const ArrowDownRight = () => (
  <svg {...base}>
    <path d="M5 5l6 6M11 6v5H6" />
  </svg>
);

export const Minus = () => (
  <svg {...base}>
    <path d="M4 8h8" />
  </svg>
);
