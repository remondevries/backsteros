#!/usr/bin/env bash
# Run on the portal VPS after: sudo tailscale up --hostname=client-portal-vps
set -euo pipefail

VPS_TS_IP="$(tailscale ip -4)"
MAC_TS_IP="100.94.74.107"
REPLICATION_SECRET="$(grep '^CORE_REPLICATION_SECRET=' ~/backsteros/deploy/cloud/.env | cut -d= -f2-)"

if [[ -z "$VPS_TS_IP" ]]; then
  echo "Tailscale not connected. Run: sudo tailscale up --hostname=client-portal-vps"
  exit 1
fi

echo "VPS Tailscale IP: $VPS_TS_IP"

# Cloud-core: push replication to Mac local-core over tailnet
sed -i "s|^CORE_REPLICATION_PEER_URL=.*|CORE_REPLICATION_PEER_URL=http://${MAC_TS_IP}:8788|" \
  ~/backsteros/deploy/cloud/.env

cd ~/backsteros/deploy/cloud
docker compose up -d --force-recreate backsteros

echo "Testing cloud → Mac replication reachability..."
if curl -sf --max-time 5 "http://${MAC_TS_IP}:8788/health" >/dev/null; then
  echo "OK: VPS can reach local-core at ${MAC_TS_IP}:8788"
else
  echo "WARN: VPS cannot reach Mac on tailnet yet."
  echo "  On the Mac, Hub Start enables: tailscale serve --bg --tcp=8788 tcp://127.0.0.1:8788"
  echo "  Or run that command manually (local-core must stay on 127.0.0.1)."
fi

echo ""
echo "Add to local-core .env on your Mac:"
echo "CORE_REPLICATION_PEER_URL=http://${VPS_TS_IP}:8788"
echo "CORE_REPLICATION_SECRET=${REPLICATION_SECRET}"
echo "Keep HOST unset (127.0.0.1). Hub wires Tailscale Serve for cloud reachability."
