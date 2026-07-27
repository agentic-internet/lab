# agentic-internet / lab

Runnable demos for the idea explored in
[agentic-internet](https://github.com/agentic-internet/agentic-internet): what happens when a
company's internal agent needs something from **another** company, and that company publishes what
it can do at `/.well-known/agent`.

**Not real companies.** Acme Telecom (operator) and Globex Marketing (subscriber) are fictional and
carry a disclaimer; they exist only to make the idea concrete.

## The demo, in one scenario

A Globex employee (Jordan Blake, line GLX-4471) asks the internal assistant to upgrade their mobile
plan. Globex can't change the line itself — that belongs to the operator, Acme Telecom. The demo
shows two ways that gets resolved, switchable from one Admin setting:

- **Agent → Human (today).** Operations escalates to a manager for approval, then a human logs into
  Acme's **business portal** and changes the plan by hand. Bespoke and brittle.
- **Agent → Agent (proposed).** Operations' assistant reaches Acme's **published agent**: discovers
  it (`robots.txt → /.well-known/agent → capabilities`), reads what it can do and on what terms,
  fetches the tariff options, escalates to a manager *with those options*, and — once the manager
  picks one and approves — performs the change agent-to-agent. No prior integration.

Either way a **human stays the decision-maker** (the manager). The difference is only *how* the
cross-company action happens.

Everything is real and observable: real discovery, real MCP calls, real DB writes, a real
PreToolUse guardrail. Only the LLM is pluggable.

## What you can open (Globex — globex.salginci.com)

- **Employee** (`/`) — the assistant. Ask "what plan am I on?" (it queries the internal MCP) or ask
  to upgrade (it opens a ticket).
- **Operations** (`/ops`) — pick a task, chat with the ops assistant. It escalates to a manager and,
  depending on the flow, either points you to Acme's portal or completes the change agent-to-agent.
- **Manager** (`/manager`) — the confirmation queue. Approve (choosing a package when options are
  offered) or reject.
- **Admin ↗** — Acme's business portal, where a Globex operator manages its employees' lines by hand.
- **Settings** (`/control`) — operator-only: the resolution flow (Agent→Agent / Agent→Human),
  live-vs-deterministic, the model provider (Anthropic / OpenAI / Gemini / DeepSeek), a daily cap,
  and reset.
- **Data** (`/db`) — the live ticket store. Acme's own site (`acme-telecom.salginci.com`) has its
  Home, Business portal, Data, and the published `/.well-known/agent`.

### The log panel

Every screen has a live log of **everything the agent actually does**. Click any line for its
request/response. The channels:

`🧠 reasoning` · `⚙️ pre-tool` (a PreToolUse gate that can block) · `🔌 mcp` (internal) ·
`🌐 discovery` (the other organization's agent) · `🤖 agent` (what it understood, and which
capability it matched *by meaning*) · `🚧 boundary` · `🔧 tool` · `🛑 policy` · `💬 assistant`.

## Layout

This is a monorepo. The reusable core is in `packages/`; the apps are under `demos/`. Every app uses
the same core — the whole point is one convention.

```
packages/
  shared/               the capability contract (Zod) — one source of truth
  capability-manifest/  publish robots.txt + /.well-known/agent + capability files
  capability-client/    discover an org's agent from a bare domain, and call its capabilities
  agent-core/           the agent loop; pluggable LLM (Anthropic / OpenAI / Gemini / DeepSeek /
                        deterministic) + a PreToolUse hook
  mcp-servers/          Globex's internal MCP directory (line + current plan)
demos/telecom/
  acme-telecom/         the operator: site, robots.txt, /.well-known/agent, its agent endpoint,
                        the business portal + tariff store (a sliding window keeps a plan always
                        upgradeable, so repeated demos never need a reset)
  globex-marketing/     the subscriber: employee assistant, operations, manager, settings, data
```

The LLM is a pluggable dependency: a real provider (genuine run) or a deterministic one (zero cost).
Discovery, MCP, DB writes and the guardrail are always real, in every mode.

## Run it

Locally:

```
pnpm install
pnpm --filter @ail/acme-telecom     dev     # :3001
pnpm --filter @ail/globex-marketing dev     # :3002  → open http://localhost:3002/guide
```

Deterministic by default (zero cost). For a real model set a key (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `GEMINI_API_KEY`, or `DEEPSEEK_API_KEY`) and switch to Live in Settings.

Deploy (Docker): see [DEPLOY.md](DEPLOY.md).

## The open question

How the calling agent authenticates to the operator's agent is **stubbed** — the demo says so out
loud in the log. It's the honest hard part, discussed in the notebook.
