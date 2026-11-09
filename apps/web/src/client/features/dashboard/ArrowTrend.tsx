import type { StatTrend } from "@mft/ui";

const paths = { up: "M5 11 11 5M6 5h5v5", down: "M5 5l6 6M11 6v5H6", flat: "M4 8h8" };

/** StatTile's change line ("₱2,300.00 more than September"), for tiles StatTile can't lay out. */
export function ArrowTrend({ trend }: { trend: StatTrend }) {
  return (
    <p className={`mft-stat__trend mft-stat__trend--${trend.sentiment}`}>
      <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d={paths[trend.direction]} />
      </svg>
      <span>{trend.text}</span>
    </p>
  );
}
