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

export default function AcmeDb() {
  const [lines, setLines] = useState<Line[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);

  async function refresh() {
    const d = await (await fetch("/admin/api/lines")).json();
    setLines(d.lines);
    setTariffs(d.tariffs);
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-lg font-semibold text-[var(--acme)]">Acme Telecom — data (read only)</h1>
      <p className="mt-1 text-xs text-slate-400">Live view of the operator&apos;s store. Refreshes automatically.</p>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">lines</h2>
      <Table
        head={["line_id", "subscriber", "tariff_id", "tariff"]}
        rows={lines.map((l) => [l.line_id, l.subscriber, l.tariff_id, l.tariff_name])}
      />

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">
        tariffs <span className="font-normal normal-case text-slate-400">— the visible window (active plan always in the middle)</span>
      </h2>
      <Table
        head={["name", "data", "minutes", "price", "tier"]}
        rows={tariffs.map((t) => [t.name, `${t.data_gb} GB`, `${t.mins} Mins`, `$${t.price_usd}`, String(t.tier)])}
      />
    </main>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-400">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              {r.map((c, j) => <td key={j} className="px-3 py-2 font-mono text-slate-600">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
