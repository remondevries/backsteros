# CardDAV — iOS Contacts ↔ BacksterOS

See [ADR-038](10-decisions-log.md) and [URLs](11-urls-and-routing.md).

## Create a CardDAV API key

1. Open BacksterOS desktop → Settings → API keys.
2. Create a key named e.g. `iOS CardDAV`.
3. Enable **only** the `carddav` scope (do not grant `tasks:*` / `documents:*`).
4. Copy the `sk_live_…` secret once — that is the CardDAV password.

Alternatively, cloud-core may set `CARDDAV_PASSWORD` (short shared Basic password) for device testing. Prefer a scoped API key for long-term use.

## Add the account on iPhone / iPad

1. Settings → Contacts → Accounts → Add Account → Other → **Add CardDAV Account**.
2. Server: `contacts.backsteros.com`
3. User Name: `backsteros`
4. Password: the `sk_live_…` secret (or `CARDDAV_PASSWORD` if configured)
5. Description: `BacksterOS` (optional)

If iOS asks for an account URL:

`https://contacts.backsteros.com/dav`

## Behaviour

- Two address books (iOS may list both under the account):
  - **BacksterOS Contacts** — people (`/dav/contacts/`)
  - **BacksterOS Organizations** — company cards (`/dav/organizations/`, `X-ABShowAs:COMPANY`)
- Edits on the phone write to cloud-core and replicate to local-core / desktop (last-write-wins).
- Edits in BacksterOS appear on the phone on the next CardDAV sync.
- Contact photo = **personal** avatar only (not the portal avatar). Organization photo = the same **organization** avatar the API uses. CardDAV serves ≤512px JPEG ≤160 KB (under [Apple’s](https://support.apple.com/en-us/103188) 224 KB photo / 256 KB vCard caps).

## Ops

- DNS: Cloudflare A `contacts.backsteros.com` → lemodesign `188.34.196.92` (**DNS only**, not proxied — CF browser integrity breaks CardDAV from iOS).
- TLS: Caddy on lemodesign (`/home/deploy/chatwoot/Caddyfile`) reverse_proxy to `172.18.0.1:8788`.
- App routes: `/.well-known/carddav` → principal; `/dav/` home-set; `/dav/contacts/` people; `/dav/organizations/` company cards.
