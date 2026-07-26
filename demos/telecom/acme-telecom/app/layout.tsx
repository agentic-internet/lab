import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "./TopNav";

export const metadata: Metadata = {
  title: "Acme Telecom",
  description: "Fictional mobile operator — a demonstration for the agentic-internet project.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-800 antialiased">
        <div className="bg-amber-100 text-amber-900 text-center text-sm py-1.5 px-4">
          Not a real company. Acme Telecom is fictional, built only to demonstrate the{" "}
          <a href="https://github.com/agentic-internet/agentic-internet" className="underline">
            agentic-internet
          </a>{" "}
          idea.
        </div>
        <TopNav />
        {children}
      </body>
    </html>
  );
}
