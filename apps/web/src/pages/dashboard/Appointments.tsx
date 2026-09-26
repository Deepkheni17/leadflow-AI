import { AnimatePresence, motion } from "motion/react";
import { Video, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, Empty, Skeleton } from "../../components/ui";
import { api, type Appointment } from "../../lib/api";
import { dayLabel, time } from "../../lib/format";
import { broadcastRefresh, useData } from "../../lib/hooks";
import { PageHeader } from "./Layout";

export default function Appointments() {
  const [upcoming, setUpcoming] = useState(true);
  const { data, reload } = useData(() => api.appointments(upcoming), [upcoming], 10000);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const groups = new Map<string, Appointment[]>();
  for (const a of data ?? []) {
    const key = new Date(a.start_at).toDateString();
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  const cancel = async (id: string) => {
    if (!window.confirm("Cancel this meeting? The lead goes back to “qualified”.")) return;
    setCancelling(id);
    try {
      await api.cancelAppointment(id);
      await reload();
      broadcastRefresh();
    } finally {
      setCancelling(null);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Calendar" title="Appointments">
        <div className="flex items-center gap-1 rounded-full border border-line bg-card p-1 text-sm">
          {[
            [true, "Upcoming"],
            [false, "All"],
          ].map(([v, label]) => (
            <button
              key={String(label)}
              onClick={() => setUpcoming(v as boolean)}
              className={`rounded-full px-4 py-1.5 ${upcoming === v ? "bg-ink text-paper" : "text-muted"}`}
            >
              {label as string}
            </button>
          ))}
        </div>
      </PageHeader>

      {!data ? (
        <Skeleton className="h-80" />
      ) : data.length === 0 ? (
        <Empty title="Nothing on the calendar">When the agent books a qualified lead, the meeting shows up here.</Empty>
      ) : (
        <div className="space-y-10">
          {[...groups.entries()].map(([day, appts], gi) => (
            <motion.section key={day} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.06 }}>
              <h2 className="mb-4 flex items-baseline gap-3">
                <span className="font-display text-3xl">{dayLabel(appts[0]!.start_at)}</span>
                <span className="font-mono text-xs text-muted">{appts.length} meeting{appts.length > 1 ? "s" : ""}</span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence>
                  {appts.map((a) => (
                    <motion.article
                      key={a.id}
                      layout
                      whileHover={{ y: -3 }}
                      className={`relative rounded-2xl border p-5 ${a.status === "cancelled" ? "border-dashed border-line bg-transparent opacity-60" : "border-line bg-card"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-3xl leading-none">{time(a.start_at)}</p>
                          <p className="mt-1 font-mono text-[11px] text-muted">
                            until {time(a.end_at)} · {a.status}
                          </p>
                        </div>
                        {a.status === "confirmed" && (
                          <button
                            onClick={() => cancel(a.id)}
                            disabled={cancelling === a.id}
                            className="grid size-8 place-items-center rounded-full text-faint hover:bg-paper-2 hover:text-ink"
                            title="Cancel meeting"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>
                      <p className="mt-4 text-sm text-ink-3">{a.title}</p>
                      <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
                        <Avatar name={a.lead_name} />
                        <Link to={`/dashboard/leads/${a.lead_id}`} className="min-w-0 flex-1 hover:underline">
                          <p className="truncate text-sm font-medium">{a.lead_name}</p>
                          <p className="truncate text-xs text-muted">{a.lead_company ?? a.lead_email}</p>
                        </Link>
                        {a.meeting_url && a.status === "confirmed" && (
                          <a href={a.meeting_url} target="_blank" rel="noreferrer" className="btn-ghost h-9 px-3 text-xs">
                            <Video className="size-3.5" /> Join
                          </a>
                        )}
                      </div>
                    </motion.article>
                  ))}
                </AnimatePresence>
              </div>
            </motion.section>
          ))}
        </div>
      )}
    </>
  );
}
