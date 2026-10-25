# backsteros server — consolidated hosting

All always-on BacksterOS services run on **`lemodesign`** (Hetzner, public
`188.34.196.92`, Tailscale `100.83.125.67`): **cloud-core**, cloud **PowerSync**,
the **agents door**, the **client portal**, LiveKit, and Penpot. Edge is **Caddy**
(`lemodesign-caddy-1`).

The other Hetzner host (`hetzner` / `production`, `46.225.171.3`) is **not** a
BacksterOS target — it runs kamal-proxy, n8n, WordPress, and the Kamal builder.
`verify-local-cloud-parity.sh` refuses to run against it.

Host map and release flow: [`docs/21-deployment.md`](../../docs/21-deployment.md).

## Services (lemodesign)

| Service | Host / port | Notes |
| --- | --- | --- |
| cloud-core API | `:8788` | `deploy/cloud` (`/root/backsteros/deploy/cloud`) — container `cloud-backsteros-1`; Tailscale peer for replication |
| cloud Postgres | `cloud-postgres-1` | internal only |
| cloud PowerSync | `cloud-powersync-1` (+ `cloud-mongo-1`) | compose profile `powersync`; `deploy-cloud-core.sh --powersync` |
| agents door | `172.18.0.1:3080` | `backsteros-agents.service` at `/srv/backsteros/agents` → `https://agent.backsteros.com` via Caddy |
| client portal | Caddy | `client.lemo-design.com` (container `client-lemo-design-portal`) |

**Portal → cloud-core:** use `BACKSTEROS_API_URL=http://172.18.0.1:8788` (Docker
bridge gateway → host). Recreate the portal container after changing env.

## Replication (instant cloud ↔ Mac)

```env
# cloud .env (lemodesign)
CORE_REPLICATION_PEER_URL=http://100.94.74.107:8788

# local-core .env (Mac)
CORE_REPLICATION_PEER_URL=http://100.83.125.67:8788
```

Restart local-core after changing `.env`. No public-internet replication hop.

On the Mac, Hub enables `tailscale serve --tcp=8788` when Core API starts so
cloud can reach `127.0.0.1:8788` via the Mac’s Tailscale IP without binding the
API to `0.0.0.0`.

## Deploying

From the repo root on your Mac:

```bash
./deploy/cloud/deploy-cloud-core.sh              # image + migrate + restart
./deploy/cloud/deploy-cloud-core.sh --powersync  # also sync-config + PowerSync restart
./deploy/cloud/deploy-cloud-core.sh --rollback=<sha-tag>
./deploy/agents/deploy-agents.sh                 # agents door (supports --rollback)
pnpm deploy:check --fetch                        # local, cloud, agents on origin/production?
```

Do not hand-run `docker save | ssh …` — the scripts tag images by commit, migrate,
and finish with `deploy:check`.

## Retired

- Hetzner `46.225.171.3` / Tailscale `100.75.45.22` as BacksterOS host — services moved to lemodesign
- DigitalOcean `161.35.86.25` / `100.117.142.79` — powered off 2026-09-10
- Older Kamal VPS `209.38.44.246` — already retired
