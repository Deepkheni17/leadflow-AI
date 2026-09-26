import { motion } from "motion/react";
import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Empty, ScoreBar, Skeleton, StatusPill } from "../../components/ui";
import { api, type LeadStatus } from "../../lib/api";
import { money, relTime, statusLabel } from "../../lib/format";
import { useData } from "../../lib/hooks";
import { PageHeader } from "./Layout";

const FILTERS: (LeadStatus | "all")[] = ["all", "qualifying", "qualified", "booked", "nurture"];

export default function Leads() {
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "score">("recent");
  const query = useDeferredValue(q);
  const navigate = useNavigate();
  const { data, loading } = useData(
    () => api.leads({ status: status === "all" ? undefined : status, q: query, sort }),
    [status, query, sort],
    8000,
  );

  return (
    <>
      <PageHeader eyebrow="CRM" title="Leads">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, company" className="input h-11 pl-10" />
        </div>
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatus(f)}
            className={`relative h-9 rounded-full px-4 text-sm transition ${status === f ? "text-paper" : "text-ink-3 hover:bg-paper-2"}`}
          >
            {status === f && <motion.span layoutId="lead-filter" className="absolute inset-0 rounded-full bg-ink" />}
            <span className="relative">{f === "all" ? "All" : statusLabel[f]}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 rounded-full border border-line bg-card p-1 text-xs">
          {(["recent", "score"] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)} className={`rounded-full px-3 py-1.5 ${sort === s ? "bg-paper-2 font-medium text-ink" : "text-muted"}`}>
              {s === "recent" ? "Newest" : "Top score"}
            </button>
          ))}
        </div>
      </div>

      <div className={`card overflow-hidden transition-opacity ${loading && data ? "opacity-70" : ""}`}>
        {!data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="p-6">
            <Empty title="No leads match">Try another filter, or simulate a lead from the sidebar.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  <th className="px-5 py-3 font-normal">Lead</th>
                  <th className="px-3 py-3 font-normal">Status</th>
                  <th className="px-3 py-3 font-normal">Score</th>
                  <th className="px-3 py-3 font-normal">Budget</th>
                  <th className="px-3 py-3 font-normal">Timeline</th>
                  <th className="px-3 py-3 font-normal">Team</th>
                  <th className="px-5 py-3 text-right font-normal">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.map((l, i) => (
                  <motion.tr
                    key={l.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.025, 0.3) }}
                    onClick={() => navigate(`/dashboard/leads/${l.id}`)}
                    className="cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-paper-2/50"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={l.name} />
                        <div className="min-w-0">
                          <p className="font-medium">{l.name}</p>
                          <p className="truncate text-xs text-muted">{l.company ?? l.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={l.status} />
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBar score={l.score} />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{money(l.budget_usd)}</td>
                    <td className="px-3 py-3 text-ink-3">{l.timeline ?? <span className="text-faint">—</span>}</td>
                    <td className="px-3 py-3 font-mono text-xs">{l.company_size ?? <span className="text-faint">—</span>}</td>
                    <td className="px-5 py-3 text-right text-xs text-muted">{relTime(l.created_at)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
