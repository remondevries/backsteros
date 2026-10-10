# Production firewall (CX43 / `production`)

Host: `46.225.171.3` (Tailscale `100.75.45.22`), SSH alias `production`, user `deploy`.

Enabled **2026-10-10** (CA-39): `ufw` active + `DOCKER-USER` rules so Docker-published ports do not bypass the host firewall.

## Allowed on the public interface

| Port | Purpose |
|------|---------|
| 22/tcp | SSH (key-only; `PasswordAuthentication no`) |
| 80/tcp, 443/tcp | `kamal-proxy` |
| 41641/udp | Tailscale WireGuard |
| 8788/tcp | BacksterOS cloud API (pending review — may move to Tailscale-only) |
| 7880/tcp, 7881/tcp, 50000–60000/udp | LiveKit (pending review) |
| 3080/tcp | `/srv/backsteros/agents` (pending review) |

Also: **full allow** on `tailscale0`.

## Blocked from the internet (via `DOCKER-USER`)

Docker publishes that must not be public: **9090** (Prometheus), **9093** (Alertmanager), **9115** (blackbox).  
`DOCKER-USER` returns for established/related, `tailscale0`, CGNAT `100.64.0.0/10`, and TCP `80,443,8788`; then **DROPs** other traffic ingress on `eth0`.

## Backups on the server

- Pre-change: `/home/deploy/firewall-backup-20261010-124346`
- Post-enable: `/home/deploy/firewall-backup-enabled-20261010-124820`
- Rollback helper (created during enable): `/home/deploy/ca39-firewall-rollback.sh`

## Rollback

```bash
ssh production
sudo ufw --force disable
sudo iptables-restore < /home/deploy/firewall-backup-20261010-124346/iptables-v4.rules
sudo ip6tables-restore < /home/deploy/firewall-backup-20261010-124346/ip6tables-v6.rules
```

Or run `sudo /home/deploy/ca39-firewall-rollback.sh`.

## Reload notes

- `DEFAULT_FORWARD_POLICY=ACCEPT` in `/etc/default/ufw` (Docker forwarding).
- Custom `DOCKER-USER` block is appended in `/etc/ufw/after.rules` between `# CA39-DOCKER-USER` markers. Use **ASCII-only** comments there (`ufw` cannot write Unicode into rules files).
- Prefer `ufw allow` / editing `after.rules` over `ufw --force reset` (reset restores stock `after.rules` and drops the CA39 block until re-patched).

## Verify

From another network (e.g. `lemodesign`):

```bash
# expect OPEN: 80 443 8788 7880 ; FAIL: 9090 9093 9115
for p in 80 443 8788 9090 9093 9115 7880; do
  timeout 2 bash -c "echo >/dev/tcp/46.225.171.3/$p" && echo "$p OPEN" || echo "$p FAIL"
done
curl -sS -o /dev/null -w "%{http_code}\n" https://kifungo.nl/
```
