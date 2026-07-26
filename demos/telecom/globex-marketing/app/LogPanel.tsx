"use client";

import { useEffect, useRef } from "react";

export type Channel = "user" | "agent" | "tool" | "mcp" | "http" | "policy" | "assistant";
export interface LogEntry {
  channel: Channel;
  text: string;
}

const CH: Record<Channel, { label: string; cls: string; icon: string }> = {
  user: { label: "you", cls: "text-slate-400", icon: "🧑" },
  assistant: { label: "assistant", cls: "text-slate-300", icon: "💬" },
  agent: { label: "agent", cls: "text-slate-300", icon: "🤖" },
  tool: { label: "tool", cls: "text-sky-300", icon: "🔧" },
  mcp: { label: "mcp", cls: "text-violet-300", icon: "🔌" },
  http: { label: "discovery", cls: "text-emerald-300", icon: "🌐" },
  policy: { label: "policy", cls: "text-rose-300", icon: "🛑" },
};

/** Read an NDJSON stream from a POST and push each parsed LogEntry to onEntry. */
export async function streamAgent(
  url: string,
  body: unknown,
  onEntry: (e: LogEntry) => void,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEntry(JSON.parse(line) as LogEntry);
    }
  }
}

export function LogPanel({ log, title }: { log: LogEntry[]; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [log]);

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-900 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title ?? "Behind the scenes — everything the agent actually does"}
      </h2>
      <div ref={ref} className="mt-4 h-96 overflow-y-auto font-mono text-xs leading-relaxed">
        {log.length === 0 && (
          <p className="text-slate-600">Real MCP calls, discovery, and agent-to-agent calls appear here.</p>
        )}
        {log.map((e, i) => {
          const c = CH[e.channel];
          return (
            <div key={i} className="flex gap-2 py-0.5">
              <span className="w-20 shrink-0 text-slate-500">
                {c.icon} {c.label}
              </span>
              <span className={"break-all " + c.cls}>{e.text}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
