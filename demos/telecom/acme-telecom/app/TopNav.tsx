"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Acme's own site nav: the marketing home, the operator admin panel, and the data view. */
const MAIN = [
  { href: "/", label: "Home", active: (p: string) => p === "/" },
  { href: "/admin", label: "Admin", active: (p: string) => p.startsWith("/admin") },
  { href: "/db", label: "Data", active: (p: string) => p.startsWith("/db") },
];

export function TopNav() {
  const path = usePathname() ?? "/";
  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-1 px-6 py-2.5">
        <Link href="/" className="mr-4 flex items-center gap-2">
          <span className="h-5 w-5 rounded bg-[var(--acme)]" />
          <span className="text-sm font-semibold text-[var(--acme)]">Acme Telecom</span>
        </Link>

        {MAIN.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium transition " +
              (t.active(path) ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100")
            }
          >
            {t.label}
          </Link>
        ))}

        <a
          href="/.well-known/agent"
          className="ml-auto text-xs text-slate-400 underline hover:text-slate-600"
        >
          Agent file
        </a>
      </div>
    </nav>
  );
}
