# BacksterOS Hub

macOS **menu-bar** app to start and stop local BacksterOS services (Docker, core API, PTY, Expo). Product desktop stays a client; this hub owns process lifecycle.

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
| **Desktop Start** / **Desktop Stop** | Toggle the core stack (Docker + Core API `:8788` + PTY `:3101`). **Green** + Stop only when **all three** are up. **Red** + Start when anything is missing (click heals — already-running pieces are left alone). **Yellow** **Desktop Loading** while starting/stopping. Click while loading or fully running shuts everything down. |
| **Mobile Start** / **Mobile Stop** | Toggle Expo Metro (`pnpm --filter @backsteros/mobile dev` on `:8081`). **Green** only when Metro is listening; start waits for `:8081` (and kills a stale Hub PID that never bound) so the menu cannot stick on yellow Loading. After Metro binds, Hub enables `tailscale serve --tcp=8081` so the phone can reach Metro at `http://<mac>.ts.net:8081` (cleared on stop). Serve must not run before Metro — Expo treats Tailscale serve as “port in use” and exits under Hub’s non-interactive `CI=1`. Click while loading or running stops Metro. |
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
Logs: `~/.config/backsteros/hub/logs/{docker,api,pty,mobile}.log`

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
- Requires **Node.js ≥22.13** for Core API / PTY / Mobile (same floor as current pnpm). Hub resolves Homebrew (`/opt/homebrew/bin/node`), a modern `/usr/local/bin/node`, or nvm/fnm/volta — and puts that Node first on PATH. Classic JS `pnpm` entries are run as `node /path/to/pnpm` so a stale GUI PATH (`/usr/local/bin` → Node 16) cannot break Desktop Start; standalone Mach-O/ELF `pnpm` binaries are invoked directly (running them under `node` SyntaxErrors).
- Core API is **always** started with `pnpm --filter @backsteros/server dev` from `repo_root` (live TypeScript via `tsx`, including `predev` rebuild of `@backsteros/contracts`). Hub **build vs hub dev** only changes the tray binary — both drive the same repo Core API. Rebuild/reinstall Hub after hub code changes (`pnpm --filter @backsteros/hub build` → copy `.app` to `~/Applications`).
- Desktop start waits for `http://127.0.0.1:8788/health` (up to ~30s) before treating Core API as up; the menu shows **Desktop Loading** while `predev` / bind is in progress. Clicking the toggle during that window cancels and stops the stack.
- Service logs under `~/.config/backsteros/hub/logs/` rotate when a file exceeds ~32 MB (keeps `.log.prev`).
- On Core API start, Hub enables `tailscale serve --tcp=8788` so cloud-core can reach local-core over the tailnet only (`http://<mac-tailnet-ip>:8788`). Desktop keeps using `127.0.0.1:8788`. Serve is cleared on API stop.
- Quitting the hub does **not** stop services — use the Desktop / Mobile toggles first if you want them down.
