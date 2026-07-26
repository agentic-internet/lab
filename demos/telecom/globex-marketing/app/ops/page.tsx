"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogPanel, streamAgent, type LogEntry } from "../LogPanel";

const ACME = process.env.NEXT_PUBLIC_ACME_URL ?? "http://localhost:3001";

interface Ticket {
  id: string;
  subscriber: string;
  line_id: string;
  operator_name: string;
  request: string;
  status: "open" | "done";
  resolution?: string;
}
interface Escalation {
  id: string;
  ticket_id: string;
  status: "pending" | "approved" | "rejected";
  chosen_tariff_id?: string;
}
type Mode = "agent-to-agent" | "agent-to-human";
type Chat = { role: "user" | "assistant"; text: string };

const A2H_PRESETS = ["What is their current package?", "Escalate this to a manager", "Close the task"];
const A2A_PRESETS = ["Which tariffs are available?", "Escalate to a manager", "Apply the approved upgrade"];

export default function Ops() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [flow, setFlow] = useState<Mode>("agent-to-agent");
  const [selected, setSelected] = useState<string | null>(null);
  const [chat, setChat] = useState<Chat[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);

  async function refresh() {
    setTickets(await (await fetch("/api/tickets")).json());
    try { setEscalations(await (await fetch("/api/escalations")).json()); } catch {}
    try { const f = await (await fetch("/api/flow")).json(); setFlow(f.flow); } catch {}
  }
  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (!running) refresh(); }, 2000);
    return () => clearInterval(t);
  }, [running]);

  const open = tickets.filter((t) => t.status === "open");
  const ticket = tickets.find((t) => t.id === selected) ?? null;
  const esc = escalations.find((e) => e.ticket_id === selected) ?? null;

  function selectTask(id: string) {
    if (running) return;
    setSelected(id);
    setChat([]);
    setLog([]);
  }

  async function send(message: string) {
    if (!message.trim() || running || !selected) return;
    setRunning(true);
    const history = chat;
    setChat((c) => [...c, { role: "user", text: message }]);
    setInput("");
    await streamAgent("/api/ops-chat", { ticketId: selected, message, history }, (e) => {
      if (e.channel === "assistant") setChat((c) => [...c, { role: "assistant", text: e.text }]);
      else if (e.channel !== "user") setLog((l) => [...l, e]);
    });
    setRunning(false);
    await refresh();
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-lg font-semibold text-slate-700">Operations</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
        <span>Resolution flow:</span>
        <span
          className={
            "rounded-md px-2 py-0.5 text-xs font-medium " +
            (flow === "agent-to-human" ? "bg-amber-100 text-amber-800" : "bg-slate-800 text-white")
          }
        >
          {flow === "agent-to-human" ? "Agent → Human (today)" : "Agent → Agent (org to org)"}
        </span>
        <Link href="/control" className="text-xs underline hover:text-slate-600">change in Settings →</Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* left — task list */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Open tasks</h2>
          <div className="mt-3 space-y-2">
            {open.length === 0 && (
              <p className="text-sm text-slate-400">
                None. Raise one from the <Link href="/" className="underline">employee assistant</Link>.
              </p>
            )}
            {open.map((t) => {
              const e = escalations.find((x) => x.ticket_id === t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => selectTask(t.id)}
                  className={
                    "w-full rounded-lg border p-3 text-left transition " +
                    (selected === t.id ? "border-slate-800 bg-slate-50" : "border-slate-200 hover:bg-slate-50")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-500">{t.id}</span>
                    {e && (
                      <span className={"text-xs " + (e.status === "approved" ? "text-emerald-600" : "text-amber-600")}>
                        {e.status}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-700">{t.request}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{t.line_id}</p>
                </button>
              );
            })}
          </div>

          {tickets.some((t) => t.status === "done") && (
            <>
              <h2 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Done</h2>
              <div className="mt-2 space-y-1">
                {tickets.filter((t) => t.status === "done").slice(0, 5).map((t) => (
                  <div key={t.id} className="text-xs text-slate-400">
                    <span className="font-mono">{t.id}</span> · {t.line_id}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* right — detail + interaction */}
        <section className="space-y-4">
          {!ticket && (
            <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
              Select a task to work on it.
            </div>
          )}

          {ticket && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-500">{ticket.id}</span>
                  <span className={"text-xs font-medium " + (ticket.status === "done" ? "text-emerald-600" : "text-amber-600")}>
                    {ticket.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{ticket.request}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {ticket.subscriber} · {ticket.line_id} · {ticket.operator_name}
                </p>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  {flow === "agent-to-human" && esc?.status === "approved" && ticket.status === "open" && (
                    <a
                      href={`${ACME}/admin`}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-3 inline-block rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                    >
                      Manager approved — open Acme Business Portal ↗ to apply the change by hand
                    </a>
                  )}
                  {flow === "agent-to-agent" && esc?.status === "approved" && ticket.status === "open" && (
                    <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
                      Manager approved{esc.chosen_tariff_id ? ` · ${esc.chosen_tariff_id}` : ""} — say
                      &ldquo;apply the upgrade&rdquo; and the agent makes the change (agent-to-agent).
                    </div>
                  )}
                  {flow === "agent-to-agent" && esc?.status === "rejected" && (
                    <div className="mb-3 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                      Manager rejected this request.
                    </div>
                  )}
                  <ChatBox
                    chat={chat}
                    running={running}
                    input={input}
                    setInput={setInput}
                    onSend={send}
                    presets={flow === "agent-to-human" ? A2H_PRESETS : A2A_PRESETS}
                    disabled={ticket.status === "done"}
                  />
                </div>
              </div>

              <LogPanel log={log} title="Activity" />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function ChatBox({
  chat, running, input, setInput, onSend, presets, disabled,
}: {
  chat: Chat[];
  running: boolean;
  input: string;
  setInput: (v: string) => void;
  onSend: (m: string) => void;
  presets: string[];
  disabled: boolean;
}) {
  return (
    <div>
      <div className="min-h-32 space-y-2">
        {chat.length === 0 && (
          <p className="text-sm text-slate-400">
            Operations assistant. It can&apos;t change the line — escalate to a manager, then close the
            task once the change is applied.
          </p>
        )}
        {chat.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span
              className={
                "inline-block max-w-[85%] rounded-2xl px-3 py-1.5 text-sm " +
                (m.role === "user" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700")
              }
            >
              {m.text}
            </span>
          </div>
        ))}
        {running && <div className="text-left text-sm text-slate-400">working…</div>}
      </div>

      {!disabled && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => onSend(p)}
                disabled={running}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                {p}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); onSend(input); }} className="mt-2 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message the operations assistant…"
              disabled={running}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <button disabled={running} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-40">
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
