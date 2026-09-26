import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

// Validated palette (see dataviz validator): cobalt / amber-deep pass CVD + contrast on #fbf9f4.
export const SERIES = { leads: "#2f4fe0", booked: "#c47414" };
export const SCORE_RAMP = ["#9aaaf2", "#7589ee", "#526be6", "#2f4fe0", "#1c2f96"];

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Bar path with 4px rounded data-end and a square baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

interface Tip {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: number; color: string }[];
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-card px-3 py-2 shadow-lg"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      <p className="text-[11px] text-muted">{tip.title}</p>
      {tip.rows.map((r) => (
        <div key={r.label} className="mt-1 flex items-center gap-2">
          <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
          <span className="font-semibold tabular-nums text-ink">{r.value}</span>
          <span className="text-xs text-muted">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-xs text-ink-3">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function ActivityChart({ data }: { data: { date: string; leads: number; booked: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const height = 230;
  const pad = { top: 12, right: 4, bottom: 26, left: 28 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.leads, d.booked))));
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.max(3, Math.min(18, (band * 0.62 - 2) / 2));
  const ticks = [0, max / 2, max];
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div ref={ref} className="relative" onPointerLeave={() => (setTip(null), setHover(null))}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Leads and booked meetings per day">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#e6e0d3" strokeDasharray={t ? "3 4" : undefined} />
              <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="fill-faint font-mono text-[10px]">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.left + band * i + band / 2;
            const x1 = cx - barW - 1;
            const x2 = cx + 1;
            return (
              <g key={d.date} opacity={hover == null || hover === i ? 1 : 0.45} className="transition-opacity">
                <motion.path
                  d={barPath(x1, y(d.leads), barW, innerH + pad.top - y(d.leads))}
                  fill={SERIES.leads}
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  style={{ originY: 1, transformBox: "fill-box" }}
                  transition={{ duration: 0.6, delay: i * 0.03 }}
                />
                <motion.path
                  d={barPath(x2, y(d.booked), barW, innerH + pad.top - y(d.booked))}
                  fill={SERIES.booked}
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  style={{ originY: 1, transformBox: "fill-box" }}
                  transition={{ duration: 0.6, delay: 0.1 + i * 0.03 }}
                />
                {(data.length - 1 - i) % Math.ceil(data.length / 7) === 0 && (
                  <text x={cx} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
                    {fmt(d.date)}
                  </text>
                )}
                <rect
                  x={pad.left + band * i}
                  y={pad.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  onPointerMove={() => {
                    setHover(i);
                    setTip({
                      x: cx,
                      y: y(Math.max(d.leads, d.booked)),
                      title: fmt(d.date),
                      rows: [
                        { label: "leads", value: d.leads, color: SERIES.leads },
                        { label: "booked", value: d.booked, color: SERIES.booked },
                      ],
                    });
                  }}
                  onFocus={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

export function ScoreHistogram({ data }: { data: { range: string; count: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const height = 170;
  const pad = { top: 18, bottom: 24 };
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.count));
  const gap = 8;
  const w = data.length ? (width - gap * (data.length - 1)) / data.length : 0;

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Lead score distribution">
          <line x1={0} x2={width} y1={pad.top + innerH} y2={pad.top + innerH} stroke="#e6e0d3" />
          {data.map((d, i) => {
            const h = (d.count / max) * innerH;
            const x = i * (w + gap);
            const top = pad.top + innerH - h;
            return (
              <g key={d.range}>
                <motion.path
                  d={barPath(x, top, w, h)}
                  fill={SCORE_RAMP[i]}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  style={{ originY: 1, transformBox: "fill-box" }}
                  transition={{ duration: 0.7, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                />
                <text x={x + w / 2} y={top - 5} textAnchor="middle" className="fill-ink-3 font-mono text-[11px]">
                  {d.count}
                </text>
                <text x={x + w / 2} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
                  {d.range}
                </text>
                <rect
                  x={x}
                  y={0}
                  width={w}
                  height={height}
                  fill="transparent"
                  onPointerMove={() =>
                    setTip({ x: x + w / 2, y: top, title: `Score ${d.range}`, rows: [{ label: "leads", value: d.count, color: SCORE_RAMP[i]! }] })
                  }
                />
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

export function HBars({
  data,
  color = SERIES.leads,
  format = (s: string) => s,
}: {
  data: { label: string; value: number }[];
  color?: string;
  format?: (s: string) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={d.label} className="group grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 text-sm" title={`${format(d.label)}: ${d.value}`}>
          <span className="truncate text-ink-3">{format(d.label)}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-paper-2">
            <motion.div
              className="h-full rounded-full group-hover:brightness-110"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${(d.value / max) * 100}%` }}
              transition={{ duration: 0.8, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className="text-right font-mono text-xs tabular-nums text-ink">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}
