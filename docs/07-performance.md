# Performance and lightweight clients

Target hardware: **iPhone 16**, **MacBook M1**. Goal: snappy UI, low memory.

## Why this stack is lightweight

| Choice | Effect |
| --- | --- |
| PowerSync + partial sync | Small local DB; instant list reads |
| Tier D on demand | No 100 GB on device |
| Tauri not Electron | ~50–150 MB shell vs 300+ MB |
| Vite client, no Node sidecar | No 200–500 MB Next server in desktop app |
| Expo native UI | Not full Next.js in WebView |
| Meilisearch on server | Search not scanning 1500 files on phone |

## Non-negotiable performance rules

1. **No Tier C/D bulk sync** to clients by default
2. **Discard content cache** when user leaves document screen
3. **FlashList** (or equivalent) for task/project lists
4. **Desktop: no embedded API server** — remote `backsteros-api` only
5. **PDF:** stream pages or presigned URL; do not load entire 50 MB into RAM
6. **CodeMirror:** avoid multi-MB single buffers on mobile v1

## iPhone (Expo)

| Do | Avoid |
| --- | --- |
| Sync task/project/letter **indexes** | Bootstrap all markdown bodies |
| Fetch content on tap | Keep PDFs in memory after close |
| Hermes + New Architecture | Duplicate 800-line route shim |
| PowerSync bounded sync rules | Full vault replica |

Expected: tens to low hundreds MB RAM at idle — normal for React Native.

## MacBook M1 (Tauri)

| Do | Avoid |
| --- | --- |
| Load `backsteros-app/dist` in WebView | Bundle Node + Next standalone |
| PowerSync web SQLite for offline metadata | Sync entire Spaces bucket locally |
| Close unused document tabs | Background full-corpus index build |

Legacy Circle desktop (Tauri + Next sidecar) is significantly heavier than target architecture.

## Snappiness = architecture not framework

Linear feels fast because:

- UI reads local DB first
- Network only for deltas
- Heavy blobs fetched on demand

Same rules apply here.

## PowerSync sync rule guidance

Sync to mobile/desktop:

- `tasks`, `projects`, `contacts`, `organizations` (full rows)
- `documents` metadata columns only — **not** `body`
- `letters` metadata only — **not** `pdf_bytes`
- `journal` date + title + snippet — **not** full entry body by default

## Monitoring (later)

- Client: optional debug overlay for local DB size
- Server: object storage growth, Meilisearch index size, Postgres row counts

## Phase 1 performance bar

| Action | Target |
| --- | --- |
| Open task list (offline) | &lt; 100 ms perceived |
| Open task list (online, cached) | &lt; 100 ms |
| Open document (online) | &lt; 500 ms to first content |
| Agent edit → open editor refresh | &lt; 2 s (Phase 2 live docs) |
