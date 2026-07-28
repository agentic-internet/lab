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
  data_gb: number;
  mins: number;
  price_usd: number;
  tier: number; // ordering; higher = more
  deleted?: boolean; // soft-deleted: fell out of the visible window below the active tariff
}

/**
 * Tariffs live on an endless ladder. Tier n is generated deterministically, so
 * the visible window can slide upward forever without a seed list running out —
 * see the re-centring in db.ts. Codes read like an operator's package catalogue.
 */
export function makeTariff(n: number): Tariff {
  const code = `PKC-${String(n).padStart(2, "0")}`;
  return {
    id: code,
    name: code,
    data_gb: n * 20,
    mins: n * 250,
    price_usd: 5 + n * 10,
    tier: n,
    deleted: false,
  };
}

/** Seed: eight tariffs ($15–$85), with the line sitting low (PKC-03) so there is
 *  real headroom to upgrade — including options above the resolver's spend cap,
 *  which is what surfaces the "over the cap → request to a human" path. */
export const SEED_TARIFFS: Tariff[] = [1, 2, 3, 4, 5, 6, 7, 8].map(makeTariff);

/** The line starts low on the ladder, with room to move up. */
export const SEED_ACTIVE_TARIFF = "PKC-03";

/** The capabilities Acme publishes. Local ids — meaning-based matching does the work. */
export const CAPABILITIES: Capability[] = [
  {
    id: "telecom.line.tariff.query",
    kind: "immediate",
    version: "1.0",
    title: "List available tariffs for a line",
    description: "Return the line's current tariff and the tariffs it is eligible to move up to.",
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
      current: { type: "Tariff", required: true, description: "The line's current tariff." },
      tariffs: { type: "Tariff[]", required: true, description: "Higher tariffs the line can move to." },
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
