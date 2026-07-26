"use client";

import { useRef, useState } from "react";

type Channel = "user" | "agent" | "tool" | "mcp" | "http" | "policy" | "assistant";
interface LogEntry {
  channel: Channel;
  text: string;
}

const CHANNEL: Record<Channel, { label: string; cls: string; icon: string }> = {
  user: { label: "you", cls: "text-slate-500", icon: "🧑" },
  assistant: { label: "assistant", cls: "text-slate-500", icon: "💬" },
  tool: { label: "tool", cls: "text-sky-700", icon: "🔧" },
  mcp: { label: "mcp", cls: "text-violet-700", icon: "🔌" },
  http: { label: "discovery", cls: "text-emerald-700", icon: "🌐" },
  policy: { label: "policy", cls: "text-rose-700", icon: "🛑" },
  agent: { label: "agent", cls: "text-slate-600", icon: "🤖" },
};

const PRESETS = [
  "My mobile internet keeps running out — I need a bigger plan.",
  "Please upgrade my phone package, the data is never enough.",
];

export default function Home() {
  const [chat, setChat] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  async function run(message: string) {
    if (!message.trim() || running) return;
    setRunning(true);
    setChat([{ role: "user", text: message }]);
    setLog([]);
    setInput("");

    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscriber: "Globex Marketing", message }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const e = JSON.parse(line) as LogEntry;
        if (e.channel === "assistant") {
          setChat((c) => [...c, { role: "assistant", text: e.text }]);
        } else if (e.channel !== "user") {
          setLog((l) => [...l, e]);
          requestAnimationFrame(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight));
        }
      }
    }
    setRunning(false);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-[var(--globex)]" />
        <span className="text-xl font-semibold text-[var(--globex)]">Globex Marketing</span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-500">Internal Assistant</span>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* chat */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Chat
          </h2>
          <div className="mt-4 min-h-64 space-y-3">
            {chat.length === 0 && (
              <p className="text-sm text-slate-400">
                You&apos;re signed in as a Globex marketer. Ask the assistant to fix your mobile plan.
              </p>
            )}
            {chat.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "text-right" : "text-left"}
              >
                <span
                  className={
                    "inline-block max-w-[85%] rounded-2xl px-4 py-2 text-sm " +
                    (m.role === "user"
                      ? "bg-[var(--globex)] text-white"
                      : "bg-slate-100 text-slate-700")
                  }
                >
                  {m.text}
                </span>
              </div>
            ))}
            {running && chat[chat.length - 1]?.role === "user" && (
              <div className="text-left text-sm text-slate-400">assistant is working…</div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => run(p)}
                disabled={running}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                {p.length > 34 ? p.slice(0, 34) + "…" : p}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(input);
            }}
            className="mt-3 flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a request…"
              disabled={running}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--globex)]"
            />
            <button
              disabled={running}
              className="rounded-lg bg-[var(--globex)] px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </section>

        {/* log panel */}
        <section className="rounded-xl border border-slate-200 bg-slate-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Behind the scenes — everything the agent actually does
          </h2>
          <div
            ref={logRef}
            className="mt-4 h-96 overflow-y-auto font-mono text-xs leading-relaxed"
          >
            {log.length === 0 && (
              <p className="text-slate-600">
                Real MCP calls, real discovery, real agent-to-agent calls will appear here.
              </p>
            )}
            {log.map((e, i) => {
              const c = CHANNEL[e.channel];
              return (
                <div key={i} className="flex gap-2 py-0.5">
                  <span className="w-20 shrink-0 text-slate-500">
                    {c.icon} {c.label}
                  </span>
                  <span className={"break-all " + c.cls.replace("700", "300")}>{e.text}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        The assistant found the operator with no prior integration — it read what Acme published at{" "}
        <span className="font-mono">/.well-known/agent</span> and worked from there.
      </p>
    </main>
  );
}
