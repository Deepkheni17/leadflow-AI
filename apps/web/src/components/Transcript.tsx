import type { ConversationDetail } from "../lib/api";
import { timelineFromDetail } from "../lib/chat";
import { ActionRow } from "./ui";

/** Read-only conversation replay: messages interleaved with the agent's tool calls. */
export function Transcript({ detail }: { detail: ConversationDetail }) {
  const items = timelineFromDetail(detail);
  if (!items.length) return <p className="text-sm text-muted">No messages yet.</p>;
  return (
    <div className="space-y-3">
      {items.map((item) => {
        switch (item.kind) {
          case "form":
            return (
              <div key={item.key} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink p-4 text-paper">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">website form</p>
                <p className="mt-1.5 text-sm font-medium">
                  {item.form.name} <span className="text-faint">· {item.form.email}</span>
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-sand">{item.form.message}</p>
              </div>
            );
          case "user":
            return (
              <div key={item.key} className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm leading-relaxed text-paper">
                {item.text}
              </div>
            );
          case "assistant":
            return (
              <div key={item.key} className="mr-auto max-w-[88%] whitespace-pre-line rounded-2xl rounded-bl-md border border-line bg-paper px-4 py-3 text-sm leading-relaxed">
                {item.text}
              </div>
            );
          case "action":
            return (
              <div key={item.key} className="mx-auto max-w-[92%] opacity-90">
                <ActionRow tool={item.tool} input={item.input} output={item.output} status={item.status} duration={item.duration_ms} compact />
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
