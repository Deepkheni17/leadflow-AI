import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { ActionRow } from "./ui";

type Step =
  | { kind: "lead"; text: string; who: string; score?: number }
  | { kind: "agent"; text: string }
  | { kind: "tool"; tool: string; input: Record<string, unknown>; output: Record<string, unknown>; ms: number; score?: number };

const SCRIPT: Step[] = [
  { kind: "lead", who: "Priya · Northwind", text: "We need an AI agent that qualifies inbound leads and books demos. Budget ~$25k." },
  { kind: "tool", tool: "search_customer", input: { query: "priya@northwind.io" }, output: { found: false, count: 0 }, ms: 4 },
  { kind: "tool", tool: "create_lead", input: { name: "Priya Shah", company: "Northwind" }, output: {}, ms: 6 },
  { kind: "tool", tool: "update_lead", input: { budget_usd: 25000 }, output: { score: 55 }, ms: 5, score: 55 },
  { kind: "agent", text: "Right in our wheelhouse. When would you like it live — and will you make the final call?" },
  { kind: "lead", who: "Priya · Northwind", text: "I'm the COO, it's my call. 40 people, live in 3 weeks." },
  { kind: "tool", tool: "update_lead", input: { authority: "decision_maker", company_size: 40, timeline_days: 21 }, output: { score: 97 }, ms: 7, score: 97 },
  { kind: "tool", tool: "check_calendar", input: {}, output: { slots: [1, 2, 3, 4] }, ms: 9 },
  { kind: "tool", tool: "book_meeting", input: {}, output: { label: "Mon, Sep 28 · 12:00 PM" }, ms: 11 },
  { kind: "tool", tool: "send_email", input: { subject: "Confirmed: Discovery call — Northwind" }, output: {}, ms: 38 },
  { kind: "agent", text: "Booked for Monday 12:00 PM. Confirmation and meeting link are in your inbox." },
];

const DELAY: Record<Step["kind"], number> = { lead: 1500, agent: 1700, tool: 650 };

export function AgentTrace() {
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(reduce ? SCRIPT.length : 1);

  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(
      () => setIdx((i) => (i >= SCRIPT.length ? 1 : i + 1)),
      idx >= SCRIPT.length ? 4200 : DELAY[SCRIPT[idx - 1]!.kind],
    );
    return () => window.clearTimeout(t);
  }, [idx, reduce]);

  const shown = SCRIPT.slice(0, idx);
  const score = [...shown].reverse().find((s) => "score" in s && s.score != null) as { score?: number } | undefined;
  const booked = shown.some((s) => s.kind === "tool" && s.tool === "book_meeting");
  const visible = shown.map((s, i) => ({ s, i })).slice(-4);

  return (
    <div className="relative rounded-[28px] border border-line-dark bg-ink p-2 text-paper shadow-[0_40px_120px_-40px_rgb(22_21_15/.7)]">
      <div className="flex items-center justify-between rounded-t-[22px] border-b border-line-dark px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2.5 animate-pulse-dot rounded-full bg-amber" />
          <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.16em] text-faint">live agent trace</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden whitespace-nowrap font-mono text-[11px] text-faint sm:inline">lead score</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-3">
            <motion.div
              className="h-full rounded-full bg-amber"
              animate={{ width: `${score?.score ?? 0}%` }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <motion.span key={score?.score ?? 0} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-6 font-mono text-xs text-amber">
            {score?.score ?? 0}
          </motion.span>
        </div>
      </div>

      <div className="relative h-[372px] overflow-hidden px-3 pb-3 pt-3">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-ink to-transparent" />
        <div className="flex h-full flex-col justify-end gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map(({ s, i }) => (
              <motion.div
                key={i}
                layout
                initial={{ opacity: 0, y: 18, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                {s.kind === "tool" ? (
                  <ActionRow dark compact tool={s.tool} input={s.input} output={s.output} status="success" duration={s.ms} />
                ) : s.kind === "lead" ? (
                  <div className="ml-10 rounded-2xl rounded-br-md bg-paper px-4 py-2.5 text-ink">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{s.who}</p>
                    <p className="text-[14px] leading-snug">{s.text}</p>
                  </div>
                ) : (
                  <div className="mr-10 rounded-2xl rounded-bl-md border border-line-dark bg-ink-2 px-4 py-2.5">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-amber">agent</p>
                    <p className="text-[14px] leading-snug text-paper">{s.text}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {booked && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotate: -4 }}
            animate={{ opacity: 1, scale: 1, rotate: -3 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute -right-4 -top-6 hidden rounded-2xl bg-amber px-4 py-3 text-ink shadow-xl sm:block"
          >
            <p className="font-mono text-[10px] uppercase tracking-wider">meeting booked</p>
            <p className="font-display text-xl leading-tight">Mon · 12:00 PM</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
