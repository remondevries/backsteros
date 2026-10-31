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

# Room ready
PATCH /api/v1/projects/{projectId}
{
  "channel": { "uri": "grokbot://app/v1/agent?id=<uuid>", "name": "…" },
  "channelStatus": "active"
}

# Abort
PATCH /api/v1/projects/{projectId}
{ "channelStatus": "inactive", "channel": null }
```

`channelStage` clears automatically on `active` / `inactive`. Do **not** set
`channelStatus` to `connecting` and do **not** call
`POST /projects/:id/channel/connect` (owner only → `403`).
