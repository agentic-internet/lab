/**
 * End-to-end: discover an operator from a bare domain, over real HTTP.
 * Run Acme Telecom first, then: pnpm dlx tsx examples/discover.ts
 */
import { discover, matchCapability } from "../src/index";

const DOMAIN = process.env.TARGET ?? "http://localhost:3001";

const found = await discover(DOMAIN, {
  onEvent: (e) => {
    switch (e.step) {
      case "fetch-robots":
        return console.log(`→ GET ${e.url}`);
      case "found-agent-path":
        return console.log(`  found Agent: ${e.agentUrl}`);
      case "fetch-manifest":
        return console.log(`→ GET ${e.url}`);
      case "manifest":
        return console.log(`  ${e.manifest.organization.name} — ${e.manifest.capabilities.length} capabilities`);
      case "fetch-capability":
        return console.log(`→ GET ${e.url}`);
      case "capability":
        return console.log(`  ${e.capability.id}  (costs_money=${e.capability.terms.costs_money}, reversible=${e.capability.terms.reversible})`);
    }
  },
});

console.log("\nUser says: \"I want to upgrade my plan\"");
const matches = matchCapability(found.capabilities, {
  outcome: "tariff-change",
  text: "I want to upgrade my plan",
});
console.log("Best match:", matches[0]?.id ?? "(none)");
