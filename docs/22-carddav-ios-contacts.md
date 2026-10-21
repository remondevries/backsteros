# CardDAV — iOS Contacts ↔ BacksterOS

See [ADR-038](10-decisions-log.md) and [URLs](11-urls-and-routing.md).

## Create a CardDAV API key

1. Open BacksterOS desktop → Settings → API keys.
2. Create a key named e.g. `iOS CardDAV`.
3. Enable **only** the `carddav` scope (do not grant `tasks:*` / `documents:*`).
4. Copy the `sk_live_…` secret once — that is the CardDAV password.

## Add the account on iPhone / iPad

1. Settings → Contacts → Accounts → Add Account → Other → **Add CardDAV Account**.
2. Server: `contacts.backsteros.com`
3. User Name: `carddav`
4. Password: the `sk_live_…` secret
5. Description: `BacksterOS` (optional)

If iOS asks for an account URL:

`https://contacts.backsteros.com/dav/addressbooks/carddav/contacts/`

## Behaviour

- Shows **all** workspace contacts (every CRM group).
- Edits on the phone write to cloud-core and replicate to local-core / desktop (last-write-wins).
- Edits in BacksterOS appear on the phone on the next CardDAV sync.
- Contact photo = **personal** avatar only (not the portal avatar).

## Ops

- DNS: Cloudflare A `contacts.backsteros.com` → lemodesign `188.34.196.92` (proxied).
- TLS: Caddy on lemodesign (`/home/deploy/chatwoot/Caddyfile`) reverse_proxy to `172.18.0.1:8788`.
- App routes: cloud-core `/.well-known/carddav` and `/dav/*`.
