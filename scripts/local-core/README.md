# Local-core LaunchAgent

Keeps the optional local replica (Docker compose + API on `127.0.0.1:8788`) up
after reboot and restarts it if the API process dies. Product desktop defaults to
this local-core URL (OS-73); set `VITE_API_URL=https://api.local.backsteros.com`
to talk to cloud via Caddy instead.

The API is **localhost only** — the LaunchAgent does not enable Tailscale serve.

Start logic lives only under `scripts/local-core/`: LaunchAgent `run.sh` (KeepAlive)
and one-shot `ensure-once.sh` (desktop `BACKSTEROS_START_LOCAL_REPLICA=1`). Do not
duplicate spawn/env resolution in Rust beyond calling `ensure-once.sh`.

## Build source (OS-61)

The LaunchAgent runs the API from a **dedicated** git worktree pinned to
`origin/production`, not from the dirty developer checkout:

```text
~/.backsteros/local-core-build
```

Runtime secrets come from `~/.config/backsteros/local-core.env` (copy
`deploy/local-core.env.example`) or `LOCAL_CORE_ENV_FILE` / checkout
`core/server/.env` as fallback. Editing files under
`~/BacksterOS/Projects/OS/Codebase` does **not** change local-core behaviour
until that commit is on `origin/production` and you refresh the build.

### After a cloud-core deploy

```bash
# 1. Refresh the dedicated worktree + contracts build
bash scripts/local-core/update-build.sh

# 2. Reload the LaunchAgent so it restarts from the new tree
bash scripts/local-core/install-launch-agent.sh

# 3. Confirm commits match
curl -fsS http://127.0.0.1:8788/health | jq .version
curl -fsS https://api.local.backsteros.com/health | jq .version   # or your cloud /health
```

Override the build path with `BACKSTEROS_LOCAL_CORE_BUILD` (scratch dirs for
tests). Do not point a half-built scratch tree at the live `:8788` agent.

## Install (once per Mac)

```bash
bash scripts/local-core/update-build.sh
bash scripts/local-core/install-launch-agent.sh
```

Creates `~/Library/LaunchAgents/com.backsteros.local-core.plist` with `RunAtLoad`,
`KeepAlive`, and `ExitTimeOut=30`, pointing at `scripts/local-core/run.sh` inside
the dedicated build worktree.

The supervisor runs `tsx` **without** `watch`, polls `/health` every ~10s, and
exits non-zero after 3 consecutive failures so KeepAlive restarts a dead API
(even if a parent wrapper lingered). SIGTERM uses interruptible sleeps and kills
the child process group so launchd stop/unload leaves no orphans.

`/health` and `/api/v1/health` report `version: { commit, builtAt, dirty }`.
On each replication tick the local core compares that commit with the peer’s
`/health` and ops-alerts **once** per distinct mismatch.

## Logs

- `~/.config/backsteros/desktop/local-core.log` — API + supervisor (copy-truncate
  rotates to `.log.1`…`.log.5` at ~32 MiB while the server keeps writing; override with
  `LOCAL_CORE_LOG_ROTATE_BYTES`).
- `~/.config/backsteros/desktop/local-core.launchd.log` — launchd stdout/stderr
  only (separate so launchd does not hold a handle on the rotated API log).

## OS-49 safeguard

Set `CORE_REPLICATION_SYNC_EVENTS_PULL=0` in `~/.config/backsteros/local-core.env`
when a long-offline replica must not replay leader sync_events with
`updatedAt = now` (see OS-49). Table LWW and vault sync still run.

## Stop / start

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.backsteros.local-core.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.backsteros.local-core.plist
```

Hub can still start/stop the same stack; if the LaunchAgent is loaded, KeepAlive
will bring the API back after a Hub stop unless you boot out the agent first.
