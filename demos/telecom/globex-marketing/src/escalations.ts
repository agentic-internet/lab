import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/** Manager confirmations. When ops escalates a ticket, one of these is raised;
 *  a manager approves it before the operator applies the change by hand. */

export interface TariffOption {
  id: string;
  name: string;
  data_gb: number;
  mins: number;
  price_usd: number;
}

export interface Escalation {
  id: string;
  ticket_id: string;
  employee: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
  /** For agent-to-agent: the options fetched from the operator for the manager to choose from. */
  options?: TariffOption[];
  /** The tariff the manager picked when approving (agent-to-agent). */
  chosen_tariff_id?: string;
  created: string;
  decided?: string;
}

interface State {
  seq: number;
  items: Escalation[];
}

const FILE = join(process.cwd(), "data", "escalations.state.json");

function load(): State {
  if (!existsSync(FILE)) return { seq: 500, items: [] };
  return JSON.parse(readFileSync(FILE, "utf8")) as State;
}

function persist(s: State): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 2));
}

/** Raise a confirmation for a ticket (idempotent — one per ticket). */
export function createEscalation(t: {
  ticket_id: string;
  employee: string;
  summary: string;
  options?: TariffOption[];
}): Escalation {
  const s = load();
  const existing = s.items.find((e) => e.ticket_id === t.ticket_id);
  if (existing) {
    if (t.options && !existing.options) {
      existing.options = t.options;
      persist(s);
    }
    return existing;
  }
  s.seq += 1;
  const e: Escalation = {
    id: `ESC-${s.seq}`,
    ticket_id: t.ticket_id,
    employee: t.employee,
    summary: t.summary,
    status: "pending",
    options: t.options,
    created: new Date().toISOString(),
  };
  s.items.push(e);
  persist(s);
  return e;
}

export function listEscalations(): Escalation[] {
  return load().items.sort((a, b) => (a.created < b.created ? 1 : -1));
}

export function forTicket(ticketId: string): Escalation | undefined {
  return load().items.find((e) => e.ticket_id === ticketId);
}

/** Manager's decision. approve (optionally with a chosen tariff) or reject. */
export function decideEscalation(
  id: string,
  decision: "approve" | "reject",
  chosenTariffId?: string,
): Escalation | undefined {
  const s = load();
  const e = s.items.find((x) => x.id === id);
  if (!e) return undefined;
  e.status = decision === "approve" ? "approved" : "rejected";
  if (chosenTariffId) e.chosen_tariff_id = chosenTariffId;
  e.decided = new Date().toISOString();
  persist(s);
  return e;
}

export function reset(): void {
  persist({ seq: 500, items: [] });
}
