# BacksterDEV localhost control API

> For agents (Sander/Grok) and maintainers. Starts coding-agent threads inside a
> running BacksterDEV / T3 Code environment without Herdr or a UI click.

When BacksterDEV is open on this Mac, call the loopback control plane on that
server to bind a BacksterOS task, start an agent turn, and read status.

## Base URL

Read the live origin from the worktree (or install) runtime state:

```bash
# Dev / worktree
ORIGIN=$(python3 -c "import json; print(json.load(open('.t3/userdata/server-runtime.json'))['origin'])" 2>/dev/null \
  || python3 -c "import json; print(json.load(open('.t3/dev/server-runtime.json'))['origin'])")

# Packaged desktop often uses ~/.t3/userdata/server-runtime.json
```

Typical value: `http://127.0.0.1:<port>`.

## Auth

**Loopback only.** Non-loopback clients get `403`.

Send one of:

1. **BacksterOS API key** (convenient on this Mac):

   ```bash
   set -a && source ~/.config/backsteros/cli.env && set +a
   AUTH="Authorization: Bearer $BACKSTEROS_API_KEY"
   ```

2. **BDV pairing session** Bearer token with `orchestration:operate` (same as
   `/api/orchestration/dispatch`).

## Endpoints

### Start (create/bind + start agent)

`POST /api/backsteros/control/sessions`

```bash
curl -sS -X POST "$ORIGIN/api/backsteros/control/sessions" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "taskRef": "BDV-33",
    "prompt": "Implement this Backsteros task. Start working now.\n\nReply with exactly: control-api-smoke-ok"
  }'
```

Body fields:

| Field                              | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `taskRef` or `taskId`              | yes      | `BDV-33` or the task id                                                                                                                                                                                                                                                                                                                                                                                    |
| `prompt`                           | no       | Defaults to the standard BacksterOS kickoff prompt from the task body                                                                                                                                                                                                                                                                                                                                      |
| `start`                            | no       | Default `true`. Set `false` to create/bind without starting a turn                                                                                                                                                                                                                                                                                                                                         |
| `workspaceRoot`                    | no       | Override when the BacksterOS project cwd is unset. For **remote** environments this must be a path that exists on that machine.                                                                                                                                                                                                                                                                            |
| `projectId`                        | no       | T3 project id override                                                                                                                                                                                                                                                                                                                                                                                     |
| `environmentId`                    | no       | Paired remote (or local) environment id. Default: this server’s local environment.                                                                                                                                                                                                                                                                                                                         |
| `environment` / `environmentLabel` | no       | Case-insensitive label alternative to `environmentId` (e.g. `development`).                                                                                                                                                                                                                                                                                                                                |
| `modelSelection`                   | no       | `{ "instanceId": "cursor", "model": "…" }`. On a **new** thread this falls back to the T3 project default (then the first authenticated provider). On an **existing** bound thread the turn uses that thread's stored selection — not the project default — so a cursor thread is not restarted as `claudeAgent`. An explicit selection on a **different driver** is rejected before dispatch (see below). |

**Environment selection:** omit `environmentId` / `environment` to run on this
server (backward compatible). To run on a paired remote (for example the
development Tailscale host), pass its id or label from
`GET /api/backsteros/control/environments`. The desktop app mirrors paired
bearer remotes into `control-environments.json` under the state dir (tokens
included, mode `0600`). You can also `PUT` that registry. Remote starts use the
remote’s `/api/orchestration/*` HTTP API (stock `t3 serve` has no control
routes) and store the task↔thread binding locally with that remote’s
`environmentId` so the rail opens the right chat.

When both `environmentId` and `environment` / `environmentLabel` are set, they
must refer to the same environment; a mismatch returns JSON `400` with
`code: "environment_mismatch"` (label no longer silently overrides a wrong id).

**Project resolution:** when `workspaceRoot` / `projectId` are omitted, the
server reads the BacksterOS task's project `localWorkingDirectory`, matches it
to a linked T3 project (same normalized-path comparison the rail uses), and
creates/links a T3 project when none exists yet — same behavior as opening a
task chat in the UI. Callers only need `taskRef` for the happy path.

If the BacksterOS project has no cwd and `workspaceRoot` was not provided, the
response is JSON `409` with `code: "no_workspace"` (not a 500).

If the caller passes `modelSelection` whose **driver** differs from the existing
thread (same check as the orchestration engine), the response is JSON `409`
with `code: "driver_mismatch"` and:

| Field                 | Meaning                                     |
| --------------------- | ------------------------------------------- |
| `threadInstanceId`    | Instance id stored on the thread            |
| `threadDriver`        | Driver kind the thread is bound to          |
| `requestedInstanceId` | Instance id from the request                |
| `requestedDriver`     | Driver kind that would have been dispatched |

Same-driver instance switches are not rejected here; the orchestration engine
can still refuse an incompatible resume state after dispatch. A driver mismatch
is rejected before dispatch, and the BacksterOS task status is not written.

Response includes `threadId`, `taskId`, `taskRef`, `status`
(`idle` \| `working` \| `blocked` \| `done`), `lastError` (provider/session
error text, or `null`), `created`, `started`.

Re-calling with the same task reuses the bound thread and its driver. A
rejected or errored session (or `stopped` with `lastError`) does **not** move
the task to `in_review`; only a real successful turn completion does. A retry
that actually dispatches a turn still marks the task `in_progress`.

### Status

`GET /api/backsteros/control/sessions?taskRef=BDV-33`

Also accepts `taskId=` or `threadId=`. The JSON includes `lastError` when the
provider session failed (so callers can tell a rejected turn from a finished
one). Status GET is read-only: it never writes BacksterOS task status.

### Follow-up message

`POST /api/backsteros/control/message`

```bash
curl -sS -X POST "$ORIGIN/api/backsteros/control/message" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"threadId":"<threadId>","text":"Continue — status only, no code changes."}'
```

### Environments (paired remotes)

- `GET /api/backsteros/control/environments` — local environment plus registered
  remotes (`environmentId`, `label`, `httpBaseUrl`, `local`, `hasAccessToken`;
  tokens are never returned)
- `PUT /api/backsteros/control/environments` — **replace** the remote registry:
  `{ "environments": [{ "environmentId", "label", "httpBaseUrl", "accessToken?" }] }`

Desktop catalog sync **merges** (upserts) paired bearer remotes into
`control-environments.json` and keeps rows that exist only from a prior `PUT`
(BDV-60). `PUT` itself still replaces the whole remote list — pass every remote
you want to keep. Catalog rows win on `environmentId` collision (fresh pairing
tokens).

```bash
curl -sS "$ORIGIN/api/backsteros/control/environments" -H "$AUTH"

curl -sS -X POST "$ORIGIN/api/backsteros/control/sessions" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "taskRef": "BDV-56",
    "environment": "development",
    "workspaceRoot": "/home/deploy/agent-smoke",
    "prompt": "Reply with exactly: bdv-56-remote-ok"
  }'
```

### Bindings (rail sync)

- `GET /api/backsteros/control/bindings` — list task↔thread bindings
- `PUT /api/backsteros/control/bindings` — upsert a binding (used by the web UI)

Bindings live under the environment state dir as
`backsteros-task-threads.json`. The BacksterOS rail polls this so chats started
from the control API stay linked in the UI.

**Inbox / rail open:** Opening a task prefers the control/server thread binding
over a local “Start working” kickoff draft. `healBinding` keeps `kind:"thread"`
bindings even when the thread shell is not hydrated yet, so the route can load
the live thread instead of creating a fresh draft.

## Smoke checklist

With BacksterDEV running and a provider configured:

```bash
set -a && source ~/.config/backsteros/cli.env && set +a
ORIGIN=$(python3 -c "import json; print(json.load(open('.t3/userdata/server-runtime.json'))['origin'])")
AUTH="Authorization: Bearer $BACKSTEROS_API_KEY"

curl -sS -X POST "$ORIGIN/api/backsteros/control/sessions" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"taskRef":"BDV-33","prompt":"Reply with exactly: control-api-smoke-ok"}'

curl -sS "$ORIGIN/api/backsteros/control/sessions?taskRef=BDV-33" -H "$AUTH"
```

Expect `ok: true`, a `threadId`, and `status` of `working` (or `idle`/`done`
shortly after). Open the task in the BacksterOS rail — it should navigate to
that thread.
