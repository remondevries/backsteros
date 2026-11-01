# Channel Connect — agent instructions

Triggered by webhook event `project.channel.connect` when the owner clicks
**Connect** on a project’s Channel property. Finish the room, then mark the
project Active. Full API shapes: `docs/04-api-and-sync.md` (Channel Connect)
and `agents/README.md` (Channel Connect section).

## Auth

Use the agent’s `sk_live_…` key against `https://agent.backsteros.com/api/v1`
with `projects:write`.

## Stages (required while connecting)

PATCH each stage so the desktop badge shows progress (live status shine).
Fallback label when unset: **Connecting…**.

```http
PATCH /api/v1/projects/{projectId}
{ "channelStage": "looking_for_room" }
```

Order:

1. `looking_for_room`
2. `joining_room` **or** `creating_room` (pick one path)
3. `adding_users`
4. `finishing`

## Finish / abort

```http
# Need owner details
PATCH /api/v1/projects/{projectId}
{
  "channelStatus": "needs_details",
  "channelPendingLink": "backsteros://chat/<threadId>?message=<msgId>"
}

# Room ready — include every agent in the room (Grok Bot agent ids)
PATCH /api/v1/projects/{projectId}
{
  "channel": {
    "uri": "grokbot://app/v1/agent?id=<uuid>",
    "name": "…",
    "members": ["<grok bot agent id>", "…"]
  },
  "channelStatus": "active"
}

# Abort
PATCH /api/v1/projects/{projectId}
{ "channelStatus": "inactive", "channel": null }
```

## Room members

`channel.members` lists the **Grok Bot agent ids** of every agent in the room
(yourself included) — the same ids agents report via `PATCH /api/v1/agents/me`.
BacksterOS uses it to show which agents can pick up the project's tasks.

- Send the full list each time (it replaces the previous one; `[]` clears it).
- When agents join or leave later, PATCH `channel` again with the same `uri`
  and the new full `members` list.
- A `channel` write that omits `members` with the same `uri` keeps the stored
  list (e.g. renaming the room).
- Up to 100 ids; letters, digits and `. _ : @ -` only.

### `project.channel.members.sync`

The owner can press **Sync** on the project's Team property. That POSTs this
event to the lead agent's webhook:

```json
{
  "event": "project.channel.members.sync",
  "projectId": "…",
  "projectKey": "OS",
  "projectName": "BacksterOS",
  "requestedAt": "…",
  "channel": { "uri": "grokbot://…", "name": "…", "members": ["…"] },
  "report": {
    "reportUrl": "https://agent.backsteros.com/api/v1/projects/<projectId>",
    "method": "PATCH",
    "body": { "channel": { "uri": "grokbot://…", "members": ["…"] } }
  }
}
```

Look up who is in the room right now and PATCH `channel` with the same `uri`
and the full `members` list. `channel.members` in the payload is what
BacksterOS has stored, so you can see what is out of date.

## Status

`channelStage` clears automatically on `active` / `inactive`. Do **not** set
`channelStatus` to `connecting` and do **not** call
`POST /projects/:id/channel/connect` (owner only → `403`).
