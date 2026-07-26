"use client";

import { useEffect, useState } from "react";

/**
 * The operator's admin panel, as Globex sees it in Demo A: auto-logged-in with a
 * pre-arranged token, showing the line owner and their active package plus the
 * live package catalogue — so a change can be made by hand and verified.
 */
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

export default function OperatorAdmin() {
  const [lines, setLines] = useState<Line[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(true);

  async function refresh() {
    try {
      const d = await (await fetch("/api/operator")).json();
      setLines(d.lines ?? []);
      setTariffs(d.tariffs ?? []);
      setOk(!d.error);
    } catch {
      setOk(false);
    }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);

  async function change(line_id: string, target_tariff_id: string) {
    setBusy(true);
    setMsg("");
    const r = await (
      await fetch("/api/operator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ line_id, target_tariff_id }),
      })
    ).json();
    setMsg(r.ok ? `Changed ${line_id}: ${r.from} → ${r.to}` : `Refused: ${r.reason}`);
    setBusy(false);
    await refresh();
  }

  const tariffOf = (id: string) => tariffs.find((t) => t.id === id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-500">
        Signed in to <span className="font-medium">Acme Telecom</span>&apos;s operator panel as{" "}
        <span className="font-medium">Globex (pre-arranged partner)</span> · auto-login · the bespoke
        Demo&nbsp;A path
      </div>

      <h1 className="mt-6 text-lg font-semibold text-slate-700">
        Operator admin panel{" "}
        <span className="font-normal text-slate-400">— change a line by hand, and verify it here</span>
      </h1>

      {!ok && (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          Operator panel unreachable.
        </p>
      )}

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">Line owners</h2>
      <div className="mt-3 space-y-3">
        {lines.map((l) => {
          const cur = tariffOf(l.tariff_id);
          return (
            <div key={l.line_id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm text-slate-700">{l.line_id}</span>
                  <span className="ml-2 text-sm text-slate-500">{l.subscriber}</span>
                </div>
                <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-white">
                  active: {l.tariff_name}
                  {cur ? ` · ${cur.data_gb}GB · ${cur.mins}m · $${cur.price_usd}` : ""}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">Set package:</span>
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
          );
        })}
      </div>
      {msg && <p className="mt-4 text-sm text-slate-600">{msg}</p>}

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Packages{" "}
        <span className="font-normal normal-case text-slate-400">— live from Acme, active plan centred</span>
      </h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-400">
            <tr>
              {["package", "data", "minutes", "price", "tier"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tariffs.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-slate-600">{t.name}</td>
                <td className="px-3 py-2 text-slate-600">{t.data_gb} GB</td>
                <td className="px-3 py-2 text-slate-600">{t.mins} Mins</td>
                <td className="px-3 py-2 text-slate-600">${t.price_usd}</td>
                <td className="px-3 py-2 text-slate-500">{t.tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Reached with a pre-arranged token — the brittle, bespoke path Demo A relies on. Use it to
        verify a line&apos;s active package after a resolve.
      </p>
    </main>
  );
}
