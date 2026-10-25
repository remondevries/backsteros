# BacksterMeet — agent notes

**BacksterMeet** is the Backster Suite product for live meetings: a **Tauri 2 Director app** — the host's control surface during a meeting. The client portal (`client.lemo-design.com`, separate repo `LDP/Codebase`) is the **guest stage**; guests subscribe to what the Director publishes.

Folded into this monorepo on 13 Oct 2026 from `~/code/backstermeet` (see [docs/20-repo-structure.md](../docs/20-repo-structure.md) §8). Human docs: [README.md](README.md).

## Stack

- Tauri 2 (Rust in `src-tauri/`; mints the LiveKit host token in production builds — `mint_livekit_host_token`, `src-tauri/src/livekit_token.rs`)
- Vite 8 + React 19 + TypeScript 6 (`src/`), `livekit-client`
- Package `@backsteros/meet` (pnpm workspace member) · bundle id `com.backsteros.meet` · dev port **1430** (HMR 1431; BacksterOS desktop uses 1420)

```bash
pnpm --filter @backsteros/meet tauri dev    # Director app
pnpm --filter @backsteros/meet dev          # Vite only, http://127.0.0.1:1430
pnpm --filter @backsteros/meet typecheck    # also runs in root `pnpm typecheck` (app + tsconfig.test.json)
pnpm --filter @backsteros/meet test         # tsx --test; also runs in root `pnpm test`
```

Tests cover pure logic only (meeting filter/labels, room open/close stamps, URL
normalization and storage, the LiveKit task queue, dev token plugin helpers).
Keep `*.test.ts` out of the app `tsconfig.json`; they typecheck with Node types
via `tsconfig.test.json`.

## How it connects

- **LiveKit:** host and guests share **one** SFU: `wss://client.lemo-design.com/livekit` (Hetzner, proxied by the portal). Same URL, API key, and room name or they cannot see each other.
- **Room name = `meetingId`** from the launch query string (`?meetingId=<uuid>&title=…&start=…`), which must match the guest join link. Fallback `LIVEKIT_ROOM`.
- **Host token:** dev → Vite middleware `/api/livekit-host-token` (`vite-plugin-livekit-token.ts`); production → Rust command.
- **BacksterOS meetings API:** the meetings picker calls `/api/v1/meetings` through a **dev-only Vite proxy** (`vite-plugin-backsteros-meetings.ts`) to cloud-core. ⚠️ No production path yet.
- **Shared UI:** imports one source file from `backsteros/packages/ui` (`@backsteros/ui/meeting-calendar-status-icon`) via a path alias in `vite.config.ts` + `tsconfig.json`. Otherwise no shared UI.

## Secrets it reads

- `~/.config/secrets/livekit.env` — `LIVEKIT_URL`, `LIVEKIT_CLIENT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_ROOM` (Infisical `services`)
- `~/.config/backsteros/cli.env` — `BACKSTEROS_API_KEY` (+ API URL) for the dev meetings proxy

## Open gaps

1. **Production meetings API path missing** — only the dev Vite proxy exists.
2. **LiveKit credentials** — README shows `devkey` / `secret`; must match Hetzner `livekit.yaml` and should not be dev keys in production (security item).
3. No lint script; not in CI or release workflows.

## Rules

- Do not point the Director at a local SFU when testing with production portal guests.
- Do not commit `src-tauri/target/`, `src-tauri/gen/`, `dist/`, `node_modules/` (ignored in `.gitignore`).
