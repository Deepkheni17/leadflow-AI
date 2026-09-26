import { motion } from "motion/react";
import { ArrowLeft, CalendarClock, Mail, Video } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Transcript } from "../../components/Transcript";
import { ActionRow, Avatar, Empty, ScoreRing, Skeleton, StatusPill } from "../../components/ui";
import { api, type ScorePart } from "../../lib/api";
import { authorityLabel, dateTime, money, relTime } from "../../lib/format";
import { useData } from "../../lib/hooks";

const PART_LABEL: Record<string, string> = {
  need: "Need",
  budget: "Budget",
  timeline: "Timeline",
  authority: "Authority",
  company_size: "Team size",
};

export default function LeadDetail() {
  const { id = "" } = useParams();
  const { data, error } = useData(() => api.lead(id), [id], 6000);
  const convId = data?.conversations[0]?.id;
  const conv = useData(() => (convId ? api.conversation(convId) : Promise.resolve(null)), [convId], 6000);

  if (error && !data) return <Empty title="Lead not found">{error}</Empty>;
  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-56" />
      </div>
    );

  const { lead } = data;
  const parts = Object.entries(lead.score_breakdown).filter((e): e is [string, ScorePart] => typeof e[1] === "object");
  const facts = [
    { label: "Budget", value: money(lead.budget_usd) },
    { label: "Timeline", value: lead.timeline ?? "—" },
    { label: "Decision role", value: lead.authority ? authorityLabel[lead.authority] : "—" },
    { label: "Team size", value: lead.company_size ?? "—" },
  ];

  return (
    <>
      <Link to="/dashboard/leads" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All leads
      </Link>

      <section className="card overflow-hidden">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
          <div className="flex items-start gap-4">
            <Avatar name={lead.name} className="size-14 text-base" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-4xl leading-none tracking-tight">{lead.name}</h1>
                <StatusPill status={lead.status} />
              </div>
              <p className="mt-2 text-sm text-muted">
                {lead.company && <span className="text-ink-3">{lead.company} · </span>}
                <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>
                {lead.phone && <> · {lead.phone}</>} · created {relTime(lead.created_at)}
              </p>
              {lead.requirement && (
                <blockquote className="mt-5 max-w-2xl border-l-2 border-amber pl-4 font-display text-xl italic leading-snug text-ink-3">
                  “{lead.requirement}”
                </blockquote>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <ScoreRing score={lead.score} size={128} />
          </div>
        </div>
        <dl className="grid grid-cols-2 border-t border-line md:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="border-line px-6 py-4 [&:not(:last-child)]:border-r max-md:[&:nth-child(2)]:border-r-0 max-md:[&:nth-child(-n+2)]:border-b">
              <dt className="eyebrow">{f.label}</dt>
              <dd className="mt-1 text-lg font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="card p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Conversation</h2>
            {data.conversations.length > 1 && <span className="text-xs text-muted">{data.conversations.length} conversations · showing latest</span>}
          </div>
          {conv.data ? <Transcript detail={conv.data} /> : <Skeleton className="h-64" />}
        </section>

        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="mb-5 text-[15px] font-semibold">Why this score</h2>
            <div className="space-y-4">
              {parts.map(([key, p], i) => (
                <div key={key}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{PART_LABEL[key] ?? key}</span>
                    <span className="font-mono text-xs text-muted">
                      {p.points}/{p.max}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-2">
                    <motion.div
                      className="h-full rounded-full bg-cobalt"
                      initial={{ width: 0 }}
                      animate={{ width: `${(p.points / p.max) * 100}%` }}
                      transition={{ duration: 0.8, delay: i * 0.08 }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">{p.reason}</p>
                </div>
              ))}
            </div>
            {lead.notes && (
              <div className="mt-6 rounded-xl bg-paper-2/70 p-4">
                <p className="eyebrow">Agent notes</p>
                <p className="mt-2 whitespace-pre-line text-sm text-ink-3">{lead.notes}</p>
              </div>
            )}
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 text-[15px] font-semibold">Meetings</h2>
            {data.appointments.length === 0 ? (
              <p className="text-sm text-muted">No meeting booked yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.appointments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <CalendarClock className="size-4 text-amber-deep" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{dateTime(a.start_at)}</p>
                      <p className="truncate text-xs text-muted">
                        {a.title} · {a.status}
                      </p>
                    </div>
                    {a.meeting_url && (
                      <a href={a.meeting_url} target="_blank" rel="noreferrer" className="text-muted hover:text-ink" title="Meeting link">
                        <Video className="size-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 text-[15px] font-semibold">Emails sent</h2>
            {data.emails.length === 0 ? (
              <p className="text-sm text-muted">No emails yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.emails.map((e) => (
                  <li key={e.id}>
                    <details className="group rounded-xl border border-line p-3">
                      <summary className="flex cursor-pointer list-none items-center gap-3">
                        <Mail className="size-4 text-cobalt" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.subject}</span>
                        <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[10px] uppercase text-muted">{e.status}</span>
                      </summary>
                      <pre className="mt-3 whitespace-pre-wrap border-t border-line pt-3 font-sans text-sm leading-relaxed text-ink-3">{e.body}</pre>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 text-[15px] font-semibold">Agent actions · {data.actions.length}</h2>
            <div className="space-y-2">
              {data.actions.slice(0, 12).map((a) => (
                <ActionRow key={a.id} tool={a.tool} input={a.input} output={a.output} status={a.status} duration={a.duration_ms} compact />
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
