import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Globex Marketing — Internal Assistant",
  description: "Fictional company demo for the agentic-internet project.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-800 antialiased">
        <div className="bg-amber-100 text-amber-900 text-center text-xs py-1.5 px-4">
          Not a real company. Globex Marketing and Acme Telecom are fictional, built to demonstrate
          the{" "}
          <a href="https://github.com/agentic-internet/agentic-internet" className="underline">
            agentic-internet
          </a>{" "}
          idea.
        </div>
        {children}
      </body>
    </html>
  );
}
