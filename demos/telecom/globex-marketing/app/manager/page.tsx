"use client";

import { useEffect, useState } from "react";

interface Escalation {
  id: string;
  ticket_id: string;
  employee: string;
  summary: string;
  status: "pending" | "approved";
  created: string;
}

export default function Manager() {
  const [items, setItems] = useState<Escalation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setItems(await (await fetch("/api/escalations")).json());
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);

  async function approve(id: string) {
    setBusy(id);
    await fetch("/api/escalations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusy(null);
    await refresh();
  }

  const pending = items.filter((e) => e.status === "pending");
  const approved = items.filter((e) => e.status === "approved");

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-lg font-semibold text-slate-700">
        Manager <span className="font-normal text-slate-400">— confirmations</span>
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        Operations escalates line changes here. Approve before the operator applies them.
      </p>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">Awaiting approval</h2>
      <div className="mt-3 space-y-3">
        {pending.length === 0 && <p className="text-sm text-slate-400">Nothing to approve.</p>}
        {pending.map((e) => (
          <div key={e.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-500">{e.id} · ticket {e.ticket_id}</span>
              <span className="text-xs font-medium text-amber-700">pending</span>
            </div>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-medium">{e.employee}</span> — {e.summary}
            </p>
            <button
              onClick={() => approve(e.id)}
              disabled={busy === e.id}
              className="mt-3 rounded-lg bg-slate-800 px-4 py-1.5 text-xs text-white disabled:opacity-40"
            >
              {busy === e.id ? "Approving…" : "Approve"}
            </button>
          </div>
        ))}
      </div>

      {approved.length > 0 && (
        <>
          <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">Approved</h2>
          <div className="mt-3 space-y-2">
            {approved.map((e) => (
              <div key={e.id} className="text-xs text-slate-500">
                <span className="font-mono">{e.id}</span> · ticket {e.ticket_id} — {e.employee}:{" "}
                {e.summary} <span className="text-emerald-600">✓ approved</span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
