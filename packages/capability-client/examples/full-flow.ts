/**
 * The full agent-to-agent mechanic, no LLM: discover an unfamiliar operator,
 * query the tariffs a line can move to, upgrade it, and watch a downgrade get
 * refused. Run Acme Telecom first, then: pnpm dlx tsx examples/full-flow.ts
 */
import { discover, matchCapability, callCapability } from "../src/index";

const DOMAIN = process.env.TARGET ?? "http://localhost:3001";
const LINE = "GLX-4471";

const log = (m: string) => console.log(m);

// 1. discover
const { manifest, capabilities } = await discover(DOMAIN, {
  onEvent: (e) => {
    if (e.step === "manifest") log(`discovered ${e.manifest.organization.name}`);
    if (e.step === "capability") log(`  capability: ${e.capability.id}`);
  },
});
const agent = manifest.agent_endpoint!;

// 2. which capability answers "what can I upgrade to"
const queryCap = matchCapability(capabilities, { outcome: "tariff-options", text: "what can I switch to" })[0]!;
log(`\nquery → ${queryCap.id}`);
const q = await callCapability(agent, queryCap.id, { line_id: LINE });
const options = (q.body as { tariffs: { id: string; name: string; price_usd: number }[] }).tariffs;
log("eligible: " + options.map((t) => `${t.name} ($${t.price_usd})`).join(", "));

// 3. try a DOWNGRADE first — should be refused (the guardrail)
log(`\nattempt downgrade → starter`);
const down = await callCapability(agent, "telecom.line.tariff.change", { line_id: LINE, target_tariff_id: "starter" });
log(`result: ${down.status} ${JSON.stringify(down.body)}`);

// 4. now a valid upgrade — should succeed
const pick = options.at(-1)!; // the top eligible one
log(`\nupgrade → ${pick.name}`);
const up = await callCapability(agent, "telecom.line.tariff.change", { line_id: LINE, target_tariff_id: pick.id });
log(`result: ${up.status} ${JSON.stringify(up.body)}`);
