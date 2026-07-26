"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ACME = process.env.NEXT_PUBLIC_ACME_URL ?? "http://localhost:3001";

/** Globex's own two screens. "Admin" isn't a Globex screen — to change a line,
 *  ops goes to the operator's (Acme's) business portal, so it's an external link. */
const MAIN = [
  { href: "/", label: "Employee", active: (p: string) => p === "/" },
  { href: "/ops", label: "Operations", active: (p: string) => p.startsWith("/ops") },
  { href: "/manager", label: "Manager", active: (p: string) => p.startsWith("/manager") },
];

const SECONDARY = [
  { href: "/db", label: "Data" },
  { href: "/control", label: "Settings" },
  { href: "/guide", label: "Guide" },
];

export function TopNav() {
  const path = usePathname() ?? "/";
  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-6 py-2.5">
        <Link href="/" className="mr-4 flex items-center gap-2">
          <span className="h-5 w-5 rounded bg-[var(--globex)]" />
          <span className="text-sm font-semibold text-[var(--globex)]">Globex Marketing</span>
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
          href={`${ACME}/admin`}
          target="_blank"
          rel="noreferrer"
          title="Acme's business portal — where ops changes a line by hand"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Admin ↗
        </a>

        <div className="ml-auto flex items-center gap-4 text-xs text-slate-400">
          {SECONDARY.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={"hover:text-slate-600 " + (path.startsWith(s.href) ? "text-slate-600 underline" : "")}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
