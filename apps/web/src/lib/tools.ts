import {
  CalendarCheck,
  CalendarSearch,
  Mail,
  PenLine,
  Search,
  UserPlus,
  Wrench,
  type LucideIcon,
} from "lucide-react";

interface ToolMeta {
  label: string;
  verb: string;
  icon: LucideIcon;
}

export const TOOLS: Record<string, ToolMeta> = {
  search_customer: { label: "search_customer", verb: "Searched CRM", icon: Search },
  create_lead: { label: "create_lead", verb: "Created lead", icon: UserPlus },
  update_lead: { label: "update_lead", verb: "Updated lead", icon: PenLine },
  check_calendar: { label: "check_calendar", verb: "Checked calendar", icon: CalendarSearch },
  book_meeting: { label: "book_meeting", verb: "Booked meeting", icon: CalendarCheck },
  send_email: { label: "send_email", verb: "Sent email", icon: Mail },
};

export const toolMeta = (tool: string): ToolMeta =>
  TOOLS[tool] ?? { label: tool, verb: tool, icon: Wrench };

type Json = Record<string, unknown>;

/** A one-line, human summary of what a tool call did. */
export function summarize(tool: string, input: Json, output?: Json | null): string {
  const o = (output ?? {}) as Json;
  if (o.error) return String(o.error);
  switch (tool) {
    case "search_customer":
      return output
        ? `${String(input.query ?? "")} → ${o.found ? `${o.count} match${o.count === 1 ? "" : "es"}` : "no match"}`
        : String(input.query ?? "");
    case "create_lead":
      return `${String(input.name ?? "")}${input.company ? ` · ${String(input.company)}` : ""}`;
    case "update_lead": {
      const fields = Object.keys(input).filter((k) => k !== "lead_id");
      const what = fields.length ? fields.map((f) => f.replace(/_/g, " ")).join(", ") : "recalculated";
      return output && typeof o.score === "number" ? `${what} → score ${o.score}` : what;
    }
    case "check_calendar": {
      const slots = (o.slots as unknown[] | undefined)?.length;
      return slots != null ? `${slots} open slot${slots === 1 ? "" : "s"}` : "looking for open slots";
    }
    case "book_meeting":
      return (o.label as string) ?? String(input.start_time ?? "");
    case "send_email":
      return String(input.subject ?? "");
    default:
      return "";
  }
}
