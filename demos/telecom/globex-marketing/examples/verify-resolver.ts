/**
 * Verifies the resolver core in isolation (no servers needed):
 *   - the resolver MCP grants for an approved partner and denies otherwise
 *   - a grant signs and verifies, and fails when tampered or expired
 *   - callExternal refuses before any network unless the grant fits
 *
 * Run: pnpm dlx tsx examples/verify-resolver.ts
 */
import { connectGlobexResolver, mcpCallJson } from "@ail/mcp-servers";
import { callExternal, isRefused } from "@ail/capability-client";
import { signGrant, verifyGrant, resolverSecret, type Grant } from "@ail/shared";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
}

const ACME = process.env.ACME_URL ?? "http://localhost:3001";
const resolver = await connectGlobexResolver();

// 1) Resolver authorizes an approved partner for a permitted outcome.
const ok = (await mcpCallJson(resolver, "authorize_external", {
  partner_domain: ACME,
  outcome: "tariff-change",
})) as { allowed: boolean; grant?: Grant; scopes?: string[] };
check("resolver authorizes approved partner", ok.allowed && !!ok.grant);
check("grant is scoped to the partner's outcomes", !!ok.scopes?.includes("tariff-change") && !!ok.scopes?.includes("tariff-options"));

// 2) Resolver denies an unknown partner.
const stranger = (await mcpCallJson(resolver, "authorize_external", {
  partner_domain: "https://not-a-partner.example",
  outcome: "tariff-change",
})) as { allowed: boolean; reason?: string };
check("resolver denies a stranger", stranger.allowed === false, stranger.reason);

// 3) Resolver denies a permitted partner but an outcome outside policy.
const badScope = (await mcpCallJson(resolver, "authorize_external", {
  partner_domain: ACME,
  outcome: "delete-account",
})) as { allowed: boolean; reason?: string };
check("resolver denies an out-of-policy outcome", badScope.allowed === false, badScope.reason);

// 4) The issued grant verifies with the resolver's secret.
const grant = ok.grant!;
check("issued grant verifies", verifyGrant(grant, { secret: resolverSecret() }).ok);

// 5) A tampered grant fails signature verification.
const tampered: Grant = { ...grant, scopes: [...grant.scopes, "delete-account"] };
check("tampered grant fails verification", !verifyGrant(tampered, { secret: resolverSecret() }).ok);

// 6) An expired grant fails.
const expired = signGrant(
  { issuer: "test", partner_domain: ACME, scopes: ["tariff-change"], ttl_ms: -1000 },
  resolverSecret(),
);
check("expired grant fails verification", !verifyGrant(expired, { secret: resolverSecret() }).ok);

// 7) callExternal refuses with no grant (no network happens).
const noGrant = await callExternal(undefined, { partner_domain: ACME, agentEndpoint: `${ACME}/agent`, capabilityId: "x", outcome: "tariff-change" }, {}, { secret: resolverSecret() });
check("callExternal refuses with no grant", isRefused(noGrant), isRefused(noGrant) ? noGrant.reason : "");

// 8) callExternal refuses a grant for a different partner.
const wrongPartner = await callExternal(grant, { partner_domain: "https://elsewhere.example", agentEndpoint: "https://elsewhere.example/agent", capabilityId: "x", outcome: "tariff-change" }, {}, { secret: resolverSecret() });
check("callExternal refuses a mismatched partner", isRefused(wrongPartner), isRefused(wrongPartner) ? wrongPartner.reason : "");

// 9) callExternal refuses an outcome the grant doesn't cover.
const outOfScope = await callExternal(grant, { partner_domain: ACME, agentEndpoint: `${ACME}/agent`, capabilityId: "x", outcome: "delete-account" }, {}, { secret: resolverSecret() });
check("callExternal refuses an out-of-scope outcome", isRefused(outOfScope), isRefused(outOfScope) ? outOfScope.reason : "");

// 10) callExternal refuses a call over the grant's spend cap (marks over_limit).
const overCap = await callExternal(grant, { partner_domain: ACME, agentEndpoint: `${ACME}/agent`, capabilityId: "telecom.line.tariff.change", outcome: "tariff-change", amount_usd: 9999 }, {}, { secret: resolverSecret() });
check("callExternal refuses over the spend cap", isRefused(overCap) && overCap.over_limit === true, isRefused(overCap) ? overCap.reason : "");

await resolver.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
