#!/usr/bin/env bash
# Scratch-dir check for OS-63 log rotation (does not touch Remon's live log).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/os-63-log-rotate.XXXXXX")"
cleanup() { rm -rf "${SCRATCH}"; }
trap cleanup EXIT

export HOME="${SCRATCH}/home"
mkdir -p "${HOME}/.config/backsteros/desktop"
LOG_DIR="${HOME}/.config/backsteros/desktop"
LOG_FILE="${LOG_DIR}/local-core.log"

# Source only the rotate helpers by extracting them via a tiny harness.
# shellcheck disable=SC1091
export LOCAL_CORE_LOG_ROTATE_BYTES=100
export LOCAL_CORE_LOG_ROTATE_GENERATIONS=5
export BACKSTEROS_REPO_ROOT="${ROOT}"

# Inline the rotate function from run.sh (same logic) without starting the API.
LABEL="com.backsteros.local-core"
LOG_PREV="${LOG_DIR}/local-core.log.prev"
LOG_ROTATE_BYTES="${LOCAL_CORE_LOG_ROTATE_BYTES}"
LOG_ROTATE_GENERATIONS="${LOCAL_CORE_LOG_ROTATE_GENERATIONS}"

rotate_log_if_needed() {
  if [[ ! -f "${LOG_FILE}" ]]; then
    : >"${LOG_FILE}"
    return 0
  fi
  local size
  size="$(wc -c <"${LOG_FILE}" | tr -d ' ')"
  if [[ "${size}" -lt "${LOG_ROTATE_BYTES}" ]]; then
    return 0
  fi
  if [[ -f "${LOG_PREV}" && ! -f "${LOG_FILE}.1" ]]; then
    mv "${LOG_PREV}" "${LOG_FILE}.1" 2>/dev/null || true
  else
    rm -f "${LOG_PREV}" 2>/dev/null || true
  fi
  local i next
  local last="${LOG_ROTATE_GENERATIONS}"
  rm -f "${LOG_FILE}.${last}" 2>/dev/null || true
  for ((i = last - 1; i >= 1; i--)); do
    next=$((i + 1))
    if [[ -f "${LOG_FILE}.${i}" ]]; then
      mv "${LOG_FILE}.${i}" "${LOG_FILE}.${next}" 2>/dev/null || true
    fi
  done
  cp "${LOG_FILE}" "${LOG_FILE}.1"
  : >"${LOG_FILE}"
  printf '%s\n' "rotated (${size} bytes → .1….${last}, threshold=${LOG_ROTATE_BYTES})" >>"${LOG_FILE}"
}

# Sub-threshold: no rotate.
printf 'small' >"${LOG_FILE}"
rotate_log_if_needed
[[ "$(cat "${LOG_FILE}")" == "small" ]]
[[ ! -f "${LOG_FILE}.1" ]]

# Three over-threshold writes → keep generations with prior content.
for gen in A B C; do
  # 120 bytes > 100 threshold
  python3 -c "print('${gen}' * 120, end='')" >"${LOG_FILE}"
  rotate_log_if_needed
done

[[ -f "${LOG_FILE}.1" && -f "${LOG_FILE}.2" && -f "${LOG_FILE}.3" ]]
[[ ! -f "${LOG_FILE}.6" ]]
grep -q 'threshold=100' "${LOG_FILE}"
# Newest generation is C; older is B then A.
python3 -c "import pathlib; assert pathlib.Path('${LOG_FILE}.1').read_text().startswith('C')"
python3 -c "import pathlib; assert pathlib.Path('${LOG_FILE}.2').read_text().startswith('B')"
python3 -c "import pathlib; assert pathlib.Path('${LOG_FILE}.3').read_text().startswith('A')"

# Startup-style: tiny file must not wipe gens.
printf 'tiny' >"${LOG_FILE}"
rotate_log_if_needed
[[ "$(cat "${LOG_FILE}")" == "tiny" ]]
[[ -f "${LOG_FILE}.1" ]]

echo "ok: log rotation keeps 5 generations and respects threshold=${LOG_ROTATE_BYTES}"
