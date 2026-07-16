# backsteros-app

Responsive product web app for projects, tasks, inbox, people, knowledge, journal,
letters, and settings.

- Production: `https://app.backsteros.com`
- Framework: Next.js 16, React 19, Tailwind CSS 4
- Auth: Clerk middleware and hosted sign-in components
- Deployment: standalone Next.js server (`output: "standalone"`)
- Health: `GET /api/health`

This is a web-only client. It does not bundle the API, SQLite, PowerSync service,
object storage, sync engine, or a Tauri runtime. Those remain separate systems.

## Local development

From the workspace root:

```sh
cp backsteros-app/.env.example backsteros-app/.env.local
pnpm install
pnpm dev:app
```

Required values are validated when the app or middleware starts:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_URL`

Useful checks:

```sh
pnpm typecheck:app
pnpm lint:app
pnpm build:app
```

The current route content is intentionally skeletal. This build establishes the
Circle-derived shell, navigation behavior, route families, Clerk boundary, and
responsive layout; feature data and mutations are connected separately.

This is not the ops/API dashboard; that remains
[`backsteros-admin`](../backsteros-admin/).
