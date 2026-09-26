import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Empty, Skeleton } from "../../components/ui";
import { api } from "../../lib/api";
import { relTime } from "../../lib/format";
import { useData } from "../../lib/hooks";
import { summarize, TOOLS, toolMeta } from "../../lib/tools";
import { PageHeader } from "./Layout";

function Json({ value }: { value: unknown }) {
  return (
    <pre className="scrollbar-thin max-h-72 overflow-auto rounded-xl bg-ink p-4 font-mono text-[12px] leading-relaxed text-sand">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function Actions() {
  const [tool, setTool] = useState<string | undefined>();
  const [open, setOpen] = useState<number | null>(null);
  const { data } = useData(() => api.actions(tool), [tool], 5000);

  return (
    <>
      <PageHeader eyebrow="Audit log" title="Agent actions">
        <p className="max-w-sm text-sm text-muted">Every tool the agent called — inputs, outputs, status and latency.</p>
      </PageHeader>

      <div className="mb-5 flex flex-wrap gap-2">
        {[undefined, ...Object.keys(TOOLS)].map((t) => (
          <button
            key={t ?? "all"}
            onClick={() => setTool(t)}
            className={`h-9 rounded-full border px-3.5 font-mono text-xs transition ${
              tool === t ? "border-ink bg-ink text-amber" : "border-line bg-card text-ink-3 hover:border-ink/40"
            }`}
          >
            {t ? `${t}()` : "all tools"}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {!data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="p-6">
            <Empty title="No actions yet" />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data.map((a) => {
              const meta = toolMeta(a.tool);
              const isOpen = open === a.id;
              return (
                <li key={a.id}>
                  <button onClick={() => setOpen(isOpen ? null : a.id)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-paper-2/40">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${a.status === "error" ? "bg-amber-soft text-amber-deep" : "bg-paper-2 text-ink-3"}`}>
                      <meta.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-3">
                        <span className="font-mono text-[13px]">{meta.label}()</span>
                        <span className="text-xs text-muted">{a.lead_name ?? "—"}</span>
                      </p>
                      <p className="truncate text-xs text-muted">{summarize(a.tool, a.input, a.output)}</p>
                    </div>
                    <span className={`hidden rounded-full px-2 py-0.5 font-mono text-[10px] uppercase sm:inline ${a.status === "error" ? "bg-amber-soft text-amber-deep" : "bg-cobalt-soft text-cobalt"}`}>
                      {a.status}
                    </span>
                    <span className="hidden w-14 text-right font-mono text-xs text-muted sm:block">{a.duration_ms}ms</span>
                    <span className="hidden w-24 text-right text-xs text-faint md:block">{relTime(a.created_at)}</span>
                    <ChevronRight className={`size-4 text-faint transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
                          <div>
                            <p className="eyebrow mb-2">input</p>
                            <Json value={a.input} />
                          </div>
                          <div>
                            <p className="eyebrow mb-2">output</p>
                            <Json value={a.output} />
                          </div>
                          {a.lead_id && (
                            <Link to={`/dashboard/leads/${a.lead_id}`} className="text-sm text-cobalt hover:underline md:col-span-2">
                              Open lead →
                            </Link>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
