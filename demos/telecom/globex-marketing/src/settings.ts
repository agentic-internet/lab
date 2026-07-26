import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { anthropicProvider, deepseekProvider, openaiProvider, geminiProvider, type LLMProvider } from "@ail/agent-core";

/**
 * Demo control settings — only the operator (us) touches these, via /control.
 * The LLM is pluggable and toggleable: "deterministic" runs the scripted
 * provider (zero cost, always real mechanics); "live" runs a real model.
 * A daily cap and password keep a public demo from running up a bill.
 */

export interface Settings {
  /** How a ticket is resolved — the demo-wide behaviour, set in Admin. */
  flow: "agent-to-agent" | "agent-to-human";
  mode: "deterministic" | "live";
  provider: "anthropic" | "openai" | "gemini" | "deepseek";
  model: string;
  dailyCap: number;
  usedToday: number;
  date: string;
}

const FILE = join(process.cwd(), "data", "control.state.json");
const PASSWORD = process.env.CONTROL_PASSWORD ?? "demo";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaults(): Settings {
  return {
    flow: "agent-to-agent",
    mode: "live",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    dailyCap: 50,
    usedToday: 0,
    date: today(),
  };
}

export function getSettings(): Settings {
  if (!existsSync(FILE)) return defaults();
  // Merge over defaults so a state file written before a field existed still loads.
  const s = { ...defaults(), ...(JSON.parse(readFileSync(FILE, "utf8")) as Partial<Settings>) };
  if (s.date !== today()) {
    s.date = today();
    s.usedToday = 0;
    persist(s);
  }
  return s;
}

function persist(s: Settings): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 2));
}

export function checkPassword(pw: string | null): boolean {
  return pw === PASSWORD;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const s = { ...getSettings(), ...patch };
  persist(s);
  return s;
}

/** Public view (never leaks whether keys are present beyond a boolean). */
export function publicSettings() {
  const s = getSettings();
  return {
    flow: s.flow,
    mode: s.mode,
    provider: s.provider,
    model: s.model,
    dailyCap: s.dailyCap,
    usedToday: s.usedToday,
    keys: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    },
  };
}

/**
 * The provider to use for this run. Deterministic -> undefined (the agent uses
 * its built-in script). Live -> a real provider, but only if its key is present;
 * otherwise fall back to deterministic so the demo never hard-fails.
 */
export function pickProvider(): { provider?: LLMProvider; note?: string } {
  const s = getSettings();
  if (s.mode === "deterministic") return {};
  const missing = (name: string) => ({ note: `live requested but ${name} missing — using deterministic` });
  switch (s.provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY ? { provider: anthropicProvider({ model: s.model }) } : missing("ANTHROPIC_API_KEY");
    case "openai":
      return process.env.OPENAI_API_KEY ? { provider: openaiProvider({ model: s.model }) } : missing("OPENAI_API_KEY");
    case "gemini":
      return process.env.GEMINI_API_KEY ? { provider: geminiProvider({ model: s.model }) } : missing("GEMINI_API_KEY");
    case "deepseek":
      return process.env.DEEPSEEK_API_KEY ? { provider: deepseekProvider({ model: s.model }) } : missing("DEEPSEEK_API_KEY");
    default:
      return {};
  }
}

/** Rate-limit only matters when we're spending on a real model. */
export function consumeRateIfLive(): { ok: boolean; remaining: number } {
  const s = getSettings();
  if (s.mode !== "live") return { ok: true, remaining: s.dailyCap - s.usedToday };
  if (s.usedToday >= s.dailyCap) return { ok: false, remaining: 0 };
  s.usedToday += 1;
  persist(s);
  return { ok: true, remaining: s.dailyCap - s.usedToday };
}
