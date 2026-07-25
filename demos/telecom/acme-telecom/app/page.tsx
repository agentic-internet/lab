import { ORG, SEED_TARIFFS } from "@/src/data";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-[var(--acme)]" />
        <span className="text-2xl font-semibold text-[var(--acme)]">Acme Telecom</span>
      </header>

      <p className="mt-8 text-lg text-slate-600">
        Mobile plans for people and businesses. Simple, fast, nationwide coverage.
      </p>

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Our plans
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {SEED_TARIFFS.map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{t.name}</span>
              <span className="text-slate-500">
                ${t.price_usd}
                <span className="text-xs">/mo</span>
              </span>
            </div>
            <div className="mt-1 text-slate-500">
              {t.data_gb === null ? "Unlimited data" : `${t.data_gb} GB data`}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-14 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          For autonomous systems
        </h2>
        <p className="mt-2 text-slate-600">
          {ORG.name} publishes a machine-readable description of what it can do, so an agent acting
          on someone&apos;s behalf can work with it without a prior integration.
        </p>
        <ul className="mt-3 space-y-1 font-mono text-sm">
          <li>
            <a className="text-[var(--acme)] underline" href="/robots.txt">
              /robots.txt
            </a>{" "}
            <span className="text-slate-400">— points at the agent</span>
          </li>
          <li>
            <a className="text-[var(--acme)] underline" href="/.well-known/agent">
              /.well-known/agent
            </a>{" "}
            <span className="text-slate-400">— who we are, what we can do</span>
          </li>
        </ul>
      </section>

      <footer className="mt-16 text-center text-xs text-slate-400">
        {ORG.description}
      </footer>
    </main>
  );
}
