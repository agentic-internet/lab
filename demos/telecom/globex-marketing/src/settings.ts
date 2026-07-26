import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { anthropicProvider, deepseekProvider, type LLMProvider } from "@ail/agent-core";

/**
 * Demo control settings — only the operator (us) touches these, via /control.
 * The LLM is pluggable and toggleable: "deterministic" runs the scripted
 * provider (zero cost, always real mechanics); "live" runs a real model.
 * A daily cap and password keep a public demo from running up a bill.
 */

export interface Settings {
  mode: "deterministic" | "live";
  provider: "anthropic" | "deepseek";
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
    mode: "deterministic",
    provider: "anthropic",
    model: "claude-sonnet-5",
    dailyCap: 50,
    usedToday: 0,
    date: today(),
  };
}

export function getSettings(): Settings {
  if (!existsSync(FILE)) return defaults();
  const s = JSON.parse(readFileSync(FILE, "utf8")) as Settings;
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
    mode: s.mode,
    provider: s.provider,
    model: s.model,
    dailyCap: s.dailyCap,
    usedToday: s.usedToday,
    keys: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
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
  if (s.provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) return { note: "live requested but ANTHROPIC_API_KEY missing — using deterministic" };
    return { provider: anthropicProvider({ model: s.model }) };
  }
  if (!process.env.DEEPSEEK_API_KEY) return { note: "live requested but DEEPSEEK_API_KEY missing — using deterministic" };
  return { provider: deepseekProvider({ model: s.model }) };
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
