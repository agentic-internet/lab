"use client";

import { useState } from "react";

interface View {
  mode: "deterministic" | "live";
  provider: "anthropic" | "deepseek";
  model: string;
  dailyCap: number;
  usedToday: number;
  keys: { anthropic: boolean; deepseek: boolean };
}

const MODELS: Record<string, string[]> = {
  anthropic: ["claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-8"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
};

export default function Control() {
  const [pw, setPw] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [err, setErr] = useState("");

  async function load(password: string) {
    const res = await fetch("/api/control", { headers: { "x-control-password": password } });
    if (!res.ok) return setErr("Wrong password");
    setErr("");
    setView(await res.json());
  }

  async function patch(p: Record<string, unknown>) {
    const res = await fetch("/api/control", {
      method: "POST",
      headers: { "content-type": "application/json", "x-control-password": pw },
      body: JSON.stringify(p),
    });
    if (res.ok) setView(await res.json());
  }

  const [resetMsg, setResetMsg] = useState("");
  async function resetDemo() {
    setResetMsg("resetting…");
    const res = await fetch("/api/reset", { method: "POST", headers: { "x-control-password": pw } });
    const r = await res.json();
    setResetMsg(res.ok ? `Reset done (Acme: ${r.acmeReset ? "ok" : "unreachable"})` : "Reset failed");
  }

  if (!view) {
    return (
      <main className="mx-auto max-w-sm px-6 py-24">
        <h1 className="text-lg font-semibold text-slate-700">Admin</h1>
        <p className="mt-1 text-sm text-slate-400">Operator only — demo controls.</p>
        <form onSubmit={(e) => { e.preventDefault(); load(pw); }} className="mt-6 flex gap-2">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="password"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">Unlock</button>
        </form>
        {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
      </main>
    );
  }

  const Toggle = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={"rounded-md px-3 py-1.5 text-sm " + (on ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100")}
    >
      {children}
    </button>
  );

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-lg font-semibold text-slate-700">Admin <span className="font-normal text-slate-400">— demo controls</span></h1>

      <section className="mt-6 space-y-6">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reasoning</label>
          <div className="mt-2 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <Toggle on={view.mode === "deterministic"} onClick={() => patch({ mode: "deterministic" })}>
              Deterministic (free)
            </Toggle>
            <Toggle on={view.mode === "live"} onClick={() => patch({ mode: "live" })}>
              Live model
            </Toggle>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Deterministic runs the scripted agent at zero cost — the mechanics are real either way.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Provider</label>
          <div className="mt-2 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <Toggle on={view.provider === "anthropic"} onClick={() => patch({ provider: "anthropic", model: MODELS.anthropic[0] })}>
              Anthropic {view.keys.anthropic ? "✓" : "· no key"}
            </Toggle>
            <Toggle on={view.provider === "deepseek"} onClick={() => patch({ provider: "deepseek", model: MODELS.deepseek[0] })}>
              DeepSeek {view.keys.deepseek ? "✓" : "· no key"}
            </Toggle>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Model</label>
          <select
            value={view.model}
            onChange={(e) => patch({ model: e.target.value })}
            className="mt-2 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {(MODELS[view.provider] ?? []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Daily live cap — used {view.usedToday}/{view.dailyCap}
          </label>
          <input
            type="number"
            defaultValue={view.dailyCap}
            onBlur={(e) => patch({ dailyCap: Number(e.target.value) })}
            className="mt-2 block w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </section>

      <div className="mt-10 border-t border-slate-100 pt-6">
        <button
          onClick={resetDemo}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Reset demo (tickets + Acme tariffs/lines)
        </button>
        {resetMsg && <span className="ml-3 text-sm text-slate-500">{resetMsg}</span>}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        For the internal demo: Anthropic + Live. For public: DeepSeek (or Deterministic) to keep costs
        near zero. Discovery, MCP, DB and the guardrail are always real. Data views:{" "}
        <a href="/db" className="underline">Globex tickets</a>.
      </p>
    </main>
  );
}
