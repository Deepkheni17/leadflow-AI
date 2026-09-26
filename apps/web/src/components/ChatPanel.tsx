import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, MessageCircle, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChat, type ChatItem } from "../lib/chat";
import { ActionRow, ScoreRing, StatusPill } from "./ui";

/** Numbered options ("1. Monday…") in an agent reply become quick-reply buttons. */
function splitOptions(text: string) {
  const lines = text.split("\n");
  const options = lines
    .map((l) => l.match(/^(\d)\.\s+(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ n: m[1]!, label: m[2]! }));
  const body = options.length >= 2 ? lines.filter((l) => !/^\d\.\s+/.test(l)).join("\n") : text;
  return { body: body.replace(/\n{3,}/g, "\n\n").trim(), options: options.length >= 2 ? options : [] };
}

function Bubble({ item, isLast, onPick }: { item: ChatItem; isLast: boolean; onPick: (t: string) => void }) {
  if (item.kind === "form")
    return (
      <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-ink p-4 text-paper">
        <p className="eyebrow !text-faint">Website form submitted</p>
        <p className="mt-2 text-sm font-medium">
          {item.form.name}
          {item.form.company && <span className="text-faint"> · {item.form.company}</span>}
        </p>
        <p className="text-xs text-faint">{item.form.email}</p>
        <p className="mt-2 text-sm leading-relaxed text-sand">{item.form.message}</p>
      </div>
    );
  if (item.kind === "user")
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-paper">
        {item.text}
      </div>
    );
  if (item.kind === "action")
    return (
      <div className="mr-6">
        <ActionRow tool={item.tool} input={item.input} output={item.output} status={item.status} duration={item.duration_ms} compact />
      </div>
    );
  if (item.kind === "notice") return <p className="text-center font-mono text-[11px] text-muted">{item.text}</p>;

  const { body, options } = splitOptions(item.text);
  return (
    <div className="mr-auto max-w-[90%]">
      <div className="whitespace-pre-line rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3 text-[15px] leading-relaxed text-ink">
        {body}
      </div>
      {options.length > 0 && (
        <div className="mt-2 grid gap-1.5">
          {options.map((o) => (
            <button
              key={o.n}
              disabled={!isLast}
              onClick={() => onPick(o.n)}
              className="group flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2 text-left text-sm transition hover:border-cobalt hover:bg-cobalt-soft/50 disabled:opacity-60"
            >
              <span className="grid size-6 place-items-center rounded-md bg-paper-2 font-mono text-xs group-hover:bg-cobalt group-hover:text-white">
                {o.n}
              </span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Typing() {
  return (
    <div className="mr-auto flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-muted"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export function ChatPanel() {
  const chat = useChat();
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const lastAssistant = [...chat.items].reverse().find((i) => i.kind === "assistant");

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.items, chat.running]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && chat.closeChat();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chat]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || chat.running) return;
    chat.send(text);
    setText("");
  };

  return (
    <>
      <AnimatePresence>
        {!chat.open && (
          <motion.button
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            whileHover={{ y: -2 }}
            onClick={chat.openChat}
            className="fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2.5 rounded-full bg-ink pl-4 pr-5 text-sm font-medium text-paper shadow-[0_12px_40px_-12px_rgb(22_21_15/.55)]"
          >
            <span className="relative grid size-7 place-items-center rounded-full bg-amber text-ink">
              <MessageCircle className="size-4" />
              <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse-dot rounded-full border-2 border-ink bg-amber" />
            </span>
            Talk to the agent
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chat.open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px] md:bg-ink/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={chat.closeChat}
            />
            <motion.aside
              role="dialog"
              aria-label="Chat with the LeadFlow agent"
              className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-paper shadow-2xl md:inset-y-3 md:right-3 md:w-[440px] md:rounded-3xl md:border md:border-line"
              initial={{ x: "105%" }}
              animate={{ x: 0 }}
              exit={{ x: "105%" }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
            >
              <header className="flex items-center gap-3 border-b border-line px-5 py-4">
                <div className="relative grid size-10 place-items-center rounded-full bg-ink">
                  <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
                    <path d="M7.5 20.5c4.2 0 5-8.5 9.2-8.5 3.9 0 4 5.2 7.3 5.2" stroke="#F2A541" strokeWidth="3" fill="none" strokeLinecap="round" />
                  </svg>
                  <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-paper bg-amber" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-tight">LeadFlow agent</p>
                  <p className="text-xs text-muted">{chat.running ? "Working…" : "Replies instantly · books meetings"}</p>
                </div>
                {chat.items.length > 0 && (
                  <button onClick={chat.reset} className="grid size-9 place-items-center rounded-full text-muted hover:bg-paper-2" title="New conversation">
                    <RotateCcw className="size-4" />
                  </button>
                )}
                <button onClick={chat.closeChat} className="grid size-9 place-items-center rounded-full text-muted hover:bg-paper-2" aria-label="Close chat">
                  <X className="size-5" />
                </button>
              </header>

              <AnimatePresence>
                {chat.lead && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="overflow-hidden border-b border-line bg-card"
                  >
                    <div className="flex items-center gap-4 px-5 py-3">
                      <ScoreRing score={chat.lead.score} size={48} stroke={5} label={false} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {chat.lead.name}
                          {chat.lead.company && <span className="text-muted"> · {chat.lead.company}</span>}
                        </p>
                        <p className="font-mono text-[11px] text-muted">
                          lead score {chat.lead.score}/100
                          {chat.lead.missing_fields?.length ? ` · ${chat.lead.missing_fields.length} to learn` : ""}
                        </p>
                      </div>
                      <StatusPill status={chat.lead.status} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={scroller} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-5 py-5">
                {chat.items.length === 0 && (
                  <div className="pt-8 text-center">
                    <p className="font-display text-3xl leading-tight">
                      Hi — I'm the <em className="text-amber-deep">LeadFlow</em> agent.
                    </p>
                    <p className="mx-auto mt-3 max-w-xs text-sm text-muted">
                      Tell me what you'd like to automate. I'll ask a couple of questions and get you on the calendar.
                    </p>
                    <div className="mt-6 grid gap-2">
                      {[
                        "Hi, I'm Alex (alex@acme.io). We need an AI agent to qualify our inbound leads.",
                        "Can you book me a demo? I'm sam@brightco.com",
                      ].map((s) => (
                        <button
                          key={s}
                          onClick={() => chat.send(s)}
                          className="rounded-xl border border-line bg-card px-3 py-2.5 text-left text-sm text-ink-3 transition hover:border-ink/40"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {chat.items.map((item) => (
                    <motion.div
                      key={item.key}
                      layout="position"
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <Bubble item={item} isLast={item === lastAssistant && !chat.running} onPick={(t) => chat.send(t)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
                {chat.running && <Typing />}
                {chat.error && (
                  <p className="rounded-xl bg-amber-soft px-3 py-2 text-sm text-ink-3">
                    {chat.error}
                  </p>
                )}
              </div>

              <form onSubmit={submit} className="border-t border-line p-3">
                <div className="flex items-end gap-2 rounded-2xl border border-line bg-card p-1.5 pl-4 focus-within:border-ink/40">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) submit(e);
                    }}
                    rows={1}
                    placeholder={chat.running ? "Agent is working…" : "Type a reply…"}
                    className="max-h-32 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-faint"
                  />
                  <button
                    type="submit"
                    disabled={!text.trim() || chat.running}
                    className="grid size-10 place-items-center rounded-xl bg-ink text-paper transition disabled:bg-line disabled:text-muted"
                    aria-label="Send"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                </div>
                <p className="mt-2 text-center font-mono text-[10px] text-faint">
                  Every tool call is logged to the dashboard
                </p>
              </form>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
