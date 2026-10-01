# Local-core LaunchAgent

Keeps the optional local replica (Docker compose + API on `127.0.0.1:8788`) up
after reboot and restarts it if the API process dies. Product desktop still talks
to cloud-core by default; this restores the local fast path for CLI / Hub /
Development.

The API is **localhost only** — the LaunchAgent does not enable Tailscale serve.

## Install (once per Mac)

```bash
bash scripts/local-core/install-launch-agent.sh
```

Creates `~/Library/LaunchAgents/com.backsteros.local-core.plist` with `RunAtLoad`,
`KeepAlive`, and `ExitTimeOut=30`, pointing at `scripts/local-core/run.sh`.

The supervisor runs `tsx` **without** `watch`, polls `/health` every ~10s, and
exits non-zero after 3 consecutive failures so KeepAlive restarts a dead API
(even if a parent wrapper lingered). SIGTERM uses interruptible sleeps and kills
the child process group so launchd stop/unload leaves no orphans.

## Logs

- `~/.config/backsteros/desktop/local-core.log` — API + supervisor (copy-truncate
  rotates to `.log.prev` at ~32 MiB while the server keeps writing; override with
  `LOCAL_CORE_LOG_ROTATE_BYTES`).
- `~/.config/backsteros/desktop/local-core.launchd.log` — launchd stdout/stderr
  only (separate so launchd does not hold a handle on the rotated API log).

## OS-49 safeguard

The LaunchAgent sets `CORE_REPLICATION_SYNC_EVENTS_PULL=0` so a long-offline
replica does not replay leader sync_events with `updatedAt = now` (see OS-49).
Table LWW and vault sync still run. Re-enable after OS-49 is fixed.

## Stop / start

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.backsteros.local-core.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.backsteros.local-core.plist
```

Hub can still start/stop the same stack; if the LaunchAgent is loaded, KeepAlive
will bring the API back after a Hub stop unless you boot out the agent first.
