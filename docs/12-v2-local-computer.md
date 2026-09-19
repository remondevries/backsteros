# v2 — local-computer core

## Model

BacksterOS v2 runs **core** on a **local computer** (any always-on workstation you control — do not hard-code machine names like “Mac mini” in docs).

```text
local computer
  · hub/ (optional menu-bar stop, plus PTY and Expo)
  · core/server (API)
  · Postgres
  · files / object storage
  · PowerSync
  · PTY sidecar (agents)

shells (UI only)
  · mobile/  — Expo (iPhone + iPad, adaptive layouts)
  · desktop/ — Tauri + React (macOS)
```

Shells reach core via localhost or Tailscale. Public hosting portals (Next.js) are a later concern.

**Today:** Opening desktop does **not** start Docker. The optional replica starts from Hub, or from the desktop process only when `BACKSTEROS_START_LOCAL_REPLICA=1`. iOS is not on cloud-core yet.

**Target (ADR-035 addendum, 2026-09-19):** Product desktop syncs its PowerSync client SQLite to cloud PowerSync and does not start Docker. The compose stack is an optional replica (Hub or an explicit flag). iOS talks only to cloud-core. Shared files live in private R2; this computer keeps a local working copy. Hub still owns PTY and Expo. See [17-desktop-without-docker.md](17-desktop-without-docker.md).

### Starting local services

**Current code:** Opening the desktop app does **not** start Docker. Hub ([`hub/`](../hub/README.md)) can still start and stop that stack, and it still starts PTY (`:3101`) and Expo. Set `BACKSTEROS_START_LOCAL_REPLICA=1` if the desktop process itself should bring compose and `:8788` up. Product desktop does **not** embed the API process inside the UI, and it does not start PTY or Metro.

## Layout

See [STRUCTURE.md](../STRUCTURE.md). Shared non-UI packages live under `core/packages/`. Desktop UI lives under `desktop/packages/ui/` and is **not** shared with mobile.

## Non-goals (for now)

- Hetzner / Sevalla-style client hosting dashboard
- Next.js product web as a BacksterOS shell
- Shared visual component library across Expo and Tauri
- Developing / reviving archived v1 Next apps (`~/code/archive/backsteros-legacy/`)
- Agent terminals on **public** internet hosts (PTY stays on the local computer)
- Storing PTY process ids in core — only the Cursor `agentChatId` is synced on the task

Trusted shells on the Tailscale network (desktop localhost + **iPad**) may attach to the local-computer PTY sidecar. **iPhone agent TUI is deferred.**

## Agent sessions (local computer + Tailscale)

The `pnpm --filter @backsteros/desktop pty` sidecar owns long-lived **Cursor ACP** agent sessions for **mobile** (T3-style). Closing a Chat WebSocket only **detaches** the viewer; the ACP session keeps running and the sidecar keeps projecting the turn into the shared transcript store.

**Chat = ACP only (ADR-025, mobile):** prompts, streaming, mode (`session/set_mode`), cancel, and permissions go through Cursor ACP. There is **no shared agent TTY pane**. Switching tasks does not stop background turns — leave/return reloads the projected transcript and re-subscribes to live events.

- **Desktop** — in-app Agent Chat / ACP rail **removed** (BOD-49). Use Grok or BacksterOS (development) / T3 Code. Desktop still hosts the PTY package scripts for Hub / mobile.
- **Mobile** — task agent pane: Start → `POST /agent/acp/ensure` (+ bootstrap `POST /agent/prompt`) → Chat UI. Leave/return reattaches the event subscriber only.
- **Activity** — shared `agent-presence` + Research drive Working… indicators on desktop lists; mobile Chat still uses ACP busy/transcript projection.
- Run the sidecar for Tailscale with e.g. `PTY_HOST=0.0.0.0 PTY_AUTH_TOKEN=… pnpm --filter @backsteros/desktop pty` (token required when bound beyond loopback).
- **Settings → Cursor** (desktop) — lists live ACP agent sessions (`GET /sessions?kind=agent`) and can **Kill** them (`DELETE /sessions/:id` or `POST /agent/stop`).
- **Stop agent** (mobile) cancels ACP, forgets the in-memory session, and clears `agentChatId` from the task when stopped from the UI.

Reference implementation patterns: `tmp/t3-code` (local clone of pingdotgg/t3code; gitignored).
