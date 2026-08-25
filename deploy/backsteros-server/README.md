# backsteros server — consolidated hosting

Single always-on Linux host on your Tailscale tailnet (`backsteros`, `100.117.142.79`,
public `161.35.86.25`). Runs Appwrite, PowerSync, **cloud-core**, and the **client portal**.

## Services

| Service | Host port | Notes |
| --- | --- | --- |
| cloud-core API | `8788` (all interfaces) | `/root/backsteros/deploy/cloud` — `docker compose` |
| cloud Postgres | `127.0.0.1:5434` | internal only |
| client portal | `127.0.0.1:3010` | `/root/client-lemo-design-portal` |

**Portal → cloud-core:** `client-portal.env` must use `BACKSTEROS_API_URL=http://backsteros:8788`
(not `127.0.0.1` — the portal container is isolated from host loopback). The portal compose file
joins the `cloud_default` Docker network so the `backsteros` hostname resolves.

| nginx | `80` / `443` | `client.lemo-design.com` → portal |

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
./deploy/cloud/build-image.sh
docker save backsteros-cloud:latest | ssh root@100.117.142.79 'docker load'
ssh root@100.117.142.79 'cd /root/backsteros/deploy/cloud && docker compose up -d --no-build backsteros'
```

## Retired

- cloud-core on Kamal VPS `209.38.44.246` — stop after DNS cutover:

```bash
ssh kamal-vps 'cd ~/backsteros/deploy/cloud && docker compose down'
```
