"use client";

import { useEffect, useState } from "react";

interface TariffOption {
  id: string;
  name: string;
  data_gb: number;
  mins: number;
  price_usd: number;
}
interface Escalation {
  id: string;
  ticket_id: string;
  employee: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
  options?: TariffOption[];
  chosen_tariff_id?: string;
  created: string;
}

export default function Manager() {
  const [items, setItems] = useState<Escalation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});

  async function refresh() {
    setItems(await (await fetch("/api/escalations")).json());
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);

  async function decide(id: string, decision: "approve" | "reject", chosen?: string) {
    setBusy(id);
    await fetch("/api/escalations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, decision, chosen_tariff_id: chosen }),
    });
    setBusy(null);
    await refresh();
  }

  const pending = items.filter((e) => e.status === "pending");
  const decided = items.filter((e) => e.status !== "pending");

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-lg font-semibold text-slate-700">
        Manager <span className="font-normal text-slate-400">— confirmations</span>
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        Operations escalates line changes here. Approve (choosing a package when options are offered)
        or reject, before anything changes.
      </p>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">Awaiting decision</h2>
      <div className="mt-3 space-y-3">
        {pending.length === 0 && <p className="text-sm text-slate-400">Nothing to decide.</p>}
        {pending.map((e) => {
          const hasOptions = (e.options?.length ?? 0) > 0;
          const chosen = pick[e.id] ?? (hasOptions ? e.options![e.options!.length - 1].id : "");
          return (
            <div key={e.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-500">{e.id} · ticket {e.ticket_id}</span>
                <span className="text-xs font-medium text-amber-700">pending</span>
              </div>
              <p className="mt-1 text-sm text-slate-700">
                <span className="font-medium">{e.employee}</span> — {e.summary}
              </p>

              {hasOptions && (
                <div className="mt-3">
                  <label className="text-xs text-slate-500">Choose a package to approve:</label>
                  <div className="mt-1 space-y-1">
                    {e.options!.map((o) => (
                      <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name={`opt-${e.id}`}
                          checked={chosen === o.id}
                          onChange={() => setPick((p) => ({ ...p, [e.id]: o.id }))}
                        />
                        <span className="font-mono">{o.name}</span>
                        <span className="text-slate-500">{o.data_gb}GB · {o.mins} min · ${o.price_usd}/mo</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => decide(e.id, "approve", hasOptions ? chosen : undefined)}
                  disabled={busy === e.id}
                  className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs text-white disabled:opacity-40"
                >
                  {busy === e.id ? "…" : hasOptions ? "Approve selected" : "Approve"}
                </button>
                <button
                  onClick={() => decide(e.id, "reject")}
                  disabled={busy === e.id}
                  className="rounded-lg border border-slate-300 px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {decided.length > 0 && (
        <>
          <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">Decided</h2>
          <div className="mt-3 space-y-2">
            {decided.map((e) => (
              <div key={e.id} className="text-xs text-slate-500">
                <span className="font-mono">{e.id}</span> · ticket {e.ticket_id} — {e.employee}
                {e.status === "approved" ? (
                  <span className="text-emerald-600"> ✓ approved{e.chosen_tariff_id ? ` · ${e.chosen_tariff_id}` : ""}</span>
                ) : (
                  <span className="text-rose-600"> ✕ rejected</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
