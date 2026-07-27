#!/bin/sh
# BacksterOS — Cursor Agent hook relay.
# Cursor invokes this with the hook JSON payload on stdin. When the agent was
# started from our PTY bridge, BACKSTEROS_AGENT_* env vars are set and we POST
# the event to the local bridge for Chat turn chrome (Read/Edit/Shell, etc.).
payload=$(cat 2>/dev/null || true)
session="${BACKSTEROS_AGENT_SESSION_ID:-}"
url="${BACKSTEROS_AGENT_HOOK_URL:-}"

if [ -z "$session" ] || [ -z "$url" ]; then
  exit 0
fi

# Truncate huge fields (file contents / tool stdout) so the POST finishes
# quickly — a 1s curl timeout previously dropped most postToolUse/beforeReadFile
# events, which is why Chat lost Read/Edit activity chrome on Herdr turns.
if command -v python3 >/dev/null 2>&1; then
  payload=$(printf '%s' "$payload" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception:
    sys.stdout.write(raw)
    raise SystemExit(0)

def trim(value, limit=6000):
    if isinstance(value, str) and len(value) > limit:
        return value[:limit] + "…"
    return value

for key in ("tool_output", "content", "result_json", "text", "message"):
    if key in data:
        data[key] = trim(data[key])

edits = data.get("edits")
if isinstance(edits, list) and len(edits) > 40:
    data["edits"] = edits[:40]

inp = data.get("tool_input")
if isinstance(inp, dict):
    cleaned = {}
    for key, value in inp.items():
        if key in ("content", "tool_output", "result_json"):
            continue
        if isinstance(value, str) and len(value) > 4000:
            cleaned[key] = value[:4000] + "…"
        else:
            cleaned[key] = value
    data["tool_input"] = cleaned

sys.stdout.write(json.dumps(data, separators=(",", ":")))
' 2>/dev/null) || true
fi

# Best-effort — never block the agent on a missing bridge.
printf '%s' "$payload" | curl -sS -m 5 -X POST "$url" \
  -H "Content-Type: application/json" \
  -H "X-Backsteros-Session: ${session}" \
  --data-binary @- >/dev/null 2>&1 || true

exit 0
