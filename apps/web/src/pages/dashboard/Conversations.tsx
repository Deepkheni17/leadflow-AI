import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Transcript } from "../../components/Transcript";
import { Avatar, Empty, ScoreBar, Skeleton, StatusPill } from "../../components/ui";
import { api } from "../../lib/api";
import { relTime } from "../../lib/format";
import { useData } from "../../lib/hooks";
import { PageHeader } from "./Layout";

export default function Conversations() {
  const list = useData(api.conversations, [], 6000);
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get("id"));

  useEffect(() => {
    if (!selected && list.data?.length) setSelected(list.data[0]!.id);
  }, [list.data, selected]);

  const detail = useData(() => (selected ? api.conversation(selected) : Promise.resolve(null)), [selected], 6000);
  const pick = (id: string) => {
    setSelected(id);
    setParams({ id }, { replace: true });
  };

  return (
    <>
      <PageHeader eyebrow="Inbox" title="Conversations" />
      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="card overflow-hidden">
          {!list.data ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : list.data.length === 0 ? (
            <div className="p-4">
              <Empty title="No conversations">They'll appear as soon as a lead talks to the agent.</Empty>
            </div>
          ) : (
            <ul className="scrollbar-thin max-h-[40vh] divide-y divide-line overflow-y-auto xl:max-h-[72vh]">
              {list.data.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => pick(c.id)}
                    className={`relative flex w-full gap-3 px-4 py-3.5 text-left transition ${selected === c.id ? "bg-paper-2/80" : "hover:bg-paper-2/40"}`}
                  >
                    {selected === c.id && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-amber-deep" />}
                    <Avatar name={c.lead_name ?? "?"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium">{c.lead_name ?? "Anonymous visitor"}</p>
                        <span className="shrink-0 text-[11px] text-faint">{relTime(c.updated_at)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{c.last_message ?? "…"}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="card min-h-[60vh] min-w-0 p-5 sm:p-6">
          {!detail.data ? (
            <Skeleton className="h-96" />
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-line pb-5">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-3xl leading-none">{detail.data.lead?.name ?? "Anonymous visitor"}</p>
                  <p className="mt-1.5 text-sm text-muted">
                    {detail.data.lead?.company ?? detail.data.lead?.email ?? "Not identified yet"} · {detail.data.messages.length} messages ·{" "}
                    {detail.data.actions.length} tool calls
                  </p>
                </div>
                {detail.data.lead && (
                  <>
                    <StatusPill status={detail.data.lead.status} />
                    <ScoreBar score={detail.data.lead.score} />
                    <Link to={`/dashboard/leads/${detail.data.lead.id}`} className="btn-ghost h-9 px-4">
                      Lead <ArrowUpRight className="size-3.5" />
                    </Link>
                  </>
                )}
              </div>
              <div className="scrollbar-thin max-h-[62vh] overflow-y-auto pr-1">
                <Transcript detail={detail.data} />
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
