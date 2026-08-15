# BacksterOS Hub

macOS **menu-bar** app to start and stop local BacksterOS services (Docker, core API, PTY). Product desktop stays a client; this hub owns process lifecycle.

## Develop

```bash
cd hub && pnpm dev
# or from repo root:
pnpm --filter @backsteros/hub dev
```

A BacksterOS mark appears in the menu bar (template icon). Hover for API status tooltip.

## Menu

| Item | Action |
| --- | --- |
| **Start** | Docker compose up + core API (`:8788`) + PTY (`:3101`). Shows **Running...** while starting and when all are up. |
| **Stop** | Stop PTY, API, then Docker compose |
| **Docker / Core API / PTY** | Shown only when status is mixed or a start/stop is in progress — toggle that service |
| **Mobile Development** | Separate toggle for Expo Metro (`pnpm --filter @backsteros/mobile dev` on `:8081`). Green when up, red when down, yellow while busy. |
| **Quit Hub** | Exit the tray app (does not stop services) |

## Config

Written on first launch:

`~/.config/backsteros/hub.json`

```json
{
  "repo_root": "/Users/you/code/backsteros"
}
```

- `repo_root` — monorepo path (auto-detected when possible)

PIDs: `~/.config/backsteros/hub/pids.json`  
Logs: `~/.config/backsteros/hub/logs/{docker,api,pty}.log`

## Build / install

```bash
cd hub && pnpm build
# or:
pnpm --filter @backsteros/hub build
```

App bundle: `hub/src-tauri/target/release/bundle/macos/BacksterOS Hub.app`

Copy to `~/Applications` and optionally add as a Login Item.

## Notes

- Requires Docker Desktop (or compatible) for the compose stack.
- Core API is started with `pnpm dev` from `repo_root`; PTY with `pnpm --filter @backsteros/desktop pty`.
- Quitting the hub does **not** stop services — use **Stop** first if you want them down.
