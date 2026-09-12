# backsteros server — consolidated hosting

Single always-on Linux host on **Hetzner** (`lemodesign`, Tailscale `100.75.45.22`,
public `46.225.171.3`). Runs **cloud-core**, the **agents door**, the **client portal**,
**n8n**, and other Kamal sites.

> **Migrated 2026-09-09** from DigitalOcean droplet `161.35.86.25` / Tailscale
> `100.117.142.79`. That host was **powered off 2026-09-10** after cutover.
> Destroy droplet id **548906624** in the DigitalOcean console to stop billing
> (no DO API token was available to agents).

## Services

| Service | Host / port | Notes |
| --- | --- | --- |
| cloud-core API | `:8788` | `deploy/cloud` — Docker; Tailscale peer for replication |
| cloud Postgres | `127.0.0.1:5434` | internal only |
| agents door | `0.0.0.0:3080` | `backsteros-agents.service` → `https://agent.backsteros.com` via **kamal-proxy** |
| client portal | kamal-proxy | `client.lemo-design.com` |
| n8n | kamal-proxy | `automation.backsteros.com` (+ lemo/remon aliases) |

**Portal → cloud-core:** Kamal env should use `BACKSTEROS_API_URL=http://172.18.0.1:8788`
(kamal network gateway → host). Redeploy the portal after changing env so the
container picks it up.

| Edge | Hosts |
| --- | --- |
| kamal-proxy (live) | `agent.backsteros.com`, `automation.*`, `client.lemo-design.com`, marketing sites |
| Retired 410 | historically on DO nginx for `backsteros.com`, `app.`, `service.`, `sync.` |

## Replication (instant cloud ↔ Mac)

```env
# cloud .env (on Hetzner)
CORE_REPLICATION_PEER_URL=http://100.94.74.107:8788

# local-core .env (Mac)
CORE_REPLICATION_PEER_URL=http://100.75.45.22:8788
```

Restart local-core after changing `.env`. No public-internet replication hop.

On the Mac, Hub enables `tailscale serve --tcp=8788` when Core API starts so
cloud can reach `127.0.0.1:8788` via the Mac’s Tailscale IP without binding the
API to `0.0.0.0`.

## DNS (Cloudflare)

| Host | Origin A |
| --- | --- |
| `agent.backsteros.com` | `46.225.171.3` (proxied) |
| Most lemo/remon/automation hosts | `46.225.171.3` |

## cloud-core image updates

From your Mac:

```bash
./deploy/cloud/deploy-cloud-core.sh
```

Or manually:

```bash
./deploy/cloud/build-image.sh
docker save backsteros-cloud:latest | ssh root@46.225.171.3 'docker load'
# or: ssh backsteros.com '…' after ~/.ssh/config HostName points at Hetzner
ssh root@46.225.171.3 'cd /root/backsteros/deploy/cloud && docker compose up -d --no-build backsteros'
ssh root@46.225.171.3 'cd /root/backsteros/deploy/cloud && docker compose exec -T backsteros pnpm db:migrate'
```

## Retired

- DigitalOcean `161.35.86.25` / `100.117.142.79` — cloud-core + agents stopped after cutover
- Older Kamal VPS `209.38.44.246` — already retired
