# Local-core LaunchAgent

Keeps the optional local replica (Docker compose + API on `:8788`) up after reboot
and restarts it if the API process dies. Product desktop still talks to cloud-core
by default; this restores the local fast path for CLI / Hub / Development.

## Install (once per Mac)

```bash
bash scripts/local-core/install-launch-agent.sh
```

Creates `~/Library/LaunchAgents/com.backsteros.local-core.plist` with `RunAtLoad`
and `KeepAlive`, pointing at `scripts/local-core/run.sh`.

## Logs

`~/.config/backsteros/desktop/local-core.log` (rotates to `.log.prev` at ~32 MiB).

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
