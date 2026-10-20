#!/usr/bin/env bash
# Create or update the shared staff login on local Penpot PREPL.
# Credentials: ~/.config/secrets/backsterdesign.env (never committed).
set -euo pipefail

SECRETS="${BACKSTERDESIGN_SECRETS:-$HOME/.config/secrets/backsterdesign.env}"
TARGET="${1:-local}" # local only for now

if [[ ! -f "$SECRETS" ]]; then
  echo "Missing $SECRETS" >&2
  echo "Create it from ~/.config/secrets/backsterdesign.env.example" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$SECRETS"
set +a

EMAIL="${BACKSTERDESIGN_STAFF_EMAIL:?set BACKSTERDESIGN_STAFF_EMAIL}"
PASSWORD="${BACKSTERDESIGN_STAFF_PASSWORD:?set BACKSTERDESIGN_STAFF_PASSWORD}"
FULLNAME="${BACKSTERDESIGN_STAFF_FULLNAME:-Remon de Vries}"

if [[ "$TARGET" != "local" ]]; then
  echo "Usage: $0 [local]" >&2
  echo "Hosted password is set on lemodesign via PREPL (same secrets file)." >&2
  exit 1
fi

CONTAINER="${PENPOT_MAIN_CONTAINER:-penpot-devenv-ws0-main}"
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Local devenv is not running ($CONTAINER missing)." >&2
  echo "Start it: pnpm --filter @backsteros/design dev" >&2
  exit 1
fi

docker exec -e EMAIL="$EMAIL" -e PASSWORD="$PASSWORD" -e FULLNAME="$FULLNAME" \
  "$CONTAINER" bash -lc '
    set -euo pipefail
    MANAGE=/home/penpot/penpot/backend/scripts/manage.py
    CONN=tcp://127.0.0.1:6063
    out=$(python3 "$MANAGE" update-profile -e "$EMAIL" -p "$PASSWORD" -c "$CONN" 2>&1) || true
    if echo "$out" | grep -qi "Updated"; then
      echo "Updated local password for $EMAIL"
      exit 0
    fi
    python3 "$MANAGE" create-profile -e "$EMAIL" -p "$PASSWORD" -n "$FULLNAME" -c "$CONN"
    echo "Created local profile $EMAIL"
  '
