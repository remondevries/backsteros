# Deploy notes

Production-like instance today:

- Host: Tailscale `development`
- Path: `/home/deploy/penpot` (compose project `penpot`)
- UI: `http://100.126.31.97:9001`

Branding apply (from this monorepo, with Docker access to that host):

```bash
# on development, after syncing design/branding:
cd /home/deploy/penpot   # or point PENPOT_FRONTEND_CONTAINER
# copy branding from repo, then:
./branding/bin/apply-branding.sh
```

When the fork is vendored, compose overlays and image build contexts should live here.
