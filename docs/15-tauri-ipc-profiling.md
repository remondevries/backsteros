# Tauri IPC profiling (desktop)

Audit of `invoke` / event traffic between the Vite shell and Rust
(`desktop/src-tauri`). Use with the dev-only counters in
`desktop/src/lib/tauri-invoke-instrumentation.ts`.

## How to measure

1. Run `pnpm --filter @backsteros/desktop dev`.
2. In the webview console:

```js
resetTauriInvokeStats?.();
// wait ~10–20s of normal use
getTauriInvokeStats?.();
// or: window.__BACKSTEROS_INVOKE_STATS__
```

3. Sustained rate ≈ `count / elapsedSeconds` per command.

**Batching gate:** consider batching or switching to push events when a command
exceeds **~10 invokes/sec sustained** during idle or light UI work.

## Command inventory (steady / interactive)

| Command | Caller | Pattern (pre-8b) | Approx rate |
| --- | --- | --- | --- |
| `system_stats` | `desktop-status-bar-metrics.tsx` | Interval invoke every **2s** | **~0.5/s** |
| `cursor_usage` | `cursor-credits-usage-bar.tsx` | Interval every **5 min** | ~0.003/s |
| `whoop_status` / `whoop_fetch_day` | Whoop settings / status | On demand / rare poll | bursty |
| Overlay toggles (`toggle_desktop_overlay_*`, `hide_desktop_overlay`, `resize_desktop_overlay`, `focus_main_window`) | `desktop-overlay.ts` | User gesture | bursty |
| `agent_browser_*` | `agent-browser-webview.ts` | Tab create / navigate / bounds | bursty |
| `close_oauth_windows` | Auth recovery | After OAuth | rare |

Events (push, not invoke): `agent-browser:load`, `agent-browser:title`,
overlay toggle events, external open-href.

## Findings (Phase 8a)

- No command meets the **>10/s** batching gate under normal desktop use.
- **`system_stats` at ~0.5/s** is the highest *steady* poller. It does **not**
  justify a general IPC batching layer, but request/response polling still
  pays invoke overhead every tick for the same payload shape.
- **Recommendation (8b candidate 1):** emit `system-stats-update` from Rust on
  a fixed interval and have the status bar `listen` instead of polling
  `invoke("system_stats")`. Keep one-shot `system_stats` for ad-hoc reads.

## Status after 8b

Status bar metrics subscribe to `system-stats-update` (Rust thread, 2s). Disk
path updates go through `set_system_stats_disk_path`. One-shot `system_stats`
remains available.
