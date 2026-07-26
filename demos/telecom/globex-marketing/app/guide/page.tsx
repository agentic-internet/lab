import Link from "next/link";

const ACME = process.env.NEXT_PUBLIC_ACME_URL ?? "http://localhost:3001";

export default function Guide() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-slate-800">A demo of the agentic internet</h1>
      <p className="mt-3 text-slate-600">
        Two fictional companies. <b>Globex Marketing</b> needs mobile plans for its staff;{" "}
        <b>Acme Telecom</b> is the operator. Watch what happens when Globex&apos;s software needs
        something from a company it has no integration with.
      </p>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-400">
        The two ways — one toggle
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-medium text-slate-700">🔑 Agent → Human (today)</div>
          <p className="mt-1 text-sm text-slate-500">
            A person logs into Acme&apos;s admin panel and does it by hand — a bespoke, brittle path
            that breaks if Acme changes anything.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-medium text-slate-700">🌐 Agent → Agent (proposed)</div>
          <p className="mt-1 text-sm text-slate-500">
            Globex&apos;s agent discovers Acme via <span className="font-mono">/.well-known/agent</span>{" "}
            and works with its agent — no prior integration.
          </p>
        </div>
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Explore it
      </h2>
      <ol className="mt-3 space-y-3 text-sm text-slate-600">
        <li>
          <Link href="/" className="font-medium text-[var(--globex)] underline">1. Employee assistant</Link>
          {" "}— ask to upgrade a plan. It opens a ticket (employees can&apos;t self-serve).
        </li>
        <li>
          <Link href="/ops" className="font-medium text-[var(--globex)] underline">2. Operations</Link>
          {" "}— flip the toggle and resolve the same ticket both ways. Watch the log panel change character.
        </li>
        <li>
          <a href={`${ACME}/.well-known/agent`} className="font-medium text-[var(--globex)] underline">
            3. Acme&apos;s published description
          </a>
          {" "}— exactly what any agent reads, with no prior arrangement.
        </li>
        <li>
          <Link href="/db" className="font-medium text-[var(--globex)] underline">4. The data</Link>
          {" "}(and <a href={`${ACME}/db`} className="underline">Acme&apos;s</a>) — live, read-only tables.
        </li>
      </ol>

      <div className="mt-10 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
        <b>Everything here is real</b> — the MCP calls, the discovery, the database writes, the
        guardrail that refuses a downgrade. The only optional part is the LLM: it runs in a
        zero-cost deterministic mode by default, and a real model (Claude or DeepSeek) can be
        switched on from the operator&apos;s control panel.
      </div>

      <p className="mt-8 text-xs text-slate-400">
        Fictional companies, built to explore an idea:{" "}
        <a href="https://github.com/agentic-internet/agentic-internet" className="underline">
          the agentic-internet notebook
        </a>{" "}
        ·{" "}
        <a href="https://github.com/agentic-internet/lab" className="underline">the code</a>.
      </p>
    </main>
  );
}
