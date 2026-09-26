import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, streamEvents, type ConversationDetail, type InboundForm, type LeadBrief, type StreamEvent } from "./api";

export type ChatItem =
  | { kind: "user"; key: string; text: string }
  | { kind: "form"; key: string; form: Record<string, string> }
  | { kind: "assistant"; key: string; text: string }
  | {
      kind: "action";
      key: string;
      tool: string;
      input: Record<string, unknown>;
      output?: Record<string, unknown>;
      status: "running" | "success" | "error";
      duration_ms?: number;
    }
  | { kind: "notice"; key: string; text: string };

interface ChatState {
  open: boolean;
  running: boolean;
  conversationId: string | null;
  items: ChatItem[];
  lead: LeadBrief | null;
  error: string | null;
  openChat: () => void;
  closeChat: () => void;
  submitForm: (form: InboundForm) => Promise<void>;
  send: (text: string) => Promise<void>;
  reset: () => void;
}

const ChatContext = createContext<ChatState | null>(null);
const STORAGE_KEY = "leadflow.conversation";
const FORM_PREFIX = "[Website form submission]";

let keySeq = 0;
const k = () => `i${++keySeq}`;

export function parseForm(text: string): Record<string, string> | null {
  if (!text.startsWith(FORM_PREFIX)) return null;
  const out: Record<string, string> = {};
  let current = "";
  for (const line of text.split("\n").slice(1)) {
    const m = line.match(/^(Name|Email|Company|Phone|Message):\s?(.*)$/);
    if (m) {
      current = m[1]!.toLowerCase();
      out[current] = m[2]!;
    } else if (current === "message") out.message += `\n${line}`;
  }
  return out;
}

/** Rebuild the chat timeline (messages + tool calls, in time order) from the API. */
export function timelineFromDetail(detail: ConversationDetail): ChatItem[] {
  const rows: { t: number; order: number; item: ChatItem }[] = [];
  detail.messages.forEach((m, i) => {
    const form = m.role === "user" ? parseForm(m.content) : null;
    const item: ChatItem = form
      ? { kind: "form", key: `m${m.id}`, form }
      : { kind: m.role, key: `m${m.id}`, text: m.content };
    // Assistant replies come after the tool calls of the same turn.
    rows.push({ t: new Date(m.created_at).getTime() + (m.role === "assistant" ? 5 : 0), order: i, item });
  });
  detail.actions.forEach((a, i) =>
    rows.push({
      t: new Date(a.created_at).getTime(),
      order: 1000 + i,
      item: {
        kind: "action",
        key: `a${a.id}`,
        tool: a.tool,
        input: a.input,
        output: a.output,
        status: a.status,
        duration_ms: a.duration_ms,
      },
    }),
  );
  return rows.sort((a, b) => a.t - b.t || a.order - b.order).map((r) => r.item);
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [lead, setLead] = useState<LeadBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);

  const setId = (id: string | null) => {
    idRef.current = id;
    setConversationId(id);
    writeStored(id);
  };

  // Resume a previous conversation for returning visitors.
  useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    api
      .conversation(stored)
      .then((detail) => {
        idRef.current = stored;
        setConversationId(stored);
        setItems(timelineFromDetail(detail));
        if (detail.lead)
          setLead({
            lead_id: detail.lead.id,
            name: detail.lead.name,
            email: detail.lead.email,
            company: detail.lead.company,
            status: detail.lead.status,
            score: detail.lead.score,
            grade: null,
            missing_fields: [],
            budget_usd: detail.lead.budget_usd,
            timeline: detail.lead.timeline,
            authority: detail.lead.authority,
            company_size: detail.lead.company_size,
          });
      })
      .catch(() => writeStored(null));
  }, []);

  const onEvent = useCallback((ev: StreamEvent) => {
    switch (ev.event) {
      case "conversation":
        setId(ev.data.conversation_id);
        break;
      case "action_start":
        setItems((xs) => [
          ...xs,
          { kind: "action", key: ev.data.id, tool: ev.data.tool, input: ev.data.input, status: "running" },
        ]);
        break;
      case "action_end":
        setItems((xs) =>
          xs.map((x) =>
            x.kind === "action" && x.key === ev.data.id
              ? { ...x, output: ev.data.output, status: ev.data.status, duration_ms: ev.data.duration_ms }
              : x,
          ),
        );
        break;
      case "lead":
        setLead(ev.data);
        break;
      case "message":
        setItems((xs) => [...xs, { kind: "assistant", key: k(), text: ev.data.content }]);
        break;
      case "notice":
        setItems((xs) => [...xs, { kind: "notice", key: k(), text: ev.data.message }]);
        break;
      case "error":
        setError(ev.data.message);
        break;
      case "done":
        if (ev.data.lead) setLead(ev.data.lead);
        break;
    }
  }, []);

  const run = useCallback(
    async (path: string, body: unknown) => {
      setRunning(true);
      setError(null);
      try {
        await streamEvents(path, body, onEvent);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setRunning(false);
        window.dispatchEvent(new Event("leadflow:refresh"));
      }
    },
    [onEvent],
  );

  const submitForm = useCallback(
    async (form: InboundForm) => {
      setId(null);
      setLead(null);
      setOpen(true);
      const shown: Record<string, string> = { name: form.name, email: form.email, message: form.message };
      if (form.company) shown.company = form.company;
      setItems([{ kind: "form", key: k(), form: shown }]);
      await run("/api/inbound/stream", form);
    },
    [run],
  );

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content) return;
      setItems((xs) => [...xs, { kind: "user", key: k(), text: content }]);
      let id = idRef.current;
      if (!id) {
        try {
          id = (await api.startConversation()).conversation_id;
          setId(id);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not start chat");
          return;
        }
      }
      await run(`/api/conversations/${id}/messages/stream`, { content });
    },
    [run],
  );

  const reset = useCallback(() => {
    setId(null);
    setItems([]);
    setLead(null);
    setError(null);
  }, []);

  const value = useMemo<ChatState>(
    () => ({
      open,
      running,
      conversationId,
      items,
      lead,
      error,
      openChat: () => setOpen(true),
      closeChat: () => setOpen(false),
      submitForm,
      send,
      reset,
    }),
    [open, running, conversationId, items, lead, error, submitForm, send, reset],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
