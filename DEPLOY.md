# Deploy

Two sites, behind Caddy (automatic HTTPS), on one server:

- `acme-telecom.salginci.com` → the operator (Acme Telecom)
- `globex.salginci.com` → the subscriber (Globex Marketing)

## 1. DNS (done)

```
acme-telecom.salginci.com   A   <server-ip>
globex.salginci.com         A   <server-ip>
```

## 2. Server prerequisites

- Docker + Docker Compose
- Ports 80 and 443 reachable from the internet (Caddy needs them for HTTPS)

## 3. Deploy

```bash
git clone https://github.com/agentic-internet/lab.git
cd lab
cp .env.example .env        # optional: set CONTROL_PASSWORD, ANTHROPIC_API_KEY
docker compose up -d --build
```

Caddy provisions HTTPS certificates automatically on first run (give it a minute).

## 4. Verify

- https://globex.salginci.com/guide — the walk-through
- https://globex.salginci.com/ops — flip the toggle, resolve a ticket both ways
- https://acme-telecom.salginci.com/.well-known/agent — what any agent reads
- https://globex.salginci.com/control — password from `.env` (default `demo`)

## Live model (optional)

The demo runs deterministically (zero cost) by default. To use a real model:

1. Put `ANTHROPIC_API_KEY=...` in `.env`
2. `docker compose up -d` (recreates Globex with the key)
3. On `/control`: switch to **Live** + **Anthropic**

## Notes

- State (tickets, tariffs) lives inside the containers and resets on restart — a
  clean slate for each demo. The `/control` page also has a one-click reset.
- To update: `git pull && docker compose up -d --build`.
- No Docker? Run each app with `pnpm install && pnpm --filter @ail/<app> build &&
  pnpm --filter @ail/<app> start` (set `PUBLIC_URL` for acme, `ACME_URL` +
  `NEXT_PUBLIC_ACME_URL` for globex) and point your own reverse proxy at ports
  3001 / 3002.
