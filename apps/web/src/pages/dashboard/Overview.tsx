import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, CalendarClock, Video } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ActivityChart, HBars, Legend, ScoreHistogram, SERIES } from "../../components/charts";
import { ActionRow, Avatar, CountUp, Empty, ScoreBar, Skeleton, StatusPill } from "../../components/ui";
import { api } from "../../lib/api";
import { dateTime, money, relTime, statusLabel } from "../../lib/format";
import { useData } from "../../lib/hooks";
import { PageHeader } from "./Layout";

function Panel({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, suffix, decimals, sub, accent }: { label: string; value: number; suffix?: string; decimals?: number; sub: string; accent?: boolean }) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className={`rounded-2xl border p-5 ${accent ? "border-ink bg-ink text-paper" : "border-line bg-card"}`}
    >
      <p className={`font-mono text-[10px] uppercase tracking-[0.16em] ${accent ? "text-faint" : "text-muted"}`}>{label}</p>
      <p className="mt-3 font-display text-[2.8rem] leading-none">
        <CountUp value={value} suffix={suffix} decimals={decimals} />
      </p>
      <p className={`mt-2 text-xs ${accent ? "text-sand" : "text-muted"}`}>{sub}</p>
    </motion.div>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export default function Overview() {
  const { data, error } = useData(api.dashboard, [], 5000);

  if (error && !data) return <Empty title="Can't reach the API">{error} — is the backend running on port 8000?</Empty>;
  if (!data)
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-72" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );

  const k = data.kpis;
  const delta = k.leads_this_week - k.leads_last_week;

  return (
    <>
      <PageHeader eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} title={`${greeting()}.`}>
        <p className="max-w-sm text-sm text-muted">
          The agent has handled <span className="font-medium text-ink">{k.leads} leads</span> and booked{" "}
          <span className="font-medium text-ink">{k.appointments} meetings</span>. Live — refreshes every 5 seconds.
        </p>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Leads" value={k.leads} sub={`${k.leads_this_week} this week (${delta >= 0 ? "+" : ""}${delta})`} />
        <Kpi label="Avg lead score" value={k.avg_score} sub={`${k.qualified} qualified or booked`} />
        <Kpi label="Conversations" value={k.conversations} sub={`${k.messages} messages exchanged`} />
        <Kpi label="Appointments" value={k.appointments} sub={`${k.upcoming_appointments} upcoming`} />
        <Kpi label="Agent actions" value={k.agent_actions} sub={`${k.agent_actions_24h} in 24h · ${k.action_success_rate}% ok`} />
        <Kpi label="Conversion rate" value={k.conversion_rate} decimals={1} suffix="%" sub={`lead → meeting · ${k.qualification_rate}% qualified`} accent />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel
          title="Lead activity · last 14 days"
          action={
            <Legend
              items={[
                { label: "New leads", color: SERIES.leads },
                { label: "Booked", color: SERIES.booked },
              ]}
            />
          }
        >
          <ActivityChart data={data.series} />
        </Panel>

        <Panel title="Live agent activity" action={<span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted"><span className="size-1.5 animate-pulse-dot rounded-full bg-amber" /> live</span>}>
          <div className="scrollbar-thin -mr-2 max-h-[250px] space-y-2 overflow-y-auto pr-2">
            <AnimatePresence initial={false}>
              {data.recent_actions.map((a) => (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, x: -12, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  transition={{ duration: 0.35 }}
                >
                  <Link to={a.lead_id ? `/dashboard/leads/${a.lead_id}` : "/dashboard/actions"} className="block">
                    <ActionRow tool={a.tool} input={a.input} output={a.output} status={a.status} duration={a.duration_ms} compact />
                  </Link>
                  <p className="mb-1 mt-1 pl-1 text-[11px] text-faint">
                    {a.lead_name ?? "unknown lead"} · {relTime(a.created_at)}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Pipeline">
          <HBars data={data.pipeline.map((p) => ({ label: p.status, value: p.count }))} format={(s) => statusLabel[s] ?? s} />
        </Panel>
        <Panel title="Lead score distribution" action={<span className="text-xs text-muted">qualified ≥ {data.qualified_score}</span>}>
          <ScoreHistogram data={data.score_distribution} />
        </Panel>
        <Panel title="Tool usage" className="md:col-span-2 xl:col-span-1">
          <HBars data={data.tool_usage.map((t) => ({ label: t.tool, value: t.count }))} color="#3a382f" format={(s) => `${s}()`} />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Upcoming meetings" action={<Link to="/dashboard/appointments" className="flex items-center gap-1 text-xs text-muted hover:text-ink">All <ArrowUpRight className="size-3.5" /></Link>}>
          {data.upcoming.length === 0 ? (
            <Empty title="No meetings yet">Qualified leads will appear here once the agent books them.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data.upcoming.map((a) => (
                <li key={a.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-paper-2 py-2 text-center">
                    <span className="font-mono text-[10px] uppercase text-muted">
                      {new Date(a.start_at).toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                    <span className="font-display text-2xl leading-none">{new Date(a.start_at).getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link to={`/dashboard/leads/${a.lead_id}`} className="truncate text-sm font-medium hover:underline">
                      {a.lead_name} {a.lead_company && <span className="text-muted">· {a.lead_company}</span>}
                    </Link>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <CalendarClock className="size-3.5" /> {dateTime(a.start_at)}
                    </p>
                  </div>
                  {a.meeting_url && (
                    <a href={a.meeting_url} target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-full border border-line text-ink-3 hover:border-ink" title="Meeting link">
                      <Video className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Hottest leads" action={<Link to="/dashboard/leads" className="flex items-center gap-1 text-xs text-muted hover:text-ink">All leads <ArrowUpRight className="size-3.5" /></Link>}>
          <ul className="divide-y divide-line">
            {data.hot_leads.map((l) => (
              <li key={l.id}>
                <Link to={`/dashboard/leads/${l.id}`} className="flex items-center gap-3 py-3 transition hover:bg-paper-2/40">
                  <Avatar name={l.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="truncate text-xs text-muted">
                      {l.company ?? l.email} · {money(l.budget_usd)}
                    </p>
                  </div>
                  <StatusPill status={l.status} className="hidden sm:inline-flex" />
                  <ScoreBar score={l.score} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
