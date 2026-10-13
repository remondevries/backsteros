# BacksterDESIGN branding

- Replaces Penpot logos / favicon / sprites
- Hides the dashboard team/organization switcher
- Injects a static **BacksterDESIGN** brand row (system-ui, thin + bold)
- Hides Libraries & Templates via `disable-dashboard-templates-section` (see `config.js` / devenv)

## Local fork (`design/` devenv)

Writes logos into `frontend/resources/images/`, updates `index.mustache`, and patches a live `resources/public/` tree if present:

```bash
# from BacksterOS repo root
pnpm --filter @backsteros/design branding:apply
# or:
./design/branding/bin/apply-to-source.sh
```

Hard-refresh the browser. Sprite sheets regenerate on the next frontend watch cycle.

## Shared stock host (`ssh development`)

```bash
cd /home/deploy/penpot
./branding/bin/apply-branding.sh
```

Re-run after frontend container recreate.
