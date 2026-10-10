# BacksterDEV remote hosts (Tailscale)

Maintainer notes for attaching Linux Tailscale hosts to BacksterDEV so agents can
run there for diagnostics and maintenance. Pairing UX lives in
[remote access](../user/remote-access.md). Control-API environment selection is
documented in [backsteros-control-api](../internals/backsteros-control-api.md)
(BDV-56).

## Hosts

| Tailscale name | Tailscale IP    | Role                         | T3 listen                         | Notes                                     |
| -------------- | --------------- | ---------------------------- | --------------------------------- | ----------------------------------------- |
| `development`  | `100.126.31.97` | Dedicated agent / smoke host | `0.0.0.0:3773` (`t3code.service`) | Paired; small disk footprint              |
| `production`   | `100.75.45.22`  | CX43 VPS (cloud-core, sites) | none yet                          | 85% disk, many containers — install gated |

`lemodesign` (`100.83.125.67`) is a separate Tailscale node; do not treat it as
`production`.

## Development (reference)

Already running as user `deploy`:

- `T3CODE_HOME=/home/deploy/.t3` (~240 MB including runtime `0.0.44`)
- systemd user unit `t3code.service` with `T3CODE_HOST=0.0.0.0`
- Provider: Cursor (`cursor-agent` on `PATH` via `~/.local/bin`)
- Smoke workspace: `/home/deploy/agent-smoke`

Pair from BacksterDEV: **Settings → Connections → Add environment → Remote
link**, host `http://100.126.31.97:3773`, using a pairing code from
`t3 pair` on the host (or the one-time URL it prints).

## Production (planned)

### Why gated

Read-only check (2026-10-10):

- Disk: `/` 150 G, **85% used**, ~23 G free
- Docker: ~78 running containers; `docker system df` showed ~37 GB images
  (~15 GB reclaimable) and ~44 GB volumes
- Memory: 15 Gi RAM, swap nearly full — headroom is thin
- No `~/.t3`, no `t3` binary, no provider CLIs under `deploy`

Installing the CLI + runtime is on the order of a few hundred MB (development
is ~240 MB), but providers and caches grow. Do **not** install or prune Docker
on this box without Remon’s OK.

### Proposed install (after approval)

Mirror development, pinned and disk-conscious:

```bash
# on production as deploy, after Remon approves
curl -fsSL https://t3.codes/install.sh | T3CODE_VERSION=0.0.44 sh
# ensure ~/.local/bin on PATH for non-interactive shells
t3 service install
# bind Tailscale / all interfaces like development
mkdir -p ~/.config/systemd/user/t3code.service.d
printf '%s\n' '[Service]' 'Environment=T3CODE_HOST=0.0.0.0' \
  > ~/.config/systemd/user/t3code.service.d/override.conf
systemctl --user daemon-reload
systemctl --user restart t3code.service
# linger so it survives logout (needs sudo once)
sudo loginctl enable-linger deploy
```

Then install only the provider(s) Remon wants (Cursor CLI at minimum for
parity with development). Prefer a tiny workspace such as
`/home/deploy/agent-smoke` for control-API smoke tests — do not point agents at
live site trees unless that is the job.

Optional disk relief **only if Remon asks**: unused Docker images
(`docker image prune` / review reclaimable from `docker system df`). Do not
blind-prune volumes.

### Pair into BacksterDEV

1. On production: `t3 pair` (or Settings on a connected client) → copy URL /
   code for `http://100.75.45.22:3773`.
2. On the Mac: BacksterDEV **Settings → Connections → Add environment**, paste
   that remote link.
3. Confirm the environment label is clearly `production` (not a leftover
   `lemodesign` name).
4. After BDV-56 lands, list remotes via
   `GET /api/backsteros/control/environments` and start sessions with
   `"environment": "production"` (and a `workspaceRoot` that exists on the
   VPS).

## Caution for agents on production

- Prefer read-only diagnostics (`df`, `docker ps`, `ss`, logs).
- Avoid bulk image pulls, `npm ci` of large trees, or long-running builds unless
  the task requires them and disk/memory allow.
- Cloud-core and site containers are live traffic — treat the box as production.
