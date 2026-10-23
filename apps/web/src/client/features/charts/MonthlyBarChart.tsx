import { formatMoney } from "@mft/ui";
import { useLayoutEffect, useRef, useState } from "react";

export interface ChartSeries {
  name: string;
  /** A CSS color, normally a design-system token: "var(--chart-1)". */
  color: string;
}

export interface MonthlyBarChartProps {
  /** One column per month, oldest first. `values[i]` belongs to `series[i]` (integer minor units, >= 0). */
  data: { label: string; values: number[] }[];
  series: ChartSeries[];
  /** Accessible summary of the chart, read instead of the SVG. */
  description: string;
}

const HEIGHT = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 56 };
const BAR_GAP = 2; // surface gap between adjacent bars in a group

const compact = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact" });

/** Rounds up to 1, 2, 4 or 8 × 10^n: quarters of those stay round (₱5K, ₱10K, ₱20K), so the four ticks read cleanly. */
function niceMax(value: number) {
  if (value <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 4, 8, 10].find((step) => step * pow >= value) ?? 10) * pow;
}

/** A bar with 6px rounded corners at the data end, square at the baseline. */
function barPath(x: number, y: number, w: number, base: number) {
  const r = Math.min(6, w / 2, base - y);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

/**
 * Grouped bars per month in inline SVG, colored with design-system tokens so light and dark
 * themes follow the CSS. Hover or focus a month for its values; the table below has every number.
 */
export function MonthlyBarChart({ data, series, description }: MonthlyBarChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...data.flatMap((d) => d.values)) / 100) * 100;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const base = PAD.top + plotH;
  const colW = data.length ? plotW / data.length : 0;
  const groupW = Math.min(colW * 0.64, series.length * 28);
  const barW = Math.max(1, (groupW - BAR_GAP * (series.length - 1)) / series.length);
  const y = (v: number) => base - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const activeColumn = active === null ? undefined : data[active];

  return (
    <figure className="chart">
      {series.length > 1 && (
        <ul className="chart__legend" aria-label="Legend">
          {series.map((s) => (
            <li key={s.name}>
              <span className="chart__swatch" style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </li>
          ))}
        </ul>
      )}

      <div className="chart__plot" ref={box} onMouseLeave={() => setActive(null)}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={description}>
            {ticks.map((t) => (
              <g key={t} className="chart__grid">
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                  {compact.format(t / 100)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = PAD.left + i * colW;
              const gx = x0 + (colW - groupW) / 2;
              return (
                <g key={d.label}>
                  {active === i && <rect className="chart__hover" x={x0} y={PAD.top} width={colW} height={plotH} />}
                  {d.values.map((v, s) =>
                    v > 0 ? (
                      <path key={s} d={barPath(gx + s * (barW + BAR_GAP), y(v), barW, base)} fill={series[s]?.color} />
                    ) : null,
                  )}
                  <text className="chart__axis" x={x0 + colW / 2} y={HEIGHT - 8} textAnchor="middle">
                    {d.label}
                  </text>
                  {/* Hit target: the whole column, bigger than the bars. Focusable for keyboard users. */}
                  <rect
                    className="chart__hit"
                    x={x0}
                    y={PAD.top}
                    width={colW}
                    height={plotH}
                    tabIndex={0}
                    aria-label={`${d.label}: ${series.map((s, k) => `${s.name} ${formatMoney(d.values[k] ?? 0)}`).join(", ")}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  />
                </g>
              );
            })}
            <line className="chart__baseline" x1={PAD.left} x2={width - PAD.right} y1={base} y2={base} />
          </svg>
        )}

        {activeColumn && active !== null && (
          <div
            className="chart__tooltip"
            aria-hidden="true"
            style={{
              left: Math.min(Math.max(PAD.left + (active + 0.5) * colW, 90), width - 90),
              top: PAD.top,
            }}
          >
            <strong>{activeColumn.label}</strong>
            {series.map((s, k) => (
              <span key={s.name}>
                <span className="chart__swatch" style={{ background: s.color }} />
                {s.name} <b>{formatMoney(activeColumn.values[k] ?? 0)}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      <details className="chart__table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Month</th>
              {series.map((s) => (
                <th scope="col" key={s.name}>
                  <span className="chart__swatch" style={{ background: s.color }} aria-hidden="true" /> {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <th scope="row">{d.label}</th>
                {series.map((s, k) => (
                  <td key={s.name}>{formatMoney(d.values[k] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
