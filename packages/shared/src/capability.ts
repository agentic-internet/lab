import { z } from "zod";

/**
 * The capability contract.
 *
 * This is the machine-readable form of what the agentic-internet notebook
 * describes in prose (assumptions/what-a-capability-might-look-like.md and
 * what-an-organization-might-publish.md). Producer (an organization publishing
 * /.well-known/agent) and consumer (an agent discovering it) both import THIS,
 * so there is one source of truth for the shape.
 */

/** How you actually reach a capability today. Anything that already exists. */
export const InteractionType = z.enum([
  "agent", // the outward-facing agent — the leading edge
  "rest", // a REST API
  "website", // a form / page built for people
  "telephone", // a human answers
  "email",
]);
export type InteractionType = z.infer<typeof InteractionType>;

export const Interaction = z.object({
  type: InteractionType,
  /** base URL, endpoint, phone number, or address depending on `type` */
  target: z.string().optional(),
  /** deliberately vague about what's on the other end of an `agent` interaction */
  protocol: z.string().default("unspecified").optional(),
});
export type Interaction = z.infer<typeof Interaction>;

/**
 * The terms block — the part the notebook argues is load-bearing.
 * The ORGANIZATION sets these, not the caller. A safety property that does not
 * depend on the calling agent being careful. (Reddit thread: reversible-vs-not
 * plus whether the resolver can be held to a policy.)
 */
export const Terms = z.object({
  costs_money: z.boolean(),
  reversible: z.boolean(),
  /** if reversible, how long is the window (e.g. "24h") */
  cancellation_window: z.string().optional(),
  human_approval_required: z.boolean(),
  /** safe to retry without side effects */
  idempotent: z.boolean(),
});
export type Terms = z.infer<typeof Terms>;

/**
 * Semantics let a model match a request to a capability without a global
 * vocabulary. The id is LOCAL — the organization's own name for the thing.
 * Matching happens on meaning, not on the string.
 */
export const Semantics = z.object({
  domain: z.string(), // e.g. "telecom"
  outcome: z.string(), // e.g. "tariff-change"
  verbs: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
});
export type Semantics = z.infer<typeof Semantics>;

export const IOField = z.object({
  type: z.string(), // "string" | "integer" | "date" | "money" | ...
  required: z.boolean().default(false),
  description: z.string().optional(),
});
export type IOField = z.infer<typeof IOField>;

/** immediate = result while you wait; process = decision arrives later */
export const CapabilityKind = z.enum(["immediate", "process"]);
export type CapabilityKind = z.infer<typeof CapabilityKind>;

export const Capability = z.object({
  /** local name, not a claim on a global vocabulary */
  id: z.string(),
  kind: CapabilityKind.default("immediate"),
  version: z.string().default("1.0"),
  title: z.string(),
  description: z.string(),
  semantics: Semantics,
  input: z.record(z.string(), IOField).default({}),
  output: z.record(z.string(), IOField).default({}),
  interaction: Interaction,
  authentication: z
    .object({
      type: z.string(), // "none" | "oauth2" | ...  (stubbed for the demo)
      scope: z.string().optional(),
    })
    .optional(),
  terms: Terms,
});
export type Capability = z.infer<typeof Capability>;

/**
 * The organization-level file, served at /.well-known/agent.
 * Small, cacheable, points at capability detail rather than inlining it.
 */
export const OrgManifest = z.object({
  version: z.string().default("0.1"),
  organization: z.object({
    name: z.string(),
    domain: z.string(),
    description: z.string().optional(),
  }),
  /** how the outward agent can be reached to negotiate over capabilities */
  agent_endpoint: z.string().optional(),
  capabilities: z.array(
    z.object({
      id: z.string(),
      /** where the full Capability lives */
      detail: z.string(),
    }),
  ),
  interaction: z.array(Interaction).default([]),
  policies: z
    .object({
      accepts_automated_requests: z.boolean().default(true),
      contact: z.string().optional(),
    })
    .optional(),
});
export type OrgManifest = z.infer<typeof OrgManifest>;
