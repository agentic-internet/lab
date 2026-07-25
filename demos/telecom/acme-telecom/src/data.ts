import type { Capability } from "@ail/shared";

/** Acme Telecom — a FICTIONAL mobile operator. Not a real company. */

export const ORG = {
  name: "Acme Telecom",
  domain: "acme-telecom.salginci.com",
  description: "Mobile network operator. Fictional company, for demonstration only.",
};

export interface Tariff {
  id: string;
  name: string;
  data_gb: number | null; // null = unlimited
  price_usd: number;
  tier: number; // ordering; higher = more
}

/** Seed tariffs. The "no downgrade" rule means each successful upgrade appends a
 *  new top tier at runtime, so repeated demo runs always have somewhere higher to go. */
export const SEED_TARIFFS: Tariff[] = [
  { id: "starter", name: "Starter", data_gb: 10, price_usd: 15, tier: 1 },
  { id: "standard", name: "Standard", data_gb: 30, price_usd: 25, tier: 2 },
  { id: "pro", name: "Pro", data_gb: 100, price_usd: 40, tier: 3 },
  { id: "unlimited", name: "Unlimited", data_gb: null, price_usd: 60, tier: 4 },
];

/** The capabilities Acme publishes. Local ids — meaning-based matching does the work. */
export const CAPABILITIES: Capability[] = [
  {
    id: "telecom.line.tariff.query",
    kind: "immediate",
    version: "1.0",
    title: "List available tariffs for a line",
    description: "Return the tariffs a given mobile line is eligible to move to.",
    semantics: {
      domain: "telecom",
      outcome: "tariff-options",
      verbs: ["list", "show", "query", "compare"],
      aliases: ["available plans", "which tariffs", "what can I switch to"],
    },
    input: {
      line_id: { type: "string", required: true, description: "The mobile line identifier." },
    },
    output: {
      tariffs: { type: "Tariff[]", required: true, description: "Eligible tariffs." },
    },
    interaction: { type: "agent", target: "/agent" },
    authentication: { type: "none" },
    terms: {
      costs_money: false,
      reversible: true,
      human_approval_required: false,
      idempotent: true,
    },
  },
  {
    id: "telecom.line.tariff.change",
    kind: "immediate",
    version: "1.0",
    title: "Change the tariff on a line",
    description: "Move a mobile line to a different tariff. Upgrades only; downgrades are refused.",
    semantics: {
      domain: "telecom",
      outcome: "tariff-change",
      verbs: ["change", "upgrade", "switch", "set", "move"],
      aliases: ["upgrade plan", "change tariff", "increase package", "bump the plan"],
    },
    input: {
      line_id: { type: "string", required: true },
      target_tariff_id: { type: "string", required: true },
    },
    output: {
      status: { type: "string", required: true },
      effective: { type: "string", required: false },
    },
    interaction: { type: "agent", target: "/agent" },
    authentication: { type: "none" },
    terms: {
      costs_money: true,
      reversible: true,
      cancellation_window: "24h",
      human_approval_required: false,
      idempotent: false,
    },
  },
];
