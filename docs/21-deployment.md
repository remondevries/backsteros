# 21 · Deployment

**Status:** Decision record — deploy CLI not built yet (agreed in the 13 Oct 2026 review). Nothing in this doc is implemented.
**Execution:** BacksterOS task "Build the deploy CLI (full + per-section deployments)" (project OS).
**Related:** [20-repo-structure.md](20-repo-structure.md) (folder layout, `deploy/` gap), [19-penpot-integration.md](19-penpot-integration.md) (BacksterDESIGN / Penpot), [05-clients.md](05-clients.md), [11-urls-and-routing.md](11-urls-and-routing.md), [ADR-035](10-decisions-log.md), `deploy/cloud/README.md`, `deploy/backsteros-server/README.md`.

## 1. Goal

One deploy entrypoint: `deploy/deploy` (also exposed as `pnpm deploy`).

| Command | What it does |
| --- | --- |
| `deploy` / `deploy --all` | **Full** — everything: all server sections **and** client releases (backsteros desktop, mobile, backsterdev). |
| `deploy --server` | Server sections only. No client releases. |
| `deploy --<section>` | One section. Sections: `core`, `agents`, `portal`, `backsterdesign`, `backstermeet`, `backsteros`, `mobile`, `backsterdev`. |
| `deploy --list` | List sections, their targets and steps. |
| `deploy --dry-run` | Print the plan, change nothing. |
| `deploy --target <server>` | Override the target box (alias from `deploy/targets.env`). |
| `deploy --tag <sha>` | Deploy an existing image tag (rollback). |
| `deploy --skip-build` | Reuse the last built artifact. |
| `deploy --skip-proof` | Skip the post-deploy proof/check. |
| `deploy --core --powersync` | Also run the PowerSync setup/render/profile-up steps for core. |

Flags combine, e.g. `deploy --core --agents`.

## 2. Current state (13 Oct 2026)

Only cloud-core is scripted. Everything else is manual or has no deploy path.

- **`deploy/cloud/deploy-cloud-core.sh`** (bash): builds the image, `docker save | ssh docker load`, restarts the container, runs migrations, health-checks. No registry; always tags `latest` → **no rollback**. PowerSync is a manual runbook, not in the script.
- **Inventory of `deploy/`:**
  - `cloud/` — Dockerfile, `build-image.sh`, `deploy-cloud-core.sh`, `docker-compose.yml`, `render-powersync-config.mjs`, `run-deploy.command`, `sync-vault.sh`, `finish-tailscale-replication.sh`, `.env.example`, README.
  - `backsteros-server/` — Hetzner host notes, client-portal compose + nginx configs.
  - `powersync/` — local PowerSync config (`service.local.yaml`, `sync-config.yaml`, `init-local.sql`).
  - Root env templates — `local-core.env.example`, `dynamic-island/backsteros.env.example`.
- **Client portal** is built and deployed from the separate `client.lemo-design.com` repo via Kamal / GHCR.
- **backsteros desktop + mobile** are client releases (CI tags / EAS).
- **No deploy path in `deploy/` today:** agents door, backsterdev, backsterdesign (Penpot), backstermeet.

## 3. Server map

All three are Hetzner boxes.

| Alias | IP | Tailscale | Role | DNS |
| --- | --- | --- | --- | --- |
| `production` / `hetzner` | 46.225.171.3 | 100.75.45.22 | cloud-core, agents door, n8n, LiveKit | lemo-design.com |
| `lemodesign` | 188.34.196.92 (CX33) | 100.83.125.67 | Chatwoot + client portal; **Penpot will move here** | client.lemo-design.com, support-api.lemo-design.com |
| `development` | 2.31.59.251 (CX23) | 100.126.31.97 | Penpot (today — removed once moved to lemodesign) | — |

> The earlier "lemodesign conflict" was loose doc wording. The SSH alias `lemodesign` → 188.34.196.92 is correct. Some deploy docs wrongly use "lemodesign" for the production box (46.225.171.3) — see §7.

## 4. Per-section plan

| Section | Kind | Target | Steps |
| --- | --- | --- | --- |
| `core` | server | production | Build cloud image (tag by commit sha + `latest`), ship with `docker save \| ssh` (kept), compose up backsteros, run migrations, `/health`. `--powersync` adds the PowerSync setup/render/profile-up steps (manual today). |
| `agents` | server | production | Build `@backsteros/agents`, rsync dist to `/srv/backsteros/agents`, `systemctl restart backsteros-agents`, verify `agent.backsteros.com`. *Open: own section vs folded into core.* |
| `portal` | server | lemodesign | Built in the `client.lemo-design.com` repo; here at most `compose pull` a tag + `compose up -d`. *Open: include it at all.* |
| `backsterdesign` | server + client | lemodesign | Two things: **(a)** deploy the Penpot server stack to `ssh lemodesign` (188.34.196.92): build fork images on Mac or CI, push to **GHCR via gh token** (bigger images, need rollback), pull on lemodesign, `up -d`, apply branding, health. **(b)** Build the Tauri desktop app update (Penpot desktop wrapper). Penpot moves fully to lemodesign and is removed from `development` afterwards. |
| `backstermeet` | client (+ server) | production (LiveKit) | Tauri client app → mostly a client release. Server piece is LiveKit only; its `livekit.yaml` is not in the repo yet. |
| `backsteros` | client | CI | `desktop-release.yml`, tag `desktop-v*`. |
| `mobile` | client | EAS | EAS build/submit. |
| `backsterdev` | client | CI | backsterdev's own nested workflows. |

`--all` triggers the client sections; `--server` does not.

## 5. Agreed cross-cutting decisions

1. **Image transport:** cloud-core keeps `docker save | ssh`. Penpot fork images use GHCR (gh token, same rule as Kamal / Quarrymill).
2. **Server config from git:** deploys rsync `deploy/<box>/*` (excluding `.env`) to the server so config stops drifting by hand.
3. **Image tags by commit sha** so `deploy --core --tag <sha>` and Penpot rollback work.
4. **New files this needs:**
   - `deploy/deploy` — entrypoint.
   - `deploy/targets.env` — alias names; never the ambiguous "lemodesign" for the wrong box.
   - `deploy/sections/<name>.sh` — one manifest per section (build / ship / restart / verify).
   - systemd unit for agents, in the repo.
   - Penpot compose + env example under `backsterdesign/deploy/`.
   - Possibly `deploy/livekit/` (LiveKit config).

## 6. Open decisions

1. `agents` as its own section vs folded into `core` (doc 20 may move `agents/` under `core/`).
2. Whether `deploy --core` also refreshes the Mac local-core (`scripts/local-core/update-build.sh`).
3. Keep `prove:crm-powersync-leader` as the default post-deploy check, or make it opt-in.
4. Cleanup of stale `finish-tailscale-replication.sh`, nginx configs, `run-deploy.command` (always `SKIP_BUILD=1`), and "Hub" mentions in deploy docs.
5. Whether `portal` is in scope.

## 7. Stale references to fix

After the folder rename / server naming:

| Where | Problem |
| --- | --- |
| `deploy/cloud/README.md`, `deploy/backsteros-server/README.md`, `deploy/cloud/.env.example` | Call 46.225.171.3 (production) "lemodesign" and/or "Hub". |
| `deploy/cloud/deploy-cloud-core.sh` | Comment says default target is `backsteros.com`; code uses `hetzner`. |
| `deploy/cloud/sync-vault.sh` | Uses the retired DigitalOcean IP. |
| `deploy/cloud/finish-tailscale-replication.sh` | Outdated. |
| `backsterdesign/deploy/README.md` | Says `design/branding`; should be `backsterdesign/branding`. |
| `docs/20-repo-structure.md` §5 | Says agents runs on Hetzner "lemodesign"; it runs on `production` (46.225.171.3). |

## 8. Non-goals

- No change to runtime topology (ADR-035 still holds).
- No new registry for cloud-core.
