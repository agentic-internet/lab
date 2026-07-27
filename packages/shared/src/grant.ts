import { createHmac } from "node:crypto";

/**
 * The caller-side grant.
 *
 * This is the machine-readable form of the "permission to reach out" the notebook
 * describes (assumptions/how-an-agent-decides-to-reach-out.md). A company's own
 * policy resolver issues one of these when an agent is cleared to act outside: it
 * names the ONE partner the agent may reach, the outcomes it may ask for, any
 * limit, and a short expiry. The agent cannot mint one itself.
 *
 * Important: a grant is CALLER-SIDE control — it proves the agent's own company
 * authorized the reach. It does NOT, by itself, prove anything to the other side.
 * That other half (does the receiver trust the agent that shows up) is the
 * separate, still-open trust question, stubbed elsewhere as `auth: assumed`.
 */
export interface Grant {
  /** Unique id, for logging/audit. */
  id: string;
  /** Who issued it — the caller's own resolver. */
  issuer: string;
  /** The only organization this grant lets the agent reach (host form). */
  partner_domain: string;
  /** The capability outcomes the agent may ask for, e.g. ["tariff-change"]. */
  scopes: string[];
  /** Optional limits the resolver attached (e.g. a spend cap). */
  limits?: Record<string, number>;
  issued_at: number;
  /** Short-lived: after this, the grant is dead and every call refuses. */
  expires_at: number;
  /** HMAC over the canonical fields — proves the resolver issued it. */
  sig: string;
}

/** Reduce any domain/URL to a bare host[:port] so grants compare cleanly. */
export function hostOf(domain: string): string {
  try {
    const u = new URL(domain.startsWith("http") ? domain : `https://${domain}`);
    return u.host.toLowerCase();
  } catch {
    return domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  }
}

/** The shared secret between a company's resolver and its own client library. */
export function resolverSecret(): string {
  return process.env.RESOLVER_SECRET ?? "globex-resolver-demo-secret";
}

/** Canonical serialization of the signed fields (order-independent scopes). */
function canonical(g: Omit<Grant, "sig">): string {
  return JSON.stringify([
    g.id,
    g.issuer,
    g.partner_domain,
    [...g.scopes].sort(),
    g.limits ?? {},
    g.issued_at,
    g.expires_at,
  ]);
}

/** Issue a signed, short-lived, scoped grant. Only the resolver calls this. */
export function signGrant(
  payload: {
    issuer: string;
    partner_domain: string;
    scopes: string[];
    limits?: Record<string, number>;
    ttl_ms?: number;
  },
  secret: string,
): Grant {
  const now = Date.now();
  const base: Omit<Grant, "sig"> = {
    id: `grant_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    issuer: payload.issuer,
    partner_domain: hostOf(payload.partner_domain),
    scopes: payload.scopes,
    limits: payload.limits,
    issued_at: now,
    expires_at: now + (payload.ttl_ms ?? 5 * 60 * 1000),
  };
  const sig = createHmac("sha256", secret).update(canonical(base)).digest("hex");
  return { ...base, sig };
}

/**
 * Verify a grant is real and still live. With a secret, the signature is
 * checked too (proving it came from the resolver). Without one, shape + expiry
 * are still enforced. Returns a reason on failure so the log can say why.
 */
export function verifyGrant(
  grant: Grant | undefined,
  opts: { secret?: string; now?: number } = {},
): { ok: boolean; reason?: string } {
  if (!grant) return { ok: false, reason: "no grant — the agent holds no authorization to reach outside" };
  const now = opts.now ?? Date.now();
  if (typeof grant.expires_at !== "number" || now > grant.expires_at) return { ok: false, reason: "grant expired" };
  if (!Array.isArray(grant.scopes) || grant.scopes.length === 0) return { ok: false, reason: "grant carries no scope" };
  if (!grant.partner_domain) return { ok: false, reason: "grant names no partner" };
  if (opts.secret) {
    const { sig, ...rest } = grant;
    const expected = createHmac("sha256", opts.secret).update(canonical(rest)).digest("hex");
    if (sig !== expected) return { ok: false, reason: "grant signature invalid — not issued by the resolver" };
  }
  return { ok: true };
}
