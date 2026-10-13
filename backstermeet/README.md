# BacksterMeet

Tauri 2 **Director** app — the host control surface during a live meeting. The portal (`LDP/Codebase`) is the **guest stage**; it subscribes to what the Director publishes over LiveKit.

Host and guests must share **one** LiveKit SFU (same signaling URL + API keys + room name) or they cannot see/hear each other.

## Features (host)

| Mode | Delivery | Host UI |
|------|----------|---------|
| **Local** | `bm.presentationMode=iframe` + `bm.presentationUrl` | URL bar + iframe preview; **Broadcast** sends to guests |
| **Screenshare** | Viewport video track `presentation-viewport` | **Broadcast** → OS share picker + live preview |

LiveKit participant attributes: `bm.presentation`, `bm.presentationKind`, `bm.presentationMode`, `bm.presentationUrl`, `bm.presentationViewport`.

## Stack

- Tauri 2 (Rust host token in production builds)
- Vite + React + TypeScript
- livekit-client

## Shared SFU (production)

Production LiveKit runs on Hetzner next to the portal. Guests connect via the portal proxy; the Director uses the same public WSS URL.

| Role | Connect URL |
|------|-------------|
| Guest (portal) | `wss://client.lemo-design.com/livekit` |
| Host (BacksterMeet) | same — from `LIVEKIT_CLIENT_URL` / `LIVEKIT_URL` in secrets |

Secrets: `~/.config/secrets/livekit.env` (Infisical `services`):

```bash
LIVEKIT_URL=wss://client.lemo-design.com/livekit
LIVEKIT_CLIENT_URL=wss://client.lemo-design.com/livekit
LIVEKIT_API_KEY=devkey          # must match Hetzner livekit.yaml
LIVEKIT_API_SECRET=secret
LIVEKIT_ROOM=backstermeet-dev   # fallback when launch has no meetingId
```

`meetingId` in the launch query string becomes the LiveKit room name (must match the guest join link).

## Develop

```bash
# Optional: local-only SFU spike (set LIVEKIT_* to ws://127.0.0.1:7880 in livekit.env)
docker start livekit-dev || docker run -d --name livekit-dev \
  -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server:latest --dev --bind 0.0.0.0

# from the monorepo root
pnpm install
pnpm --filter @backsteros/meet tauri dev
```

For talking to **production** portal guests, keep `LIVEKIT_CLIENT_URL=wss://client.lemo-design.com/livekit` (do not point the Director at a local SFU).

### Meeting context (query string)

```text
http://localhost:1430/?meetingId=<uuid>&title=Demo&start=2026-09-17T14:00:00Z
```

**Dev:** host token from Vite middleware `/api/livekit-host-token`.  
**Production Tauri:** Rust command `mint_livekit_host_token`.

### Presentation workflow

1. **g+p** — open host presentation layout (animation)  
2. Toolbar **Local** / **Screenshare** — pick a mode (also opens host layout)  
3. **Broadcast** — guests receive it / guest presentation animation  
4. Switch modes while live — guests stay on the current broadcast until you Broadcast the new mode (replace) or Stop  
5. **Stop broadcast** — guests leave presentation; host prepare UI stays  
6. **g+p** again (or Escape) — leave presentation 

## Product identity

- Product name: `BacksterMeet`
- Bundle id: `com.backsteros.meet`
