"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogPanel, streamAgent, type LogEntry } from "../LogPanel";

interface Ticket {
  id: string;
  subscriber: string;
  line_id: string;
  operator_name: string;
  request: string;
  status: "open" | "done";
  resolution?: string;
}

type Mode = "agent-to-agent" | "agent-to-human";

export default function Ops() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("agent-to-agent");

  async function refresh() {
    setTickets(await (await fetch("/api/tickets")).json());
  }
  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (!running) refresh(); }, 2000);
    return () => clearInterval(t);
  }, [running]);

  async function resolve(ticketId: string) {
    if (running) return;
    setRunning(true);
    setActive(ticketId);
    setLog([]);
    await streamAgent("/api/resolve", { ticketId, mode }, (e) => {
      if (e.channel !== "user") setLog((l) => [...l, e]);
    });
    setRunning(false);
    await refresh();
  }

  const open = tickets.filter((t) => t.status === "open");

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-slate-700" />
        <span className="text-xl font-semibold text-slate-700">Globex Marketing</span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-500">Operations</span>
        <Link href="/" className="ml-auto text-sm text-slate-500 underline hover:text-slate-700">
          ← Employee assistant
        </Link>
      </header>

      <div className="mt-6 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Resolution mode
        </span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(["agent-to-human", "agent-to-agent"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={running}
              className={
                "rounded-md px-3 py-1.5 transition " +
                (mode === m ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50")
              }
            >
              {m === "agent-to-human" ? "Agent → Human (today)" : "Agent → Agent (proposed)"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {mode === "agent-to-human"
          ? "Today: no shared way in, so operations works in the operator's own admin panel — a bespoke, brittle path."
          : "Proposed: the assistant discovers the operator and works with its agent — no prior integration."}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Open tasks
          </h2>
          <div className="mt-4 space-y-3">
            {open.length === 0 && (
              <p className="text-sm text-slate-400">
                No open tickets. Submit one from the{" "}
                <Link href="/" className="underline">employee assistant</Link>.
              </p>
            )}
            {open.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-500">{t.id}</span>
                  <span className="text-xs text-slate-400">{t.line_id} · {t.operator_name}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{t.request}</p>
                <button
                  onClick={() => resolve(t.id)}
                  disabled={running}
                  className="mt-3 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white disabled:opacity-40"
                >
                  {running && active === t.id ? "Resolving…" : "Approve & resolve"}
                </button>
              </div>
            ))}
          </div>

          {tickets.some((t) => t.status === "done") && (
            <>
              <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Recently done</h2>
              <div className="mt-3 space-y-2">
                {tickets.filter((t) => t.status === "done").slice(0, 4).map((t) => (
                  <div key={t.id} className="text-xs text-slate-500">
                    <span className="font-mono">{t.id}</span> — {t.resolution}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <LogPanel
          log={log}
          title={mode === "agent-to-human" ? "Resolution — via the operator's admin panel" : "Resolution — agent to agent, live"}
        />
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Flip the toggle and resolve the same ticket both ways — watch the log panel change.
      </p>
    </main>
  );
}
