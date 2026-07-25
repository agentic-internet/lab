import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { SEED_TARIFFS, type Tariff } from "./data";

/**
 * Acme's operational store. Small, file-backed, real writes. Behind this
 * interface so it can be swapped for SQLite later without touching callers.
 */

export interface Line {
  line_id: string;
  subscriber: string;
  tariff_id: string;
}

interface State {
  tariffs: Tariff[];
  lines: Line[];
}

const FILE = join(process.cwd(), "data", "acme.state.json");

function seed(): State {
  return {
    tariffs: [...SEED_TARIFFS],
    // the Globex marketer's line, currently on Standard
    lines: [{ line_id: "GLX-4471", subscriber: "Globex Marketing", tariff_id: "standard" }],
  };
}

function load(): State {
  if (!existsSync(FILE)) {
    const s = seed();
    persist(s);
    return s;
  }
  return JSON.parse(readFileSync(FILE, "utf8")) as State;
}

function persist(s: State): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 2));
}

export function listTariffs(): Tariff[] {
  return load().tariffs.sort((a, b) => a.tier - b.tier);
}

export function getLine(lineId: string): Line | undefined {
  return load().lines.find((l) => l.line_id === lineId);
}

/** The tariffs a line may move to: strictly higher tiers (no downgrades offered). */
export function listHigherTariffs(lineId: string): Tariff[] {
  const s = load();
  const line = s.lines.find((l) => l.line_id === lineId);
  if (!line) return [];
  const current = s.tariffs.find((t) => t.id === line.tariff_id);
  const tier = current?.tier ?? 0;
  return s.tariffs.filter((t) => t.tier > tier).sort((a, b) => a.tier - b.tier);
}

export type ChangeResult =
  | { ok: true; from: string; to: string; effective: string }
  | { ok: false; reason: string };

/**
 * Change a line's tariff. Upgrades only — a downgrade is refused. This refusal
 * is the guardrail the demo surfaces (the PreToolUse hook reads the same rule).
 * On reaching the top tier, a new higher tier is appended so there is always
 * somewhere to go on the next run.
 */
export function changeTariff(lineId: string, targetTariffId: string): ChangeResult {
  const s = load();
  const line = s.lines.find((l) => l.line_id === lineId);
  if (!line) return { ok: false, reason: `unknown line ${lineId}` };
  const target = s.tariffs.find((t) => t.id === targetTariffId);
  if (!target) return { ok: false, reason: `unknown tariff ${targetTariffId}` };
  const current = s.tariffs.find((t) => t.id === line.tariff_id);
  const currentTier = current?.tier ?? 0;

  if (target.tier <= currentTier) {
    return { ok: false, reason: "downgrade not allowed" };
  }

  line.tariff_id = target.id;
  ensureHigherTierExists(s, target.tier);
  persist(s);
  return {
    ok: true,
    from: current?.name ?? "(none)",
    to: target.name,
    effective: new Date().toISOString(),
  };
}

/** Guarantee at least one tier above `tier`, so repeated demos never run out. */
function ensureHigherTierExists(s: State, tier: number): void {
  const maxTier = Math.max(...s.tariffs.map((t) => t.tier));
  if (tier < maxTier) return;
  const n = maxTier + 1;
  s.tariffs.push({
    id: `ultra-${n}`,
    name: `Ultra ${n}`,
    data_gb: null,
    price_usd: 60 + (n - 4) * 20,
    tier: n,
  });
}

/** Reset to seed — used by the admin panel's "reset" button later. */
export function reset(): void {
  persist(seed());
}
