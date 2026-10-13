# Fork plan

## Why fork

| Need | Plugin / config | Fork |
| --- | --- | --- |
| Logo / chrome branding | Overlay (done) | Optional later |
| Hide Enterprise / templates | Flags + CSS (done) | Optional |
| BacksterOS projects/tasks on canvas | Plugin (limited) | First-class panels |
| Per-project member visibility | Not in upstream | Custom permissions |
| Replace team switcher with brand | CSS/JS inject (done) | Native sidebar |

## Suggested phases

1. **Scaffold** (this folder) — docs, branding, deploy notes in-repo.
2. **Vendor** — clone Penpot into `design/penpot/`, pin a version tag, document build.
3. **Custom image** — build frontend/backend from fork; deploy from `design/deploy/`.
4. **Features** — permissions, BacksterOS integration, remove inject hacks as they land in source.

## Non-goals (for now)

- Replacing Penpot’s canvas engine.
- Publishing a public SaaS fork.
