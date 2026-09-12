# cloud-core — Phase A (meeting booking)

Runs `core/server` + Postgres on **Hetzner `lemodesign`** (`100.75.45.22` Tailscale,
`46.225.171.3` public) alongside the client portal and agents door (kamal-proxy).
Portal containers should reach the API at `http://172.18.0.1:8788` (kamal network
gateway → host) or via Tailscale.

> **Migrated 2026-09-09** from DigitalOcean `161.35.86.25` / `100.117.142.79`.
> Older Kamal VPS `209.38.44.246` was retired earlier. See
> [../backsteros-server/README.md](../backsteros-server/README.md).

## Prerequisites

- Docker + Docker Compose on the VPS
- Repo cloned on the VPS (or build image locally and push to a registry)
- Local-core workspace already has scheduling settings and a portal `sk_live_…` key

## First-time setup

1. **Copy env file** on the VPS:

```bash
cp deploy/cloud/.env.example deploy/cloud/.env
# Edit DATABASE_URL (postgres service), CORE_REPLICATION_SECRET, etc.
```

2. **Build and start** (image is built on your Mac — git SSH deps do not install inside Alpine):

```bash
./deploy/cloud/build-image.sh
docker save backsteros-cloud:latest | ssh user@vps 'docker load'
cd deploy/cloud
docker compose up -d
```

Or on the VPS after `docker load`:

```bash
cd deploy/cloud
docker compose up -d
```

3. **Run migrations** (inside the backsteros container):

```bash
docker compose exec backsteros pnpm db:migrate
```

4. **Bootstrap from your laptop** (local-core running, cloud Postgres reachable via SSH tunnel or Tailscale):

```bash
cd core/server
CLOUD_DATABASE_URL=postgresql://backsteros:...@209.38.44.246:5434/backsteros \
  pnpm replication:bootstrap
```

5. **Configure local-core** (`.env` on your Mac):

```env
CORE_REPLICATION_ROLE=local
CORE_REPLICATION_PEER_URL=http://209.38.44.246:8788   # or Tailscale URL
CORE_REPLICATION_SECRET=<same secret as cloud>
CORE_REPLICATION_WORKSPACE_IDS=<your workspace uuid>
```

6. **Point portal** at cloud-core — set Kamal secrets:

- `BACKSTEROS_API_URL=http://172.17.0.1:8788` (Docker bridge on Linux; `host.docker.internal` does not work by default)
- `BACKSTEROS_API_KEY=sk_live_…` (same key bootstrapped to cloud)

Redeploy portal: `kamal deploy` from `client.lemo-design.com`.

## Ops

```bash
# Logs
docker compose -f deploy/cloud/docker-compose.yml logs -f backsteros

# Restart API
docker compose -f deploy/cloud/docker-compose.yml restart backsteros

# Shell
docker compose -f deploy/cloud/docker-compose.yml exec backsteros sh
```

## Env (cloud backsteros service)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | cloud Postgres |
| `CORE_REPLICATION_ROLE` | `cloud` |
| `CORE_REPLICATION_PEER_URL` | local-core URL (Tailscale or tunnel) |
| `CORE_REPLICATION_SECRET` | shared bearer for `/api/v1/internal/replication/*` |
| `CORE_REPLICATION_WORKSPACE_IDS` | comma-separated workspace ids to sync |
| `BACKSTEROS_VAULT_PATH` | `/data/vault` (markdown twin; no PDFs) |
| `GITHUB_API_TOKEN` | Optional PAT for GitHub routes (local-shell desktop + portal API keys) |
| `PORT` | `8788` |

PowerSync and Clerk are **not** required for portal meeting booking (API key auth only).

### Tailscale (instant cloud → local push)

cloud-core runs on **Hetzner `lemodesign`**, already on your tailnet
(`100.75.45.22`). Set:

```env
# cloud .env
CORE_REPLICATION_PEER_URL=http://100.94.74.107:8788   # macbook tailnet IP

# local-core .env
CORE_REPLICATION_PEER_URL=http://100.75.45.22:8788
```

Local-core stays bound to `127.0.0.1`. **Hub** enables Tailscale Serve on API start:

```bash
tailscale serve --bg --tcp=8788 tcp://127.0.0.1:8788
```

That publishes `:8788` on the Mac’s tailnet address only (not LAN/public). Prefer
`--tcp` over `--http` so peers can use the raw Tailscale IP. Manual equivalent if
Hub is not running: the same command; disable with `tailscale serve --tcp=8788 off`.

Cloud can **push** new meetings to local-core right after booking; PowerSync streams
the row to desktop over the existing WebSocket (~1s, no REST polling).

Local dev portal (`localhost:3000` → `127.0.0.1:8788`) writes directly to local-core — no
cloud replication involved.

## Vault markdown twin

Postgres twinning is handled by the replication worker. **Markdown vault** sync
runs on the same tick when local-core has `CORE_REPLICATION_ROLE=local`:

1. **Pull** from cloud (peer newer / missing locally — LWW by `mtimeMs`)
2. **Push** local changes to cloud

So docs created by agents on cloud while the laptop is offline appear on the Mac
after Hub/local-core is back online. PDFs are never synced.

For first fill or repair after drift:

```bash
./deploy/cloud/sync-vault.sh
# optional: DRY_RUN=1 ./deploy/cloud/sync-vault.sh
```

## Phase A replication scope

Bidirectional HTTP sync every ~15s (Phase A started meetings-only; current image syncs
full Tier A/B tables — see docs):

- workspace Tier A/B rows (projects, tasks, documents metadata, api_keys, …)
- meetings + scheduling settings

See [docs/13-hybrid-cloud-local-core.md](../../docs/13-hybrid-cloud-local-core.md).
