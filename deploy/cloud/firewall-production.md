# Production firewall (CX43 / `production`)

Host: `46.225.171.3` (Tailscale `100.75.45.22`), SSH alias `production`, user `deploy`.

Enabled **2026-10-10** (CA-39). Two layers:

1. **Hetzner Cloud Firewall** named `lemodesign` (id `11596932`), applied to server `production`
2. **Host `ufw` + `DOCKER-USER`** so Docker-published ports do not bypass the host firewall

## Allowed on the public interface

| Port | Purpose | Layer |
|------|---------|--------|
| 22/tcp | SSH (key-only; cloud FW limited to home/office IP) | cloud + ufw |
| 80/tcp, 443/tcp | `kamal-proxy` | cloud + ufw / DOCKER-USER |
| 41641/udp | Tailscale WireGuard | cloud + ufw |
| 8788/tcp | BacksterOS cloud API (`cloud-backsteros-1`, Docker-published) | cloud + ufw / DOCKER-USER |
| 7880/tcp, 7881/tcp, 50000–60000/udp | LiveKit (host network) | cloud + ufw |
| 3080/tcp | `/srv/backsteros/agents` (host network) | cloud + ufw |

Also: **full allow** on `tailscale0` (host ufw).

## Blocked from the internet

Docker publishes that must not be public: **9090** (Prometheus), **9093** (Alertmanager), **9115** (blackbox).

- Not opened in the Hetzner cloud firewall
- `DOCKER-USER` returns for established/related, `tailscale0`, CGNAT `100.64.0.0/10`, and TCP `80,443,8788`; then **DROPs** other traffic ingress on `eth0`

Host-network services (3080, LiveKit 7880/7881, UDP 50000–60000) are allowed via `ufw` INPUT (and the cloud firewall), not via `DOCKER-USER`.

## Backups on the server

- Pre-change iptables/ufw: `/home/deploy/firewall-backup-20261010-124346`
- Post-enable: `/home/deploy/firewall-backup-enabled-20261010-124820`
- Cloud FW before finalize: `/home/deploy/firewall-backup-cloud-fw-before-ca39-finalize.json`
- Cloud FW current rules: `/home/deploy/firewall-cloud-fw-rules-ca39.json`
- Rollback helper: `/home/deploy/ca39-firewall-rollback.sh`

## Rollback

Host firewall:

```bash
ssh production
sudo ufw --force disable
sudo iptables-restore < /home/deploy/firewall-backup-20261010-124346/iptables-v4.rules
sudo ip6tables-restore < /home/deploy/firewall-backup-20261010-124346/ip6tables-v6.rules
```

Or run `sudo /home/deploy/ca39-firewall-rollback.sh`.

Cloud firewall (from a machine with `hcloud` + token):

```bash
hcloud firewall replace-rules --rules-file /home/deploy/firewall-backup-cloud-fw-before-ca39-finalize.json lemodesign
# or copy the JSON locally first via scp
```

## Reload notes

- `DEFAULT_FORWARD_POLICY=ACCEPT` in `/etc/default/ufw` (Docker forwarding).
- Custom `DOCKER-USER` block is appended in `/etc/ufw/after.rules` between `# CA39-DOCKER-USER` markers. Use **ASCII-only** comments there (`ufw` cannot write Unicode into rules files).
- Prefer `ufw allow` / editing `after.rules` over `ufw --force reset` (reset restores stock `after.rules` and drops the CA39 block until re-patched).
- Changing only host `ufw` is not enough if the Hetzner cloud firewall still blocks the port.

## Verify

From another network (e.g. `lemodesign` or your laptop):

```bash
# expect OPEN: 80 443 8788 7880 7881 3080 ; FAIL: 9090 9093 9115
for p in 80 443 8788 7880 7881 3080 9090 9093 9115; do
  timeout 2 bash -c "echo >/dev/tcp/46.225.171.3/$p" && echo "$p OPEN" || echo "$p FAIL"
done
# UDP: confirm arrival with tcpdump on production while sending a datagram
echo probe | nc -u -w 1 46.225.171.3 50000
curl -sS -o /dev/null -w "kifungo:%{http_code}\n" https://kifungo.nl/
curl -sS -o /dev/null -w "lemo:%{http_code}\n" https://lemo-design.com/
curl -sS -o /dev/null -w "client:%{http_code}\n" https://client.lemo-design.com/
curl -sS -o /dev/null -w "livekit:%{http_code}\n" http://46.225.171.3:7880/
```
