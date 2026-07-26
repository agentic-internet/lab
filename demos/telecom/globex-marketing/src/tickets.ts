import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/** Globex's ticket store. Real writes, file-backed, behind an interface. */

export interface Ticket {
  id: string;
  subscriber: string;
  line_id: string;
  operator_name: string;
  operator_domain: string;
  request: string;
  status: "open" | "done";
  created: string;
  resolution?: string;
}

interface State {
  seq: number;
  tickets: Ticket[];
}

const FILE = join(process.cwd(), "data", "globex.state.json");

function load(): State {
  if (!existsSync(FILE)) return { seq: 1000, tickets: [] };
  return JSON.parse(readFileSync(FILE, "utf8")) as State;
}

function persist(s: State): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 2));
}

export function createTicket(
  t: Omit<Ticket, "id" | "status" | "created">,
): Ticket {
  const s = load();
  s.seq += 1;
  const ticket: Ticket = {
    ...t,
    id: `TKT-${s.seq}`,
    status: "open",
    created: new Date().toISOString(),
  };
  s.tickets.push(ticket);
  persist(s);
  return ticket;
}

export function listTickets(): Ticket[] {
  return load().tickets.sort((a, b) => (a.created < b.created ? 1 : -1));
}

export function getTicket(id: string): Ticket | undefined {
  return load().tickets.find((t) => t.id === id);
}

export function resolveTicket(id: string, resolution: string): Ticket | undefined {
  const s = load();
  const t = s.tickets.find((x) => x.id === id);
  if (!t) return undefined;
  t.status = "done";
  t.resolution = resolution;
  persist(s);
  return t;
}

export function reset(): void {
  persist({ seq: 1000, tickets: [] });
}
