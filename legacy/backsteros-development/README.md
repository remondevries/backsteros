# BacksterOS Development

Orca-style **agent console** scaffold: projects (left), tasks (middle), real local terminals (right; collapsible).

Not the product app (`backsteros-app` / `/app`). Reuses `@backsteros/ui` for task lists.

## Setup

```bash
# From ~/code/backsteros
pnpm install
pnpm --filter @backsteros/ui build
cp backsteros-development/.env.example backsteros-development/.env
# Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (+ API URL if needed)
```

Clerk allowed origins and API `CORS_ORIGINS` must include `http://localhost:3100`.

## Run

```bash
# API on :8787
pnpm dev

# Console on :3100 (Next + local PTY bridge on :3101)
pnpm dev:development
# or: pnpm --filter @backsteros/development dev
```

### Native window (recommended)

Thin **Tauri** wrapper: real native window that loads the same Next.js app at
`http://127.0.0.1:3100`. No UI rewrite — not product `backsteros-desktop`.
The window opens immediately on a splash page while PTY/Next start in the background.

For Powerline / Nerd Font icons in the terminal, install a Nerd Font (e.g. MesloLGS)
on the Mac so WKWebView can resolve it — same requirement as a browser without
those fonts installed.

```bash
# Dev: starts PTY + Next (if needed) and opens the native window
pnpm --filter @backsteros/development desktop

# Install Dock / Spotlight app (builds the Tauri shell)
pnpm --filter @backsteros/development desktop:install
# → ~/Applications/BacksterOS Development.app
```

Requires Rust (`rustup`) and Xcode CLT. First launch may build `@backsteros/ui` and Next.

### Chrome app-mode fallback

Same services, Chrome `--app` window instead of Tauri:

```bash
pnpm --filter @backsteros/development app
pnpm --filter @backsteros/development app:install
```

Notes:

- The API (`pnpm dev` at repo root, :8787) still needs to be running for tasks/data.
- Packaged Tauri app finds this folder via the path baked at build time (or set
  `BACKSTEROS_DEVELOPMENT_DIR` if you move the repo).

## Notes

- Each project needs a **working directory** (project overview → folder chip). Agents and PTYs use that path; without it the shell starts in your home folder and the agent will thrash looking for the repo.
- Terminals use **xterm.js** in the browser connected to a **local PTY** (`node-pty`) over `ws://127.0.0.1:3101`. That is your real login shell (same family as Ghostty) — not an attachment to an existing Ghostty window.
- The PTY bridge listens on loopback only. Override with `PTY_SHELL`, `PTY_CWD`, `PTY_PORT`, `NEXT_PUBLIC_PTY_WS_URL`.
- Tasks/projects load over REST via `@backsteros/api-client` (no PowerSync in v1).
- The browser calls same-origin `/api/v1/*`; a Next route handler proxies to `NEXT_PUBLIC_API_URL` (avoids CORS / Cloudflare rewrite issues). Use the same API URL as desktop to see the same projects.