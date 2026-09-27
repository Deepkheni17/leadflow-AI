import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  CalendarCheck,
  CheckCircle2,
  Database,
  GitBranch,
  LayoutDashboard,
  Radio,
  ScrollText,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AgentTrace } from "../components/AgentTrace";
import { ChatPanel } from "../components/ChatPanel";
import { CountUp, Logo, Reveal, ScoreRing } from "../components/ui";
import { api } from "../lib/api";
import { useChat } from "../lib/chat";
import { useData } from "../lib/hooks";

const TOOLS = ["search_customer()", "create_lead()", "update_lead()", "check_calendar()", "book_meeting()", "send_email()"];

const STEPS = [
  { title: "Website lead arrives", body: "A form fill or a chat message hits the agent the second it's sent — no inbox, no queue.", tool: "POST /api/inbound" },
  { title: "Understand the requirement", body: "The agent reads what they actually asked for and pulls out budget, timing and scope.", tool: "LangGraph · agent node" },
  { title: "Check the CRM", body: "Existing customer? It finds them first, so nobody gets a duplicate record or a cold intro.", tool: "search_customer()" },
  { title: "Create the lead", body: "New contacts land in the CRM with the conversation linked from the very first message.", tool: "create_lead()" },
  { title: "Qualify & ask follow-ups", body: "Two questions at a time, conversationally — never a form. It never asks for what it already knows.", tool: "update_lead()" },
  { title: "Score the lead", body: "Budget, need, timeline, authority and team size roll up into a 0–100 score you can explain line by line.", tool: "score → 97 / 100" },
  { title: "Check the calendar", body: "Qualified leads get real open slots across the next days, in your business hours and timezone.", tool: "check_calendar()" },
  { title: "Book the meeting", body: "They pick a time — “the second one works” is enough — and the slot is locked instantly.", tool: "book_meeting()" },
  { title: "Send confirmation", body: "A confirmation with the meeting link and agenda goes out while they're still on the page.", tool: "send_email()" },
  { title: "Update the CRM", body: "Status, score, notes and every tool call are written back, so sales walks in fully briefed.", tool: "update_lead()" },
];

function Nav() {
  const chat = useChat();
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 24));
  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 transition-all duration-300 ${
        solid ? "border-b border-line/80 bg-paper/80 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="LeadFlow home">
          <Logo />
        </Link>
        <div className="hidden items-center gap-8 text-sm text-ink-3 md:flex">
          <a href="#workflow" className="hover:text-ink">How it works</a>
          <a href="#scoring" className="hover:text-ink">Scoring</a>
          <a href="#stack" className="hover:text-ink">Under the hood</a>
          <Link to="/dashboard" className="hover:text-ink">Dashboard</Link>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/dashboard" className="btn-ghost hidden h-10 sm:inline-flex">
            <LayoutDashboard className="size-4" /> Dashboard
          </Link>
          <button onClick={chat.openChat} className="btn-ink h-10 px-4 sm:px-5">
            <span className="hidden sm:inline">Talk to the agent</span>
            <span className="sm:hidden">Try the agent</span>
          </button>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const stats = useData(api.dashboard);
  const k = stats.data?.kpis;

  return (
    <section ref={ref} className="grain relative overflow-hidden pt-28 sm:pt-32">
      <div className="grid-lines pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      <div className="pointer-events-none absolute -right-40 top-10 size-[560px] rounded-full bg-amber/25 blur-[120px]" />
      <div className="pointer-events-none absolute -left-40 top-80 size-[420px] rounded-full bg-sky/25 blur-[120px]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-24 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:pb-32">
        <motion.div style={{ y, opacity: fade }} className="min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card/70 py-1.5 pl-2 pr-3.5 text-xs text-ink-3 backdrop-blur"
          >
            <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber">new</span>
            A tool-calling agent, not a chatbot
          </motion.div>

          <h1 className="mt-6 font-display text-[clamp(2.5rem,5.4vw,5.4rem)] leading-[0.92] tracking-[-0.02em] text-ink">
            {["Every lead", "answered, qualified", "& booked —"].map((line, i) => (
              <motion.span
                key={line}
                className="block"
                initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.9, delay: 0.1 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                {line}
              </motion.span>
            ))}
            <motion.em
              className="relative block text-amber-deep"
              initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.9, delay: 0.46, ease: [0.22, 1, 0.36, 1] }}
            >
              in under a minute.
              <motion.svg
                viewBox="0 0 400 20"
                className="absolute -bottom-2 left-0 w-[min(88%,560px)]"
                initial={{ pathLength: 0 }}
                aria-hidden
              >
                <motion.path
                  d="M3 14 C 90 4, 200 4, 397 10"
                  stroke="#F2A541"
                  strokeWidth="5"
                  fill="none"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.1, delay: 1.1, ease: "easeInOut" }}
                />
              </motion.svg>
            </motion.em>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7 }}
            className="mt-8 max-w-xl text-lg leading-relaxed text-ink-3"
          >
            LeadFlow is an AI sales agent that talks to your website leads, checks your CRM, scores them, and books
            qualified ones straight into your calendar — logging every action it takes.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.85 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <a href="#start" className="btn-ink h-12 px-6 text-[15px]">
              Send it a lead <ArrowRight className="size-4" />
            </a>
            <Link to="/dashboard" className="btn-ghost h-12 px-6 text-[15px]">
              Open the dashboard <ArrowUpRight className="size-4" />
            </Link>
          </motion.div>

          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 1.05 }}
            className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6"
          >
            {[
              { label: "leads handled", value: k?.leads ?? 0 },
              { label: "meetings booked", value: k?.appointments ?? 0 },
              { label: "agent actions", value: k?.agent_actions ?? 0 },
            ].map((s) => (
              <div key={s.label}>
                <dt className="eyebrow">{s.label}</dt>
                <dd className="mt-1 font-display text-4xl">
                  <CountUp value={s.value} />
                </dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>

        <motion.div
          className="min-w-0"
          initial={{ opacity: 0, y: 40, rotate: 1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <AgentTrace />
        </motion.div>
      </div>
    </section>
  );
}

function Marquee() {
  const row = [...TOOLS, ...TOOLS, ...TOOLS];
  return (
    <div className="overflow-hidden border-y border-line-dark bg-ink py-5 text-paper">
      <div className="flex w-max animate-marquee gap-12 whitespace-nowrap font-mono text-sm">
        {[...row, ...row].map((t, i) => (
          <span key={i} className="flex items-center gap-12">
            <span className={i % 2 ? "text-sand" : "text-amber"}>{t}</span>
            <span className="text-ink-3">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Workflow() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 60%", "end 70%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) =>
    setActive(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length)))),
  );

  return (
    <section id="workflow" ref={ref} className="relative mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:py-36">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:h-fit">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-4 font-display text-[clamp(2.6rem,5vw,4.4rem)] leading-[0.98] tracking-tight">
            One agent.
            <br />
            Ten steps.
            <br />
            <em className="text-amber-deep">Zero forms to chase.</em>
          </h2>
          <p className="mt-6 max-w-md text-ink-3">
            The workflow is a LangGraph state machine: the agent decides, calls a tool, reads the result, and loops until
            the lead is booked or nurtured.
          </p>
          <div className="mt-10 hidden items-end gap-5 lg:flex">
            <span className="font-display text-[7rem] leading-none tabular-nums text-ink">
              {String(active + 1).padStart(2, "0")}
            </span>
            <div className="pb-4">
              <p className="eyebrow">step</p>
              <motion.p key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-lg font-medium">
                {STEPS[active]!.title}
              </motion.p>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute bottom-6 left-[19px] top-6 w-px bg-line" />
          <motion.div
            className="absolute left-[19px] top-6 w-px origin-top bg-amber-deep"
            style={{ scaleY: progress, bottom: 24 }}
          />
          <ol className="space-y-4">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex gap-5"
              >
                <span
                  className={`relative z-10 grid size-10 shrink-0 place-items-center rounded-full border font-mono text-xs transition-colors duration-500 ${
                    i <= active ? "border-ink bg-ink text-amber" : "border-line bg-paper text-muted"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div
                  className={`flex-1 rounded-2xl border p-5 transition-all duration-500 ${
                    i === active ? "border-ink/25 bg-card shadow-[0_18px_50px_-30px_rgb(22_21_15/.45)]" : "border-line bg-card/50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
                    <code className="rounded-md bg-paper-2 px-2 py-1 font-mono text-[11px] text-ink-3">{s.tool}</code>
                  </div>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

const SAMPLE = [
  { k: "Need", pts: 30, max: 30, why: "AI agent for lead qualification — strong fit" },
  { k: "Budget", pts: 25, max: 25, why: "$25,000 set aside" },
  { k: "Timeline", pts: 20, max: 20, why: "Live within 3 weeks" },
  { k: "Authority", pts: 15, max: 15, why: "COO — makes the call" },
  { k: "Team size", pts: 7, max: 10, why: "40 people" },
];

function Scoring() {
  return (
    <section id="scoring" className="grain relative overflow-hidden bg-ink py-28 text-paper lg:py-36">
      <div className="pointer-events-none absolute -right-32 bottom-0 size-[520px] rounded-full bg-amber/10 blur-[120px]" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <p className="eyebrow !text-faint">Lead scoring</p>
          <h2 className="mt-4 font-display text-[clamp(2.6rem,5vw,4.4rem)] leading-[0.98] tracking-tight">
            Scores you can <em className="text-amber">explain</em>, not a black box.
          </h2>
          <p className="mt-6 max-w-md text-faint">
            Every point comes from a fact the lead actually told the agent. Sales sees exactly why a lead is hot — and
            what's still unknown.
          </p>
          <ul className="mt-8 space-y-3 text-sand">
            {["Hot ≥ 75 · booked straight into the calendar", "Warm 50–74 · follow-up questions first", "Cold < 50 · nurture email with resources"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <CheckCircle2 className="size-4 text-amber" /> {t}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="rounded-3xl border border-line-dark bg-ink-2 p-6 sm:p-8">
            <div className="flex items-center gap-6">
              <ScoreRing score={97} size={132} dark />
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-faint">northwind logistics</p>
                <p className="mt-1 font-display text-3xl">Priya Shah</p>
                <span className="mt-3 inline-flex rounded-full bg-amber px-3 py-1 text-xs font-medium text-ink">Hot · booked</span>
              </div>
            </div>
            <div className="mt-8 space-y-4">
              {SAMPLE.map((row, i) => (
                <div key={row.k}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{row.k}</span>
                    <span className="font-mono text-xs text-faint">
                      {row.pts}/{row.max}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-3">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-amber-deep to-amber"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(row.pts / row.max) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, delay: 0.2 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-faint">{row.why}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const STACK = [
  { icon: GitBranch, title: "LangGraph state machine", body: "agent ⇄ tools loop with an audited executor. Same graph whether Claude, Gemini or the built-in policy is driving.", span: "lg:col-span-2" },
  { icon: BrainCircuit, title: "Claude or Gemini", body: "Add an Anthropic or Gemini key and the LLM drives. No key? A deterministic policy runs the same tools offline." },
  { icon: Radio, title: "Streams live", body: "Server-Sent Events push every tool call and reply to the chat as it happens." },
  { icon: ScrollText, title: "Full audit log", body: "Every action is stored with inputs, outputs, status and latency — reviewable in the dashboard.", span: "lg:col-span-2" },
  { icon: Database, title: "Postgres-ready", body: "SQLite out of the box; point one env var at Postgres for production." },
  { icon: CalendarCheck, title: "Real calendar rules", body: "Business hours, timezone, conflicts and lead time — enforced on every booking." },
];

function Stack() {
  return (
    <section id="stack" className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:py-36">
      <Reveal>
        <p className="eyebrow">Under the hood</p>
        <h2 className="mt-4 max-w-3xl font-display text-[clamp(2.4rem,4.6vw,4rem)] leading-[1] tracking-tight">
          Built like production software, <em className="text-amber-deep">because it is.</em>
        </h2>
      </Reveal>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STACK.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.06} className={s.span ?? ""}>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="group h-full rounded-3xl border border-line bg-card p-6 transition-colors hover:border-ink/30"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-paper-2 text-ink transition-colors group-hover:bg-ink group-hover:text-amber">
                <s.icon className="size-5" />
              </span>
              <h3 className="mt-6 text-lg font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Start() {
  const chat = useChat();
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    chat.submitForm({ ...form, company: form.company || undefined });
  };
  const example = () =>
    setForm({
      name: "Jordan Blake",
      email: `jordan.${Math.random().toString(36).slice(2, 6)}@lumaclinics.com`,
      company: "Luma Clinics",
      message: "We want an AI assistant that qualifies patient inquiries and books consultations automatically. Budget around $20k.",
    });

  return (
    <section id="start" className="relative overflow-hidden border-t border-line bg-paper-2/60 py-28 lg:py-36">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <p className="eyebrow">Try it live</p>
          <h2 className="mt-4 font-display text-[clamp(2.6rem,5vw,4.4rem)] leading-[0.98] tracking-tight">
            Be the lead. <em className="text-amber-deep">Watch it work.</em>
          </h2>
          <p className="mt-6 max-w-md text-ink-3">
            Submit the form as if you were a prospect. The agent will reply in the chat, call its tools in front of you,
            and — if you qualify — offer you real calendar slots.
          </p>
          <ol className="mt-10 space-y-5">
            {[
              ["Instant reply", "It answers in seconds and asks only what's missing."],
              ["Live tool calls", "Watch search_customer, update_lead and friends run."],
              ["See it in the dashboard", "Your lead, score and meeting appear in the CRM view."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-4">
                <span className="font-display text-3xl leading-none text-amber-deep">{i + 1}</span>
                <div>
                  <p className="font-medium">{t}</p>
                  <p className="text-sm text-muted">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={0.1}>
          <form onSubmit={submit} className="rounded-3xl border border-line bg-card p-6 shadow-[0_30px_80px_-50px_rgb(22_21_15/.5)] sm:p-8">
            <div className="flex items-center justify-between">
              <p className="font-display text-2xl">Tell us about your project</p>
              <button type="button" onClick={example} className="font-mono text-[11px] uppercase tracking-wider text-cobalt hover:underline">
                fill example
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="text-ink-3">Full name</span>
                <input required className="input" value={form.name} onChange={set("name")} placeholder="Jordan Blake" autoComplete="name" />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="text-ink-3">Work email</span>
                <input required type="email" className="input" value={form.email} onChange={set("email")} placeholder="jordan@company.com" autoComplete="email" />
              </label>
              <label className="grid gap-1.5 text-sm sm:col-span-2">
                <span className="text-ink-3">
                  Company <span className="text-faint">(optional)</span>
                </span>
                <input className="input" value={form.company} onChange={set("company")} placeholder="Company name" autoComplete="organization" />
              </label>
              <label className="grid gap-1.5 text-sm sm:col-span-2">
                <span className="text-ink-3">What would you like to automate?</span>
                <textarea
                  required
                  minLength={3}
                  rows={4}
                  className="input h-auto resize-none py-3 leading-relaxed"
                  value={form.message}
                  onChange={set("message")}
                  placeholder="e.g. An AI agent that qualifies inbound leads and books demos. Budget around $15k."
                />
              </label>
            </div>
            <button type="submit" disabled={chat.running} className="btn-ink mt-6 h-12 w-full text-[15px]">
              {chat.running ? "Agent is working…" : "Send to the agent"} <ArrowRight className="size-4" />
            </button>
            <p className="mt-3 text-center text-xs text-faint">Demo environment · emails are simulated unless SMTP is configured</p>
          </form>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-4 py-14 sm:px-6 md:flex-row md:items-end">
        <div>
          <Logo dark />
          <p className="mt-4 max-w-sm text-sm text-faint">
            AI agent development · lead generation automation · CRM integration · appointment booking.
          </p>
        </div>
        <p className="font-display text-[clamp(2.4rem,6vw,5rem)] leading-none text-ink-3">
          never miss a <em className="text-amber">lead.</em>
        </p>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Workflow />
        <Scoring />
        <Stack />
        <Start />
      </main>
      <Footer />
      <ChatPanel />
    </>
  );
}
