# backsteros-app

Responsive product web app for projects, tasks, inbox, people, knowledge, journal,
letters, and settings.

- Production: `https://backsteros.com/app` (`NEXT_PUBLIC_BASE_PATH=/app`)
- Framework: Next.js 16, React 19, Tailwind CSS 4
- Auth: Clerk middleware and hosted sign-in components
- Deployment: standalone Next.js server (`output: "standalone"`)
- Health: `GET /api/health` (publicly `GET /app/api/health`)

This is a web-only client. It does not bundle the API, SQLite, PowerSync service,
object storage, sync engine, or a Tauri runtime. Those remain separate systems.

## Local development

From the workspace root:

```sh
cp backsteros-app/.env.example backsteros-app/.env.local
pnpm install
pnpm db:up
pnpm db:migrate
pnpm --filter @backsteros/api db:powersync-setup
pnpm --filter @backsteros/api dev   # :8787 → Docker Postgres :5433
pnpm dev:app                        # :5173 (or PORT)
```

Required values are validated when the app or middleware starts:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL` (local: `http://localhost:5173`; production: `https://backsteros.com/app`)
- `NEXT_PUBLIC_API_URL` (API **origin** only, e.g. `http://127.0.0.1:8787` — contract paths already include `/api/v1`)
- Production only: `NEXT_PUBLIC_BASE_PATH=/app` (baked in at `next build`)

### Dev / Prod backend mode (next dev only)

When running **`next dev`** (`NODE_ENV=development`), **Settings → Sync** shows a
Dev | Prod switch in the sync status card header. Production builds never include
this UI — they always use `NEXT_PUBLIC_API_URL` from the deploy environment.

| Mode | App talks to | Data |
| --- | --- | --- |
| **Dev** | `http://127.0.0.1:8787` | Local API → Docker Postgres (`:5433`) + local PowerSync (`:8080`) |
| **Prod** | `https://service.backsteros.com` | Production API → Neon |

Selection is stored in `localStorage` (`backsteros.backend-mode`) only under
`next dev`. Switching reloads the app and uses separate PowerSync SQLite files
per mode so caches do not mix.

Keep the local API `DATABASE_URL` pointed at Docker for Dev isolation. Neon
remains behind the production API (and optionally `DATABASE_URL_NEON` in the API
`.env` for reference).

Useful checks:

```sh
pnpm typecheck:app
pnpm lint:app
pnpm build:app
```

This is not the ops/API dashboard; that remains
[`backsteros-admin`](../backsteros-admin/).
