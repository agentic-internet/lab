"use client";

import { useState } from "react";
import { LogPanel, streamAgent, type LogEntry } from "./LogPanel";

const PRESETS = [
  "My mobile internet keeps running out — I need a bigger plan.",
  "Please upgrade my phone package, the data is never enough.",
];

export default function Home() {
  const [chat, setChat] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);

  async function run(message: string) {
    if (!message.trim() || running) return;
    setRunning(true);
    setChat([{ role: "user", text: message }]);
    setLog([]);
    setInput("");
    await streamAgent("/api/intake", { subscriber: "Globex Marketing", message }, (e) => {
      if (e.channel === "assistant") setChat((c) => [...c, { role: "assistant", text: e.text }]);
      else if (e.channel !== "user") setLog((l) => [...l, e]);
    });
    setRunning(false);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-lg font-semibold text-slate-700">Employee assistant</h1>
      <p className="mt-1 text-sm text-slate-400">
        Signed in as a Globex marketer — ask about your mobile plan.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Chat</h2>
          <div className="mt-4 min-h-64 space-y-3">
            {chat.length === 0 && (
              <p className="text-sm text-slate-400">
                You&apos;re signed in as a Globex marketer. Ask the assistant about your mobile plan —
                it logs a ticket for operations (you can&apos;t change the line yourself).
              </p>
            )}
            {chat.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <span
                  className={
                    "inline-block max-w-[85%] rounded-2xl px-4 py-2 text-sm " +
                    (m.role === "user" ? "bg-[var(--globex)] text-white" : "bg-slate-100 text-slate-700")
                  }
                >
                  {m.text}
                </span>
              </div>
            ))}
            {running && <div className="text-left text-sm text-slate-400">assistant is working…</div>}
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

          <form onSubmit={(e) => { e.preventDefault(); run(input); }} className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a request…"
              disabled={running}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--globex)]"
            />
            <button disabled={running} className="rounded-lg bg-[var(--globex)] px-4 py-2 text-sm text-white disabled:opacity-40">
              Send
            </button>
          </form>
        </section>

        <LogPanel log={log} />
      </div>
    </main>
  );
}
