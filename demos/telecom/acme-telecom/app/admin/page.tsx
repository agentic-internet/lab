"use client";

import { useEffect, useState } from "react";

interface Line {
  line_id: string;
  subscriber: string;
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

export default function Admin() {
  const [lines, setLines] = useState<Line[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function refresh() {
    const d = await (await fetch("/admin/api/lines")).json();
    setLines(d.lines);
    setTariffs(d.tariffs);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function change(line_id: string, target_tariff_id: string) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/admin/api/change", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "demo-panel-token" },
      body: JSON.stringify({ line_id, target_tariff_id }),
    });
    const r = await res.json();
    setMsg(r.ok ? `Changed ${line_id}: ${r.from} → ${r.to}` : `Refused: ${r.reason}`);
    setBusy(false);
    await refresh();
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-500">
        Signed in as <span className="font-medium">ops@acme-telecom</span> (demo auto-login) ·
        Acme Telecom internal admin panel
      </div>

      <h1 className="mt-6 text-lg font-semibold text-[var(--acme)]">Line management</h1>

      <div className="mt-4 space-y-3">
        {lines.map((l) => (
          <div key={l.line_id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-sm">{l.line_id}</span>
                <span className="ml-2 text-sm text-slate-500">{l.subscriber}</span>
              </div>
              <span className="text-sm text-slate-500">Current: {l.tariff_name}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Set tariff:</span>
              {tariffs.map((t) => (
                <button
                  key={t.id}
                  disabled={busy || t.id === l.tariff_id}
                  onClick={() => change(l.line_id, t.id)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  {t.name} · {t.data_gb}GB · {t.mins}m
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {msg && <p className="mt-4 text-sm text-slate-600">{msg}</p>}

      <p className="mt-8 text-xs text-slate-400">
        This is Acme&apos;s private panel. A partner can only reach it by being handed a token and
        told the API exists — a bespoke, prior arrangement.
      </p>
    </main>
  );
}
