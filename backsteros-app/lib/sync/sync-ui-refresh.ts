/** BroadcastChannel name — other tabs refresh RSC when one tab finishes a cloud pull. */
export const SYNC_UI_REFRESH_CHANNEL = "circle-sync-ui-refresh";

/** Window event for same-tab client refresh (mobile pull-to-refresh, local hooks). */
export const SYNC_UI_REFRESH_EVENT = "circle-sync-ui-refresh";

export function broadcastSyncUiRefresh(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SYNC_UI_REFRESH_EVENT));
  }

  if (typeof BroadcastChannel === "undefined") {
    return;
  }

  try {
    const channel = new BroadcastChannel(SYNC_UI_REFRESH_CHANNEL);
    channel.postMessage({ type: "refresh" });
    channel.close();
  } catch {
    // Ignore unsupported or blocked channels.
  }
}
