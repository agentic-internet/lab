"use client";

import { useEffect, useRef, useState } from "react";

export type Channel = "user" | "agent" | "tool" | "mcp" | "http" | "policy" | "assistant" | "panel" | "boundary";
export interface LogEntry {
  channel: Channel;
  text: string;
  /** Structured request/response payload — shown when the line is clicked. */
  data?: unknown;
}

const CH: Record<Channel, { label: string; cls: string; icon: string }> = {
  user: { label: "you", cls: "text-slate-400", icon: "🧑" },
  assistant: { label: "assistant", cls: "text-slate-300", icon: "💬" },
  agent: { label: "agent", cls: "text-slate-300", icon: "🤖" },
  tool: { label: "tool", cls: "text-sky-300", icon: "🔧" },
  mcp: { label: "mcp", cls: "text-violet-300", icon: "🔌" },
  http: { label: "discovery", cls: "text-emerald-300", icon: "🌐" },
  policy: { label: "policy", cls: "text-rose-300", icon: "🛑" },
  panel: { label: "admin panel", cls: "text-amber-300", icon: "🔑" },
  boundary: { label: "boundary", cls: "text-orange-300 font-semibold", icon: "🚧" },
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
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [log]);

  const selected = sel != null ? log[sel] : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-900 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title ?? "Behind the scenes — everything the agent actually does"}
      </h2>
      <div ref={ref} className="mt-4 h-96 overflow-y-auto font-mono text-xs leading-relaxed">
        {log.length === 0 && (
          <p className="text-slate-600">Real MCP calls, discovery, and agent-to-agent calls appear here. Click a line for its request/response.</p>
        )}
        {log.map((e, i) => {
          const c = CH[e.channel];
          return (
            <button
              key={i}
              onClick={() => setSel(sel === i ? null : i)}
              className={"flex w-full gap-2 rounded py-0.5 text-left hover:bg-slate-800/70 " + (sel === i ? "bg-slate-800" : "")}
            >
              <span className="w-20 shrink-0 text-slate-500">
                {c.icon} {c.label}
              </span>
              <span className={"break-all " + c.cls}>{e.text}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">
              {CH[selected.channel].icon} {CH[selected.channel].label} — detail
            </span>
            <button onClick={() => setSel(null)} className="text-slate-500 hover:text-slate-300">
              close ✕
            </button>
          </div>
          <p className={"mt-2 break-all " + CH[selected.channel].cls}>{selected.text}</p>
          {selected.data != null ? (
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-slate-400">
              {JSON.stringify(selected.data, null, 2)}
            </pre>
          ) : (
            <p className="mt-2 text-slate-600">No structured request/response for this line.</p>
          )}
        </div>
      )}
    </section>
  );
}
