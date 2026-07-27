# v2 — local-computer core

## Model

BacksterOS v2 runs **core** on a **local computer** (any always-on workstation you control — do not hard-code machine names like “Mac mini” in docs).

```text
local computer
  · core/server (API)
  · Postgres
  · files / object storage
  · PowerSync

shells (UI only)
  · mobile/  — Expo (iPhone + iPad, adaptive layouts)
  · desktop/ — Tauri + React (macOS)
```

Shells reach core via localhost or Tailscale. Public hosting portals (Next.js) are a later concern.

## Layout

See [STRUCTURE.md](../STRUCTURE.md). Shared non-UI packages live under `core/packages/`. Desktop UI lives under `desktop/packages/ui/` and is **not** shared with mobile.

## Non-goals (for now)

- Hetzner / Sevalla-style client hosting dashboard
- Next.js product web as a BacksterOS shell
- Shared visual component library across Expo and Tauri
- Developing inside `legacy/`
- Agent terminals on **public** internet hosts (PTY stays on the local computer)
- Storing PTY process ids in core — only the Cursor `agentChatId` is synced on the task

Trusted shells on the Tailscale network (desktop localhost + **iPad**) may attach to the local-computer PTY sidecar. **iPhone agent TUI is deferred.**

## Agent sessions (local computer + Tailscale)

The `pnpm pty` sidecar owns long-lived **Cursor ACP** agent sessions (T3-style). Closing a Chat WebSocket only **detaches** the viewer; the ACP session keeps running and the sidecar keeps projecting the turn into the shared transcript store.

**Chat = ACP only (ADR-025):** prompts, streaming, mode (`session/set_mode`), cancel, and permissions go through Cursor ACP. There is **no shared agent TTY pane**. Switching tasks does not stop background turns — leave/return reloads the projected transcript and re-subscribes to live events.

- **Desktop** — task agent rail / codebase pane: Start → `POST /agent/acp/ensure` (+ bootstrap `POST /agent/prompt`) → Chat UI. Leave/return reattaches the event subscriber only.
- **Activity** — ACP `busy` / activity events + transcript projection drive Working… indicators (including background tasks via session poll).
- Run the sidecar for Tailscale with e.g. `PTY_HOST=0.0.0.0 PTY_AUTH_TOKEN=… pnpm pty` (token required when bound beyond loopback).
- **Settings → Cursor** (desktop) — lists live ACP agent sessions (`GET /sessions?kind=agent`) and can **Kill** them (`DELETE /sessions/:id` or `POST /agent/stop`).
- **Stop agent** cancels ACP, forgets the in-memory session, and clears `agentChatId` from the task when stopped from the UI.

Reference implementation patterns: `tmp/t3-code` (local clone of pingdotgg/t3code; gitignored).
