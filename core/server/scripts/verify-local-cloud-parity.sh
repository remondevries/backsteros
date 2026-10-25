#!/usr/bin/env bash
# Compare local Postgres + cloud Postgres for schema/data/replication readiness.
# Usage (from repo): ./core/server/scripts/verify-local-cloud-parity.sh
#
# Optional env (defaults target live cloud-core on lemodesign):
#   CLOUD_SSH_HOST=lemodesign
#   CLOUD_PG_CONTAINER=cloud-postgres-1
#   CLOUD_CORE_URL=http://100.83.125.67:8788   (lemodesign over Tailscale)
#   LOCAL_CORE_URL=http://127.0.0.1:8788
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRIZZLE="$ROOT/drizzle"
FAIL=0

CLOUD_SSH_HOST="${CLOUD_SSH_HOST:-lemodesign}"
CLOUD_PG_CONTAINER="${CLOUD_PG_CONTAINER:-cloud-postgres-1}"
CLOUD_CORE_URL="${CLOUD_CORE_URL:-http://100.83.125.67:8788}"
LOCAL_CORE_URL="${LOCAL_CORE_URL:-http://127.0.0.1:8788}"
if [[ "$CLOUD_SSH_HOST" == "hetzner" || "$CLOUD_SSH_HOST" == "production" ]]; then
  echo "error: ${CLOUD_SSH_HOST} has no cloud-core compose — cloud-core lives on lemodesign." >&2
  exit 1
fi

note() { printf '==> %s\n' "$*"; }
ok() { printf '  OK  %s\n' "$*"; }
bad() { printf '  FAIL %s\n' "$*"; FAIL=1; }

q_local() {
  docker exec backsteros-postgres psql -U backsteros -d backsteros -Atc "$1"
}
q_cloud() {
  # Quote SQL for the remote shell so parentheses/spaces survive ssh.
  ssh "$CLOUD_SSH_HOST" "docker exec ${CLOUD_PG_CONTAINER} psql -U backsteros -d backsteros -Atc $(printf '%q' "$1")"
}

note "Process health"
if curl -fsS --max-time 3 "${LOCAL_CORE_URL}/health" >/dev/null; then
  ok "local core ${LOCAL_CORE_URL}"
else
  bad "local core ${LOCAL_CORE_URL} not healthy"
fi
if curl -fsS --max-time 3 "${CLOUD_CORE_URL}/health" >/dev/null; then
  ok "cloud core ${CLOUD_CORE_URL}"
else
  bad "cloud core ${CLOUD_CORE_URL} not healthy"
fi
if curl -fsS --max-time 3 http://localhost:1420/ >/dev/null; then
  ok "desktop vite :1420"
else
  bad "desktop vite :1420 down"
fi
if docker ps --filter name=backsteros-powersync --format '{{.Status}}' | grep -q Up; then
  ok "local PowerSync up"
else
  bad "local PowerSync not up"
fi

note "Migration tip (0103 hash)"
TIP_HASH="$(shasum -a 256 "$DRIZZLE/0103_spaces_publish.sql" | awk '{print $1}')"
L_HAS="$(q_local "SELECT COUNT(*) FROM drizzle.__drizzle_migrations WHERE hash = '$TIP_HASH'")"
C_HAS="$(q_cloud "SELECT COUNT(*) FROM drizzle.__drizzle_migrations WHERE hash = '$TIP_HASH'")"
[[ "$L_HAS" == "1" ]] && ok "local has 0103" || bad "local missing 0103"
[[ "$C_HAS" == "1" ]] && ok "cloud has 0103" || bad "cloud missing 0103"

note "Journal file hashes present on both DBs"
python3 - "$DRIZZLE" "$CLOUD_SSH_HOST" "$CLOUD_PG_CONTAINER" <<'PY' || FAIL=1
import hashlib, json, pathlib, subprocess, sys
drizzle = pathlib.Path(sys.argv[1])
cloud_host, cloud_container = sys.argv[2], sys.argv[3]
journal = json.loads((drizzle / "meta/_journal.json").read_text())["entries"]
local = set(
    subprocess.check_output(
        [
            "docker",
            "exec",
            "backsteros-postgres",
            "psql",
            "-U",
            "backsteros",
            "-d",
            "backsteros",
            "-Atc",
            "SELECT hash FROM drizzle.__drizzle_migrations",
        ]
    )
    .decode()
    .split()
)
cloud = set(
    subprocess.check_output(
        [
            "ssh",
            cloud_host,
            f"docker exec {cloud_container} psql -U backsteros -d backsteros -Atc \"SELECT hash FROM drizzle.__drizzle_migrations\"",
        ]
    )
    .decode()
    .split()
)
missing_l, missing_c = [], []
for entry in journal:
    path = drizzle / f"{entry['tag']}.sql"
    if not path.exists():
        continue
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest not in local:
        missing_l.append(entry["tag"])
    if digest not in cloud:
        missing_c.append(entry["tag"])
if missing_l:
    print("  FAIL local missing hashes:", ", ".join(missing_l))
    sys.exit(1)
if missing_c:
    print("  FAIL cloud missing hashes:", ", ".join(missing_c))
    sys.exit(1)
print("  OK  all journal SQL hashes recorded on local + cloud")
PY

note "Column parity (documents / tasks / space_publish_settings)"
q_local "SELECT table_name||'.'||column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('documents','tasks','space_publish_settings') ORDER BY 1;" >/tmp/bos-cols-local.txt
q_cloud "SELECT table_name||'.'||column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('documents','tasks','space_publish_settings') ORDER BY 1;" >/tmp/bos-cols-cloud.txt
if diff -q /tmp/bos-cols-local.txt /tmp/bos-cols-cloud.txt >/dev/null; then
  ok "columns match"
else
  bad "column mismatch"
  diff -u /tmp/bos-cols-local.txt /tmp/bos-cols-cloud.txt || true
fi

note "Entity counts"
COUNTS_SQL="SELECT 'tasks='||(SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL)||' contacts='||(SELECT COUNT(*) FROM contacts WHERE deleted_at IS NULL)||' orgs='||(SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL)||' projects='||(SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL)||' knowledge='||(SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL AND type='knowledge');"
L_COUNTS="$(q_local "$COUNTS_SQL")"
C_COUNTS="$(q_cloud "$COUNTS_SQL")"
if [[ "$L_COUNTS" == "$C_COUNTS" ]]; then
  ok "$L_COUNTS"
else
  bad "count mismatch local=[$L_COUNTS] cloud=[$C_COUNTS]"
fi

note "Spaces roots"
ROOTS_SQL="SELECT string_agg(path||':'||id||':'||COALESCE(parent_id,''), ',' ORDER BY path) FROM documents WHERE deleted_at IS NULL AND path IN ('knowledge-base','knowledge-base/second-brain','support','websites');"
L_ROOTS="$(q_local "$ROOTS_SQL")"
C_ROOTS="$(q_cloud "$ROOTS_SQL")"
if [[ "$L_ROOTS" == "$C_ROOTS" ]]; then
  ok "space roots identical"
else
  bad "space roots differ"
  printf '  local: %s\n  cloud: %s\n' "$L_ROOTS" "$C_ROOTS"
fi

note "PowerSync publication (local)"
if (cd "$ROOT" && pnpm db:powersync-verify >/tmp/bos-ps-verify.txt 2>&1); then
  ok "powersync-verify"
else
  bad "powersync-verify failed"
  cat /tmp/bos-ps-verify.txt || true
fi

if [[ "$FAIL" -ne 0 ]]; then
  note "Parity check FAILED"
  exit 1
fi
note "Parity check passed"
exit 0
