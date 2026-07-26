import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { SEED_TARIFFS, SEED_ACTIVE_TARIFF, makeTariff, type Tariff } from "./data";

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

/** How many tariffs stay above and below the active one in the visible window. */
const WINDOW = 2;

function seed(): State {
  return {
    tariffs: [...SEED_TARIFFS],
    // the Globex marketer's line, sitting on the middle tariff
    lines: [{ line_id: "GLX-4471", subscriber: "Globex Marketing", tariff_id: SEED_ACTIVE_TARIFF }],
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

/** A bespoke secret Acme shares only with pre-arranged partners for its private
 *  admin panel. Demo A depends on this + hardcoded knowledge of the panel API. */
export const ADMIN_TOKEN = "demo-panel-token";

/** Only the visible window — never the soft-deleted ones that slid off the bottom. */
export function listTariffs(): Tariff[] {
  return load().tariffs.filter((t) => !t.deleted).sort((a, b) => a.tier - b.tier);
}

export function listLines(): Line[] {
  return load().lines;
}

/** Resolve a name even for a soft-deleted tariff, so old references still render. */
export function tariffName(id: string): string {
  return load().tariffs.find((t) => t.id === id)?.name ?? id;
}

export function getLine(lineId: string): Line | undefined {
  return load().lines.find((l) => l.line_id === lineId);
}

/** The line's current tariff, in full. */
export function getCurrentTariff(lineId: string): Tariff | undefined {
  const s = load();
  const line = s.lines.find((l) => l.line_id === lineId);
  if (!line) return undefined;
  return s.tariffs.find((t) => t.id === line.tariff_id);
}

/** The tariffs a line may move to: strictly higher, still in the visible window. */
export function listHigherTariffs(lineId: string): Tariff[] {
  const line = getLine(lineId);
  if (!line) return [];
  const tier = getCurrentTariff(lineId)?.tier ?? 0;
  return listTariffs().filter((t) => t.tier > tier);
}

export type ChangeResult =
  | { ok: true; from: string; to: string; effective: string }
  | { ok: false; reason: string };

/**
 * Change a line's tariff. Upgrades only — a downgrade is refused. This refusal is
 * the guardrail the demo surfaces. On success the visible window re-centres on the
 * new tariff, so the active plan is always the middle of five and there is always
 * somewhere to go — no reset needed however many people try it.
 */
export function changeTariff(lineId: string, targetTariffId: string): ChangeResult {
  const s = load();
  const line = s.lines.find((l) => l.line_id === lineId);
  if (!line) return { ok: false, reason: `unknown line ${lineId}` };
  const target = s.tariffs.find((t) => t.id === targetTariffId);
  if (!target || target.deleted) return { ok: false, reason: `unknown tariff ${targetTariffId}` };
  const current = s.tariffs.find((t) => t.id === line.tariff_id);
  const currentTier = current?.tier ?? 0;

  if (target.tier <= currentTier) {
    return { ok: false, reason: "downgrade not allowed" };
  }

  line.tariff_id = target.id;
  recenterWindow(s, target.tier);
  persist(s);
  return {
    ok: true,
    from: current?.name ?? "(none)",
    to: target.name,
    effective: new Date().toISOString(),
  };
}

/**
 * Keep the active tariff in the middle of the window: WINDOW tiers below it and
 * WINDOW above it stay visible; anything lower is soft-deleted; anything missing
 * above is generated. So the window slides up with each upgrade and never runs out.
 */
function recenterWindow(s: State, activeTier: number): void {
  const lo = activeTier - WINDOW;
  const hi = activeTier + WINDOW;
  const maxTier = Math.max(...s.tariffs.map((t) => t.tier));
  for (let n = maxTier + 1; n <= hi; n++) s.tariffs.push(makeTariff(n));
  for (const t of s.tariffs) t.deleted = t.tier < lo;
}

/** Reset to seed — used by the admin panel's "reset" button. */
export function reset(): void {
  persist(seed());
}
