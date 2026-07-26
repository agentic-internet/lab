"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Three primary screens, plus the read-only/data links kept small on the right. */
const MAIN = [
  { href: "/", label: "Employee", active: (p: string) => p === "/" },
  { href: "/ops", label: "Operations", active: (p: string) => p.startsWith("/ops") },
  { href: "/control", label: "Admin", active: (p: string) => p.startsWith("/control") },
];

const SECONDARY = [
  { href: "/db", label: "Data" },
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
