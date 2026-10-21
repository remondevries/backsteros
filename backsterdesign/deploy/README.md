# BacksterDESIGN deploy (`design.lemo-design.com`)

Production target: **`ssh lemodesign`**, public URL
**https://design.lemo-design.com**.

| Host | Role |
| --- | --- |
| Laptop / CI | Build fork bundles + Docker images (`deploy/scripts/build-images.sh`) |
| `ssh lemodesign` | Run compose (`/home/deploy/backsterdesign`) + Caddy TLS |
| `ssh development` | Legacy **stock** Penpot + branding overlay — freeze after cutover |

Do **not** build images on `development` (runtime only).

## 1. Build images (laptop)

Requires Docker, Bash 4+ (`brew install bash` on macOS), and a working
Penpot devenv image (`./manage.sh pull-devenv` if needed).

```bash
# from BacksterOS repo root
IMAGE_TAG=2.18.3 bash backsterdesign/deploy/scripts/build-images.sh
```

This runs `manage.sh` frontend/backend/exporter/mcp release bundles, packages
them into Docker images, and retags to `backsterdesign/*:2.18.3`.

Bundle step is **long** (tens of minutes). Re-run packaging only with
`--skip-bundle` after a successful bundle.

## 2. DNS

Cloudflare zone `lemo-design.com`:

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| A | `design` | lemodesign public IPv4 (`188.34.196.92`) | **DNS only** (grey) |
| AAAA | `design` | lemodesign public IPv6 (optional) | DNS only |

Grey cloud so Caddy can complete Let's Encrypt HTTP-01 on the host.

## 3. Caddy

Append `deploy/caddy/design.lemo-design.com.caddy` to
`/home/deploy/chatwoot/Caddyfile` on lemodesign, then:

```bash
ssh lemodesign 'docker exec lemodesign-caddy-1 caddy validate --config /etc/caddy/Caddyfile && docker exec lemodesign-caddy-1 caddy reload --config /etc/caddy/Caddyfile'
```

## 4. Deploy stack

```bash
IMAGE_TAG=2.18.3 bash backsterdesign/deploy/scripts/deploy-lemodesign.sh
```

Creates `/home/deploy/backsterdesign`, loads images, writes `.env` (secret once),
`docker compose up -d`, then copies `branding/overlay` `backster-brand.css` /
`backster-brand.js` into the frontend container (linked from `index.html` but
not baked into the image). Frontend is on `127.0.0.1:9001`; Caddy exposes HTTPS.

Uploaded media and design file blobs use Cloudflare R2 (`PENPOT_OBJECTS_STORAGE_BACKEND=s3`,
`PENPOT_FILE_DATA_BACKEND=storage`) in the private bucket `backsteros-files`.
Postgres on lemodesign keeps rows and pointers. Set `PENPOT_OBJECTS_STORAGE_S3_*`
and `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in the remote `.env` before
the first `up`. The deploy script does not overwrite those keys.

### Projects / Clients tabs (BacksterOS)

Set `BACKSTEROS_API_KEY` (`sk_live_…`) in the remote `.env`. Deploy writes
`config.js` (`window.backsterosCore`) and mounts it into the frontend container.
Caddy proxies `/backsteros-core/*` to cloud-core origin `http://46.225.171.3:8788`
(see `deploy/caddy/design.lemo-design.com.caddy`). Do not send that hop through
Cloudflare — agent.backsteros.com returns 1010 for lemodesign’s IP. Reload Caddy
after changing the site block.

## 4b. Data vs local devenv

Hosted blobs go to R2; local devenv uses RustFS. Postgres is separate on each
side. Do **not** point local at the production R2 bucket for day-to-day work —
local writes would corrupt live objects.

Staff password can match (`~/.config/secrets/backsterdesign.env` +
`scripts/ensure-staff-account.sh` on local; PREPL on lemodesign for hosted).
Design **files** stay on one side unless you run an explicit one-way migrate.

## 5. Point Tauri / clients

Two tracks (see `desktop/README.md`):

| Command | Penpot |
| --- | --- |
| `pnpm --filter @backsteros/design-desktop tauri:dev` | local `https://localhost:3449` |
| `pnpm --filter @backsteros/design-desktop tauri:dev:hosted` | this host |
| `pnpm --filter @backsteros/design-desktop tauri:build` | this host (installed app) |

```bash
# smoke-test the shell against the live fork after deploy
pnpm --filter @backsteros/design-desktop tauri:dev:hosted
```

## 6. Freeze `ssh development`

After staff + portal use `design.lemo-design.com` successfully:

1. Stop writing new files on `development` Penpot (`ssh development`, compose project `penpot`).
2. Optionally migrate Postgres + assets volumes (separate one-shot; not automated here).
3. Leave the stock stack stopped:

```bash
ssh development 'cd /home/deploy/penpot && docker compose -p penpot down'
```

Do **not** delete volumes until you are sure nothing unique still lives only there.

### Image platform

Build images for **`linux/amd64`** (`DOCKER_DEFAULT_PLATFORM=linux/amd64` is the
default in `deploy/scripts/build-images.sh`). lemodesign is amd64; Mac arm64
images will fail with `exec format error`.

## Layout

```text
backsterdesign/deploy/
├── docker-compose.yaml          # lemodesign stack
├── .env.example
├── caddy/design.lemo-design.com.caddy
├── scripts/build-images.sh
├── scripts/deploy-lemodesign.sh
└── README.md
```
