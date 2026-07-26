"use client";

import { useEffect, useState } from "react";

/**
 * Acme's BUSINESS PORTAL — the self-service panel Acme gives its corporate
 * customers. A customer (here: Globex Marketing) signs in and manages its own
 * employees' lines: see each person's current package, pick a new one, Update.
 * This is the human UI a Globex ops person drives by hand in Demo A.
 */
const CUSTOMER = "Globex Marketing";

interface Line {
  line_id: string;
  subscriber: string;
  holder?: string;
  tariff_id: string;
  tariff_name: string;
}
interface Tariff {
  id: string;
  name: string;
  data_gb: number;
  mins: number;
  price_usd: number;
  tier: number;
}

export default function BusinessPortal() {
  const [lines, setLines] = useState<Line[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function refresh() {
    const d = await (await fetch("/admin/api/lines")).json();
    setLines((d.lines ?? []).filter((l: Line) => l.subscriber === CUSTOMER));
    setTariffs(d.tariffs ?? []);
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);

  async function update(line_id: string) {
    const target = pick[line_id];
    if (!target) return;
    setBusy(line_id);
    setMsg("");
    const res = await fetch("/admin/api/change", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "demo-panel-token" },
      body: JSON.stringify({ line_id, target_tariff_id: target }),
    });
    const r = await res.json();
    setMsg(r.ok ? `${line_id}: ${r.from} → ${r.to} updated.` : `${line_id}: refused — ${r.reason}`);
    setBusy(null);
    setPick((p) => ({ ...p, [line_id]: "" }));
    await refresh();
  }

  const label = (t: Tariff) => `${t.name} · ${t.data_gb}GB · ${t.mins}m · $${t.price_usd}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-500">
        <span className="font-medium text-[var(--acme)]">Acme Telecom · Business Portal</span> — signed
        in as <span className="font-medium">{CUSTOMER}</span> (business customer · demo auto-login)
      </div>

      <h1 className="mt-6 text-lg font-semibold text-slate-700">
        Your lines <span className="font-normal text-slate-400">— manage your employees&apos; packages</span>
      </h1>

      <div className="mt-4 space-y-3">
        {lines.map((l) => (
          <div key={l.line_id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-sm font-medium text-slate-700">{l.holder ?? l.subscriber}</span>
                <span className="ml-2 font-mono text-xs text-slate-400">{l.line_id}</span>
              </div>
              <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-white">
                current: {l.tariff_name}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={pick[l.line_id] ?? ""}
                onChange={(e) => setPick((p) => ({ ...p, [l.line_id]: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              >
                <option value="">Choose a package…</option>
                {tariffs.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.id === l.tariff_id}>
                    {label(t)}{t.id === l.tariff_id ? " (current)" : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={() => update(l.line_id)}
                disabled={!pick[l.line_id] || busy === l.line_id}
                className="rounded-lg bg-[var(--acme)] px-4 py-1.5 text-sm text-white disabled:opacity-40"
              >
                {busy === l.line_id ? "Updating…" : "Update"}
              </button>
            </div>
          </div>
        ))}
        {lines.length === 0 && <p className="text-sm text-slate-400">No lines on this account.</p>}
      </div>

      {msg && <p className="mt-4 text-sm text-slate-600">{msg}</p>}

      <p className="mt-8 text-xs text-slate-400">
        Downgrades are refused by Acme. This is the human portal a Globex ops person uses by hand —
        the bespoke path Demo&nbsp;A illustrates.
      </p>
    </main>
  );
}
