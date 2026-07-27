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

## Agent PTYs (local computer + Tailscale)

The `pnpm pty` sidecar owns long-lived agent sessions. Closing a terminal WebSocket only **detaches** the viewer; the agent keeps running.

**Chat vs Terminal (ADR-024):** **Chat = ACP only** (T3-style) — prompts, streaming, mode (`session/set_mode`), and cancel go through Cursor ACP; Chat never types into the Herdr TUI. **Terminal = Herdr viewer** of the same session (`agent --resume <id>`). The sidecar links `~/.cursor/chats/<md5(cwd)>/<id>` → `~/.cursor/acp-sessions/<id>` so history stays shared. Herdr `blocked` still shows as Chat attention when the Terminal pane needs input.

**Durable Terminal session = Herdr.** One named Herdr agent pane per task (`backsteros-<taskId>`), placed in a Herdr workspace named after the **project** with a tab named after the **task display id** (e.g. `LD-2`). Cursor Agent runs inside that pane once (`POST /agent/ensure`). The sidecar keeps **one** `herdr agent attach` pipe per task and fans bytes out to desktop + iPad WebSockets (Herdr attach itself is exclusive). Herdr is an **unmodified external binary** (AGPL); install from [herdr.dev](https://herdr.dev) and run `herdr integration install cursor`. Do not vendor Herdr into this repo.

- **Desktop** — task agent rail / codebase right pane: Start → create chat + ensure Herdr → attach viewer. Leave/return reattaches; does **not** inject a second `agent --resume`.
- **iPad (codebase tasks)** — stacked task detail | remote agent TUI. Core brokers discovery via `GET /api/v1/agent-pty/connection` (`AGENT_PTY_PUBLIC_URL` + `AGENT_PTY_AUTH_TOKEN`). The iPad uses a **native WebSocket** to the sidecar over Tailscale and paints with **Ghostty (Metal)** via `expo-libghostty`.
- Activity (working / idle) prefers Herdr agent status (sidecar poll) bridged into existing BacksterOS indicators; Cursor hooks still handle turn-complete comments.
- Run the sidecar for Tailscale with e.g. `PTY_HOST=0.0.0.0 PTY_AUTH_TOKEN=… pnpm pty` (token required when bound beyond loopback).
- **Settings → Cursor** (desktop) — lists live `kind=agent` sessions (`GET /sessions`) and can **Kill** them (`DELETE /sessions/:id`). Kill closes the Herdr pane; it does **not** clear `agentChatId` in core.
- **Stop agent** on the task destroys the Herdr pane, clears the task terminal viewport (placeholder again), and clears `agentChatId`.
