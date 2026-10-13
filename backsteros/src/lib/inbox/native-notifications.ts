import type { InboxTriageNotificationPayload } from "@backsteros/contracts";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const recentKeys = new Set<string>();
const MAX_RECENT = 200;

export function noteInboxTriageNotificationShown(key: string): void {
  recentKeys.add(key);
  if (recentKeys.size > MAX_RECENT) {
    const first = recentKeys.values().next().value;
    if (first) recentKeys.delete(first);
  }
}

export function wasInboxTriageNotificationShownRecently(key: string): boolean {
  return recentKeys.has(key);
}

export async function showNativeInboxTriageNotification(
  payload: InboxTriageNotificationPayload,
): Promise<void> {
  return showNativeWorkspaceNotification(payload);
}

export async function showNativeWorkspaceNotification(payload: {
  key: string;
  title: string;
  body: string;
}): Promise<void> {
  if (wasInboxTriageNotificationShownRecently(payload.key)) return;

  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (!granted) return;

    sendNotification({
      title: payload.title,
      body: payload.body,
    });
    noteInboxTriageNotificationShown(payload.key);
  } catch {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission !== "granted") return;
    new Notification(payload.title, { body: payload.body });
    noteInboxTriageNotificationShown(payload.key);
  }
}
