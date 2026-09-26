import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  LayoutDashboard,
  LoaderCircle,
  MessagesSquare,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Logo } from "../../components/ui";
import { api } from "../../lib/api";
import { broadcastRefresh, useData } from "../../lib/hooks";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/leads", label: "Leads", icon: Users },
  { to: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
  { to: "/dashboard/appointments", label: "Appointments", icon: CalendarClock },
  { to: "/dashboard/actions", label: "Agent actions", icon: Activity },
];

function SimulateButton({ onDone }: { onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api.simulate();
          onDone(r.lead ? `${r.lead.name} · score ${r.lead.score} · ${r.lead.status}` : "Lead simulated");
          broadcastRefresh();
        } catch (e) {
          onDone(e instanceof Error ? e.message : "Simulation failed");
        } finally {
          setBusy(false);
        }
      }}
      className="btn-amber h-10 w-full"
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {busy ? "Agent working…" : "Simulate a lead"}
    </button>
  );
}

export default function DashboardLayout() {
  const health = useData(api.health);
  const [toast, setToast] = useState<string | null>(null);
  const location = useLocation();
  const showToast = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 4200);
  };
  const brain = health.data?.agent_brain;

  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col bg-ink p-5 text-paper lg:flex">
        <Link to="/" className="px-2 pt-1">
          <Logo dark />
        </Link>
        <nav className="mt-10 space-y-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="relative block">
              {({ isActive }) => (
                <span
                  className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive ? "text-ink" : "text-faint hover:text-paper"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-xl bg-paper"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <n.icon className="relative size-4" />
                  <span className="relative">{n.label}</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="rounded-2xl border border-line-dark bg-ink-2 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">agent brain</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="size-2 animate-pulse-dot rounded-full bg-amber" />
              <span className="text-sm font-medium">
                {brain === "claude" ? "Claude" : brain === "built-in" ? "Built-in policy" : "…"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-faint">
              {brain === "claude"
                ? health.data?.model
                : "Deterministic offline mode. Set ANTHROPIC_API_KEY to let Claude drive."}
            </p>
          </div>
          <SimulateButton onDone={showToast} />
          <Link to="/" className="flex items-center justify-center gap-1.5 text-xs text-faint hover:text-paper">
            View the website <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <div className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/">
            <Logo />
          </Link>
          <div className="w-40">
            <SimulateButton onDone={showToast} />
          </div>
        </div>
        <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-3 pb-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${isActive ? "bg-ink text-paper" : "text-ink-3"}`
              }
            >
              <n.icon className="size-3.5" /> {n.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="min-w-0 overflow-x-clip">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 lg:py-10"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm text-paper shadow-xl"
          >
            <Sparkles className="mr-2 inline size-4 text-amber" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-display text-[clamp(2.2rem,4vw,3.2rem)] leading-none tracking-tight">{title}</h1>
      </div>
      {children}
    </div>
  );
}
