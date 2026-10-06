#!/usr/bin/env bash
# OS-82: run.sh start log must not crash under set -u when pull env is unset.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_SH="${ROOT}/scripts/local-core/run.sh"

grep -F 'CORE_REPLICATION_SYNC_EVENTS_PULL=${CORE_REPLICATION_SYNC_EVENTS_PULL:-unset}' "${RUN_SH}" >/dev/null

# Caller may have the var exported; force unset for the set -u check.
unset CORE_REPLICATION_SYNC_EVENTS_PULL
set -u
log_value="${CORE_REPLICATION_SYNC_EVENTS_PULL:-unset}"
test "${log_value}" = "unset"

echo "ok: run.sh unset CORE_REPLICATION_SYNC_EVENTS_PULL is set -u safe"
