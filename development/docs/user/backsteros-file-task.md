# Filing BacksterOS tasks from BacksterDEV

Capture work into BacksterOS without leaving Development or switching into a Grok Bot chat UI.

## Two paths

| Entry                             | What it does                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New task** (compose icon / `C`) | Creates a task directly via BacksterOS `POST /api/v1/tasks` (Settings → Integrations → BacksterOS API URL + key).                                                     |
| **File as BacksterOS task** (orb) | Wakes a **Grok Bot agent webhook**. The agent researches/files the task, then POSTs a result to **Cloud Core**. The modal does **not** call the BacksterOS tasks API. |

## Entry

In the BacksterOS rail, the connecting orb next to **New task** opens the file modal. After send, a creating banner sits above Code / Servers / Git (agent avatar + working dot). On success it becomes a check, `Agent · TASK-REF`, open-task (whole card), and dismiss (X).

Project is prefilled from the current BDV context (same resolution as compose).

## Settings → Integrations

Under **BacksterOS**, configure **File-task agents** (one or more):

- **Display name** (e.g. Sander)
- **Webhook URL** — paste from the Grok Bot routine
- **Webhook key / Authorization** — paste from the routine (stored on this device like other secrets)

BDV always sends `Authorization: Bearer <key>` unless the pasted value already starts with `Bearer` or `Basic`.

Optional **Cloud Core mailbox URL**: public agents-door origin. Empty uses `https://agent.backsteros.com`. Override only to hit a local cloud-core.

Sander’s routine is **Task creation** (folder `bdv-dig-then-file`). Paste that routine’s URL + key here.

## Flow

1. Pick project + agent.
2. Type a brief.
3. Send → BDV registers a mailbox on Cloud Core, wakes the agent webhook, closes the modal, and shows the creating banner above Code / Servers / Git.
4. Creating banner stays until the agent POSTs the callback (you can keep working).
5. Success shows `Agent · PROJECT-N` from `taskRef` (or an error toast). Click the card to open the task.

## Fixed outbound payload

```json
{
  "brief": "<text from the field>",
  "projectId": "<BacksterOS project id>",
  "projectKey": "<e.g. BOD>",
  "assigneeId": "9c36dc9c-6e9e-4f21-a602-4f7291231e60",
  "priority": 3,
  "status": "backlog",
  "requestId": "<uuid>",
  "callbackUrl": "https://agent.backsteros.com/api/v1/public/file-task-callbacks/<uuid>?token=…"
}
```

Required: `brief`, project (`projectId` or `projectKey`), `callbackUrl`. Status is always `backlog`.

## Fixed callback

Agent POSTs to `callbackUrl` (no API key; the token in the query is the secret):

```json
{
  "ok": true,
  "requestId": "<same uuid>",
  "taskId": "...",
  "taskRef": "BOD-72",
  "title": "...",
  "projectId": "...",
  "summary": "short what was filed"
}
```

Failure: `{ "ok": false, "requestId": "...", "error": "..." }`.

Development polls via the local T3 server (`/api/backsteros/cloud-file-task-callbacks`),
which forwards to Cloud Core with the BacksterOS API key (avoids browser CORS).
