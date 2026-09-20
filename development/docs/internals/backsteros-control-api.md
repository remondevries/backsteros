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

| Field                 | Required | Notes                                                                 |
| --------------------- | -------- | --------------------------------------------------------------------- |
| `taskRef` or `taskId` | yes      | `BDV-33` or the task id                                               |
| `prompt`              | no       | Defaults to the standard BacksterOS kickoff prompt from the task body |
| `start`               | no       | Default `true`. Set `false` to create/bind without starting a turn    |
| `workspaceRoot`       | no       | Override when the BacksterOS project cwd is unset                     |
| `projectId`           | no       | T3 project id override                                                |
| `modelSelection`      | no       | `{ "instanceId": "cursor", "model": "…" }`                            |

Response includes `threadId`, `taskId`, `taskRef`, `status`
(`idle` \| `working` \| `blocked` \| `done`), `created`, `started`.

Re-calling with the same task reuses the bound thread.

### Status

`GET /api/backsteros/control/sessions?taskRef=BDV-33`

Also accepts `taskId=` or `threadId=`.

### Follow-up message

`POST /api/backsteros/control/message`

```bash
curl -sS -X POST "$ORIGIN/api/backsteros/control/message" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"threadId":"<threadId>","text":"Continue — status only, no code changes."}'
```

### Bindings (rail sync)

- `GET /api/backsteros/control/bindings` — list task↔thread bindings
- `PUT /api/backsteros/control/bindings` — upsert a binding (used by the web UI)

Bindings live under the environment state dir as
`backsteros-task-threads.json`. The BacksterOS rail polls this so chats started
from the control API stay linked in the UI.

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
