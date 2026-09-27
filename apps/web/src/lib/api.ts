// Typed client for the LeadFlow API (JSON + Server-Sent Events).

export type LeadStatus = "new" | "qualifying" | "qualified" | "booked" | "nurture" | "disqualified";

export interface ScorePart {
  points: number;
  max: number;
  reason: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  source: string;
  status: LeadStatus;
  requirement: string | null;
  budget_usd: number | null;
  timeline: string | null;
  timeline_days: number | null;
  authority: string | null;
  company_size: number | null;
  notes: string | null;
  score: number;
  score_breakdown: Record<string, ScorePart | string>;
  created_at: string;
  updated_at: string;
}

/** The compact lead snapshot the agent streams while it works. */
export interface LeadBrief {
  lead_id: string;
  name: string;
  email: string;
  company: string | null;
  status: LeadStatus;
  score: number;
  grade: string | null;
  qualified?: boolean;
  missing_fields: string[];
  budget_usd: number | null;
  timeline: string | null;
  authority: string | null;
  company_size: number | null;
}

export interface AgentAction {
  id: number;
  conversation_id: string | null;
  lead_id: string | null;
  lead_name?: string | null;
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: "success" | "error";
  duration_ms: number;
  created_at: string;
}

export interface Message {
  id: number;
  seq: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_company: string | null;
  lead_score: number | null;
  lead_status: LeadStatus | null;
  channel: string;
  status: string;
  message_count: number;
  last_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail {
  id: string;
  status: string;
  channel: string;
  created_at: string;
  lead: Lead | null;
  messages: Message[];
  actions: AgentAction[];
}

export interface Appointment {
  id: string;
  lead_id: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  meeting_url: string | null;
  created_at: string;
  lead_name: string | null;
  lead_company: string | null;
  lead_email: string | null;
}

export interface Email {
  id: number;
  lead_id: string | null;
  to: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
}

export interface LeadDetail {
  lead: Lead;
  conversations: ConversationSummary[];
  appointments: Appointment[];
  actions: AgentAction[];
  emails: Email[];
}

export interface Dashboard {
  kpis: {
    leads: number;
    leads_this_week: number;
    leads_last_week: number;
    avg_score: number;
    qualified: number;
    conversations: number;
    messages: number;
    appointments: number;
    upcoming_appointments: number;
    agent_actions: number;
    agent_actions_24h: number;
    action_success_rate: number;
    conversion_rate: number;
    qualification_rate: number;
  };
  series: { date: string; leads: number; booked: number; actions: number }[];
  pipeline: { status: LeadStatus; count: number }[];
  score_distribution: { range: string; count: number }[];
  tool_usage: { tool: string; count: number }[];
  hot_leads: Lead[];
  upcoming: Appointment[];
  recent_actions: AgentAction[];
  agent_brain: "claude" | "gemini" | "built-in";
  qualified_score: number;
}

export interface Health {
  status: string;
  agent_brain: "claude" | "gemini" | "built-in";
  model: string | null;
  database: string;
  timezone: string;
  company: string;
}

export interface InboundForm {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message: string;
}

export interface TurnResult {
  conversation_id: string;
  reply: string;
  actions: unknown[];
  lead: LeadBrief | null;
  error: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const api = {
  health: () => request<Health>("/api/health"),
  dashboard: () => request<Dashboard>("/api/dashboard"),
  leads: (params: { status?: string; q?: string; sort?: "recent" | "score" } = {}) =>
    request<Lead[]>(`/api/leads${qs(params)}`),
  lead: (id: string) => request<LeadDetail>(`/api/leads/${id}`),
  conversations: () => request<ConversationSummary[]>("/api/conversations"),
  conversation: (id: string) => request<ConversationDetail>(`/api/conversations/${id}`),
  appointments: (upcoming = false) => request<Appointment[]>(`/api/appointments${qs({ upcoming })}`),
  cancelAppointment: (id: string) => request<Appointment>(`/api/appointments/${id}/cancel`, { method: "POST" }),
  actions: (tool?: string) => request<AgentAction[]>(`/api/actions${qs({ tool, limit: 200 })}`),
  emails: () => request<Email[]>("/api/emails"),
  simulate: () => request<TurnResult>("/api/demo/simulate", { method: "POST" }),
  startConversation: () => request<{ conversation_id: string }>("/api/conversations", { method: "POST" }),
};

export type StreamEvent =
  | { event: "conversation"; data: { conversation_id: string } }
  | { event: "action_start"; data: { id: string; tool: string; input: Record<string, unknown> } }
  | {
      event: "action_end";
      data: {
        id: string;
        tool: string;
        input: Record<string, unknown>;
        output: Record<string, unknown>;
        status: "success" | "error";
        duration_ms: number;
      };
    }
  | { event: "lead"; data: LeadBrief }
  | { event: "message"; data: { role: "assistant"; content: string } }
  | { event: "notice"; data: { message: string } }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: { conversation_id: string; lead: LeadBrief | null } };

/** POST a JSON body and consume the Server-Sent Events response. */
export async function streamEvents(
  path: string,
  body: unknown,
  onEvent: (ev: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      const b = await res.json();
      detail = typeof b.detail === "string" ? b.detail : "Please check the form fields.";
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, "\n");
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (!data.length) continue; // ping / comment
      try {
        onEvent({ event, data: JSON.parse(data.join("\n")) } as StreamEvent);
      } catch {
        /* malformed chunk: ignore */
      }
    }
  }
}
