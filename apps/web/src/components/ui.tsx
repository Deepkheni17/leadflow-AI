import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LeadStatus } from "../lib/api";
import { initials, statusLabel } from "../lib/format";
import { summarize, toolMeta } from "../lib/tools";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";

export function Logo({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" fill={dark ? "#F3EFE6" : "#16150F"} />
        <path
          d="M7.5 20.5c4.2 0 5-8.5 9.2-8.5 3.9 0 4 5.2 7.3 5.2"
          stroke="#F2A541"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="24" cy="17.2" r="2.7" fill={dark ? "#16150F" : "#F3EFE6"} />
      </svg>
      <span className={`text-[17px] font-semibold tracking-tight ${dark ? "text-paper" : "text-ink"}`}>
        LeadFlow<span className="text-amber-deep">.</span>
        <span className={`ml-1 font-display text-[19px] font-normal italic ${dark ? "text-sand" : "text-muted"}`}>ai</span>
      </span>
    </span>
  );
}

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "bg-paper-2 text-ink-3",
  qualifying: "bg-cobalt-soft text-cobalt",
  qualified: "bg-cobalt text-white",
  booked: "bg-amber text-ink",
  nurture: "bg-sand text-ink-3",
  disqualified: "bg-line text-muted",
};

export function StatusPill({ status, className = "" }: { status: LeadStatus; className?: string }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${STATUS_STYLE[status]} ${className}`}
    >
      {statusLabel[status]}
    </span>
  );
}

export function scoreTone(score: number) {
  if (score >= 75) return { bar: "bg-cobalt", text: "text-cobalt", label: "Hot" };
  if (score >= 50) return { bar: "bg-amber-deep", text: "text-amber-deep", label: "Warm" };
  return { bar: "bg-faint", text: "text-muted", label: "Cold" };
}

export function ScoreBar({ score, className = "" }: { score: number; className?: string }) {
  const tone = scoreTone(score);
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-paper-2">
        <motion.div
          className={`h-full rounded-full ${tone.bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span className={`w-7 font-mono text-xs tabular-nums ${tone.text}`}>{score}</span>
    </div>
  );
}

export function ScoreRing({
  score,
  size = 120,
  stroke = 9,
  dark = false,
  label = true,
}: {
  score: number;
  size?: number;
  stroke?: number;
  dark?: boolean;
  label?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 75 ? "#2F4FE0" : score >= 50 ? "#C47414" : "#A39E8F";
  const ringColor = dark && score >= 75 ? "#9AAAF2" : dark && score >= 50 ? "#F2A541" : tone;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={dark ? "#34322a" : "#EAE4D7"} strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - score / 100) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {label && (
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <CountUp value={score} className={`block font-display text-[2.1em] leading-none ${dark ? "text-paper" : "text-ink"}`} />
            <span className={`font-mono text-[10px] uppercase tracking-widest ${dark ? "text-faint" : "text-muted"}`}>
              score
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  className = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const from = useRef(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [inView, value, reduce]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export function Reveal({
  children,
  delay = 0,
  y = 24,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Avatar({ name, className = "" }: { name: string | null | undefined; className?: string }) {
  // Deterministic, calm tint per person.
  const tints = ["bg-amber-soft text-amber-deep", "bg-cobalt-soft text-cobalt", "bg-sand text-ink-3", "bg-paper-2 text-ink-3"];
  const idx = [...(name ?? "")].reduce((a, ch) => a + ch.charCodeAt(0), 0) % tints.length;
  return (
    <span
      className={`inline-grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${tints[idx]} ${className}`}
    >
      {initials(name)}
    </span>
  );
}

export function ActionRow({
  tool,
  input,
  output,
  status,
  duration,
  dark = false,
  compact = false,
}: {
  tool: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  status: "running" | "success" | "error";
  duration?: number;
  dark?: boolean;
  compact?: boolean;
}) {
  const meta = toolMeta(tool);
  const Icon = meta.icon;
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 ${compact ? "py-2" : "py-2.5"} ${
        dark ? "border-line-dark bg-ink-2 text-paper" : "border-line bg-card"
      }`}
    >
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-lg ${
          status === "error" ? "bg-amber-soft text-amber-deep" : dark ? "bg-ink-3 text-amber" : "bg-paper-2 text-ink-3"
        }`}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-[12px] ${dark ? "text-amber" : "text-ink"}`}>{meta.label}()</span>
          {duration != null && status !== "running" && (
            <span className={`font-mono text-[10px] ${dark ? "text-faint" : "text-faint"}`}>{duration}ms</span>
          )}
        </div>
        <p className={`truncate text-xs ${dark ? "text-faint" : "text-muted"}`}>{summarize(tool, input, output)}</p>
      </div>
      <span className="shrink-0">
        {status === "running" ? (
          <LoaderCircle className={`size-4 animate-spin ${dark ? "text-amber" : "text-cobalt"}`} />
        ) : status === "error" ? (
          <TriangleAlert className="size-4 text-amber-deep" />
        ) : (
          <Check className={`size-4 ${dark ? "text-sky" : "text-cobalt"}`} />
        )}
      </span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <p className="font-display text-2xl text-ink">{title}</p>
      {children && <div className="mt-2 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-paper-2 ${className}`} />;
}
