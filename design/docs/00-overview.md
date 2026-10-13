# BacksterDESIGN overview

BacksterDESIGN is the design surface for BacksterOS: files, canvases, and (later) links to BacksterOS projects and tasks.

## Current runtime

| Piece | Where |
| --- | --- |
| Compose / data | `development` host — `/home/deploy/penpot` |
| Product branding | `design/branding/` in this monorepo |
| Upstream product | Penpot 2.18 (Docker images) |

## Direction

1. Keep stock images only while branding/config is enough.
2. Vendor a Penpot fork under `design/penpot/` when we need core UI or permission model changes.
3. Build BacksterOS bridges (API, canvas links) as first-class UI — not only plugins.
