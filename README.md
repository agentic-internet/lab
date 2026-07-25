# agentic-internet / lab

Reference implementations and runnable demos for the idea explored in
[agentic-internet](https://github.com/agentic-internet/agentic-internet): what happens when a
company's agent needs to deal with another company's agent, over a public capability description
an organization publishes at `/.well-known/agent`.

This is a monorepo. The reusable core lives in `packages/`; each demo lives under `demos/`. Every
demo uses the same core, because the whole point is one convention across industries.

```
packages/
  shared/               the capability contract (one source of truth)
  capability-manifest/  publish /.well-known/agent + capability files      (todo)
  capability-client/    discover an org's agent and consume its capabilities (todo)
  agent-core/           agent runtime with a pluggable LLM provider          (todo)
  mcp-servers/          MCP tool servers                                     (todo)
demos/
  telecom/              Acme Telecom (operator) + Globex Marketing (subscriber) (todo)
```

**Not real companies.** Acme Telecom and Globex Marketing are fictional; any sites here carry a
disclaimer and exist only to demonstrate the idea.

The LLM is a pluggable dependency: real providers (for a genuine run) or a deterministic provider
(zero-cost). Discovery, tools, DB writes and hooks are always real, in every mode.
