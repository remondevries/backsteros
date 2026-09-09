# backsteros server — consolidated hosting

Single always-on Linux host on your Tailscale tailnet (`backsteros`, `100.117.142.79`,
public `161.35.86.25`). Runs **cloud-core**, the **agents door**, the **client portal**,
and **n8n**. (Appwrite and cloud PowerSync were removed.)

## Services

| Service | Host / port | Notes |
| --- | --- | --- |
| cloud-core API | `:8788` | `deploy/cloud` — Docker; Tailscale peer for replication |
| cloud Postgres | `127.0.0.1:5434` | internal only |
| agents door | `127.0.0.1:3080` | `backsteros-agents.service` → `https://agent.backsteros.com` |
| client portal | `127.0.0.1:3010` | `client.lemo-design.com` |
| n8n | `127.0.0.1:5678` | `automation.backsteros.com` (+ lemo/remon aliases) |

**Portal → cloud-core:** `client-portal.env` must use `BACKSTEROS_API_URL=http://backsteros:8788`
(not `127.0.0.1` — the portal container is isolated from host loopback). The portal compose file
joins the `cloud_default` Docker network so the `backsteros` hostname resolves.

| nginx | Hosts |
| --- | --- |
| Live | `agent.backsteros.com`, `automation.*`, `client.lemo-design.com` |
| 410 Gone | `backsteros.com`, `app.`, `service.`, `sync.` (certs kept) |

## Replication (instant cloud ↔ Mac)

```env
# cloud .env (on server)
CORE_REPLICATION_PEER_URL=http://100.94.74.107:8788

# local-core .env (Mac)
CORE_REPLICATION_PEER_URL=http://100.117.142.79:8788
```

Restart local-core after changing `.env`. No public-internet replication hop.

On the Mac, Hub enables `tailscale serve --tcp=8788` when Core API starts so
cloud can reach `127.0.0.1:8788` via the Mac’s Tailscale IP without binding the
API to `0.0.0.0`.

## Portal deploy (future)

Kamal `config/deploy.yml` points at `161.35.86.25` with `proxy: false`. After `kamal deploy`,
recreate the portal container or update `PORTAL_IMAGE_TAG` in `client-portal.env` and:

```bash
ssh root@100.117.142.79 'cd /root/client-lemo-design-portal && docker compose -f client-portal-compose.yml up -d'
```

## DNS (Cloudflare)

Point the **origin** A record for `client.lemo-design.com` / `.nl` to **`161.35.86.25`**
(was `209.38.44.246`). Orange-cloud proxy is fine; nginx serves HTTP on the origin.

## cloud-core image updates

From your Mac:

```bash
./deploy/cloud/deploy-cloud-core.sh
```

Or manually:

```bash
./deploy/cloud/build-image.sh
docker save backsteros-cloud:latest | ssh root@100.117.142.79 'docker load'
ssh root@100.117.142.79 'cd /root/backsteros/deploy/cloud && docker compose up -d --no-build backsteros'
ssh root@100.117.142.79 'cd /root/backsteros/deploy/cloud && docker compose exec -T backsteros pnpm db:migrate'
```

`deploy-cloud-core.sh` also verifies `crm_groups` replication on cloud and runs
`pnpm prove:crm-powersync-leader` from local-core when done (`SKIP_PROOF=1` to skip).

## Retired

- cloud-core on Kamal VPS `209.38.44.246` — stop after DNS cutover:

```bash
ssh kamal-vps 'cd ~/backsteros/deploy/cloud && docker compose down'
```
