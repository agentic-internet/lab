import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/** Manager confirmations. When ops escalates a ticket, one of these is raised;
 *  a manager approves it before the operator applies the change by hand. */

export interface Escalation {
  id: string;
  ticket_id: string;
  employee: string;
  summary: string;
  status: "pending" | "approved";
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
export function createEscalation(t: { ticket_id: string; employee: string; summary: string }): Escalation {
  const s = load();
  const existing = s.items.find((e) => e.ticket_id === t.ticket_id);
  if (existing) return existing;
  s.seq += 1;
  const e: Escalation = {
    id: `ESC-${s.seq}`,
    ticket_id: t.ticket_id,
    employee: t.employee,
    summary: t.summary,
    status: "pending",
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

export function approveEscalation(id: string): Escalation | undefined {
  const s = load();
  const e = s.items.find((x) => x.id === id);
  if (!e) return undefined;
  e.status = "approved";
  e.decided = new Date().toISOString();
  persist(s);
  return e;
}

export function reset(): void {
  persist({ seq: 500, items: [] });
}
