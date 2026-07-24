#!/bin/sh
# BacksterOS Development — Cursor Agent hook relay (Orca-style turn signals).
# Cursor invokes this with the hook JSON payload on stdin. When the agent was
# started from our PTY bridge, BACKSTEROS_AGENT_* env vars are set and we POST
# the event to the local bridge for instant working/idle UI updates.
payload=$(cat 2>/dev/null || true)
session="${BACKSTEROS_AGENT_SESSION_ID:-}"
url="${BACKSTEROS_AGENT_HOOK_URL:-}"

if [ -z "$session" ] || [ -z "$url" ]; then
  exit 0
fi

# Best-effort, never block the agent on a missing bridge.
printf '%s' "$payload" | curl -sS -m 1 -X POST "$url" \
  -H "Content-Type: application/json" \
  -H "X-Backsteros-Session: ${session}" \
  --data-binary @- >/dev/null 2>&1 || true

exit 0
