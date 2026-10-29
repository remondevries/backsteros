# Development server (OS-148)

Run **core API + BacksterOS web (Vite)** on the Ubuntu development box
(Tailscale `100.126.31.97` / MagicDNS `development`) against a **fresh local**
Postgres. This stack must never talk to live cores
(`agent.backsteros.com`, lemodesign, production).

## Preferred URL (HTTPS, same-origin)

Ops nginx (tailnet-only, **do not edit** `/etc/nginx/sites-available/dev-os`)
terminates TLS and routes:

| Path | Upstream |
| --- | --- |
| `/` | Vite `100.126.31.97:1420` |
| `/api/`, `/health` | core `100.126.31.97:8788` |
| `/powersync/` | PowerSync `127.0.0.1:8080/` (prefix stripped) |

Open: **https://dev-os.lemo-design.com/**

Same-origin HTTPS is required for PowerSync (OPFS / workers need a secure
context). Cleartext `http://100.126.31.97:1420` still loads the UI but sync is
impaired.

## Hard bind rules

App processes listen on `127.0.0.1` and/or Tailscale `100.126.31.97` only.
Never `0.0.0.0` or the public IP `2.31.59.251`. Do not change ufw, SSH,
Tailscale, or the nginx site from this workflow.

| Service | Bind |
| --- | --- |
| Postgres | `127.0.0.1:5433` |
| PowerSync | `127.0.0.1:8080` and `100.126.31.97:8080` |
| Core API | `100.126.31.97:8788` |
| Vite web | `100.126.31.97:1420` (HMR via `wss` on the public host:443) |

## Quick start

```bash
cd ~/BacksterOS
bash scripts/dev-server.sh up      # env upsert, compose, migrate, seed, tmux
bash scripts/dev-server.sh status
bash scripts/dev-server.sh down    # stop API/Vite + containers (keep DB volume)
bash scripts/dev-server.sh reset   # wipe DB volumes, reseed, restart
bash scripts/dev-server.sh logs    # attach tmux session `backsteros-dev`
```

Compose project name: `backsteros-devserver` (never the live `backsteros` project).
Files: `docker-compose.yml` + `docker-compose.dev-server.yml`.

## URLs

| What | URL |
| --- | --- |
| Web UI (preferred) | https://dev-os.lemo-design.com/ |
| API health | https://dev-os.lemo-design.com/health |
| OpenAPI | https://dev-os.lemo-design.com/api/v1/openapi.json |
| PowerSync | https://dev-os.lemo-design.com/powersync/ |
| Direct Vite | http://100.126.31.97:1420/ |
| Direct API | http://100.126.31.97:8788/health |

## Login / seed user

There is **no password sign-in** on local-core. The web app uses the
**local-shell** bearer `local` automatically when
`VITE_TREAT_API_AS_LOCAL_CORE=1` and `VITE_DEV_SERVER_HOST=dev-os.lemo-design.com`
(or a Tailscale `:8788` URL).

`db:seed` prints a one-time `sk_access_…` / `sk_live_…` bootstrap API key (for
curl/CLI). On this box the last seed wrote it to
`.dev-server-logs/bootstrap-api-key.txt` (gitignored, mode 600).
`db:seed-demo` creates project **DEMO** with a few sample tasks (idempotent).

## Env files (gitignored)

`scripts/dev-server.sh up` upserts keys from `deploy/dev-server.env.example`:

| Path | Purpose |
| --- | --- |
| `.env.development` | Compose `POSTGRES_*` + project name |
| `core/server/.env` | API, DB, PowerSync JWT, `POWERSYNC_URL=https://…/powersync`, CORS |
| `backsteros/.env` | `VITE_API_URL`, `VITE_TREAT_API_AS_LOCAL_CORE`, `VITE_DEV_SERVER_HOST`, `DEV_PUBLIC_HOST` |

`DEV_PUBLIC_HOST` / `VITE_DEV_SERVER_HOST` make Vite allow the HTTPS host and
use `wss` HMR on client port 443. Leave them unset on Mac — behaviour unchanged.

Vault files live under `~/.backsteros/dev-server-vault/` (not the live vault).
Logs: `.dev-server-logs/` and the tmux session `backsteros-dev`.

## Survival across logout

API + Vite run in **tmux** session `backsteros-dev` (user linger is enabled on
this host). Docker services use `restart: unless-stopped`. After reboot:

```bash
bash scripts/dev-server.sh up
```

## What this stack deliberately skips

- `backsterdev/` (T3 Code desktop) — leave alone
- Mobile / Expo
- Core replication to cloud-core
- R2 / production secrets / Infisical live keys
- Live LaunchAgent project name `backsteros`
- Editing nginx / ufw / Tailscale / SSH

## Known gaps

- **RAM (3.7 GB):** Postgres + Mongo + PowerSync + Node API + Vite is tight.
  Prefer `dev-server.sh` filtered installs; avoid starting mobile/backsterdev.
  A temporary `/swapfile-dev` (2 GiB) may be present for install/build.
- **`build-essential`** is required once so `node-pty` can compile (desktop
  package postinstall); not needed at runtime for browser-only testing.
- **Linux CSS casing:** `backsteros/src/app.css` must be lowercase (macOS
  previously tolerated `App.css`).
- **No Clerk / portal login** — local-shell only.
- **Letter PDFs / vault-heavy features** need files under the local vault path;
  demo seed skips vault side effects.
- **Integrations** (AgentMail, Whoop, Brandfetch, GitHub, …) are unset.
- **OS-148 status on live BacksterOS** cannot be flipped from this box without
  talking to cloud-core (forbidden by the task rules).

## Manual pieces (if not using the script)

```bash
export BACKSTEROS_COMPOSE_PROJECT=backsteros-devserver COMPOSE_PROJECT_NAME=backsteros-devserver
docker compose -f docker-compose.yml -f docker-compose.dev-server.yml --env-file .env.development up -d
pnpm --filter @backsteros/server db:migrate
pnpm --filter @backsteros/server db:powersync-setup
pnpm --filter @backsteros/server db:seed
pnpm --filter @backsteros/server db:seed-demo
pnpm --filter @backsteros/server dev
cd backsteros && TAURI_DEV_HOST=100.126.31.97 DEV_PUBLIC_HOST=dev-os.lemo-design.com pnpm run dev:browser
```
