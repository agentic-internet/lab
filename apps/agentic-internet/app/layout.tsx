import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agentic Internet — publish & inspect an agent",
  description: "A v0, deliberately unstable reference shape for agents that reach across companies — plus a live inspector for any domain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="wrap row">
            <span className="brand"><span className="dot">◆</span> agentic-internet</span>
            <nav>
              <a href="#inspect">Inspect</a>
              <a href="https://github.com/agentic-internet/agentic-internet">Notebook</a>
              <a href="https://github.com/agentic-internet/lab">Code</a>
            </nav>
          </div>
        </header>
        {children}
        <footer>
          <div className="wrap">
            An open experiment — a bet, not a standard. The shape here is <span className="k">v0 · unstable</span> and will change as real use shapes it.{" "}
            <a href="https://github.com/agentic-internet/agentic-internet">Read the argument →</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
