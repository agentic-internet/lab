"use client";

import { useEffect, useState } from "react";

interface Ticket {
  id: string;
  subscriber: string;
  line_id: string;
  operator_name: string;
  request: string;
  status: "open" | "done";
  created: string;
  resolution?: string;
}

export default function GlobexDb() {
  const [tickets, setTickets] = useState<Ticket[]>([]);

  async function refresh() {
    setTickets(await (await fetch("/api/tickets")).json());
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-lg font-semibold text-slate-700">
        Data <span className="font-normal text-slate-400">— ticket store (read only)</span>
      </h1>
      <p className="mt-1 text-xs text-slate-400">Live view of the ticket store. Refreshes automatically.</p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-400">
            <tr>
              {["id", "line", "operator", "request", "status", "resolution"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 font-mono text-slate-600">{t.id}</td>
                <td className="px-3 py-2 font-mono text-slate-600">{t.line_id}</td>
                <td className="px-3 py-2 text-slate-600">{t.operator_name}</td>
                <td className="px-3 py-2 text-slate-600">{t.request}</td>
                <td className="px-3 py-2">
                  <span className={t.status === "done" ? "text-emerald-600" : "text-amber-600"}>{t.status}</span>
                </td>
                <td className="px-3 py-2 text-slate-500">{t.resolution ?? "—"}</td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-slate-400">No tickets yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
