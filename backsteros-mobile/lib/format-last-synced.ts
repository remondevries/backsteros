/** Relative “last synced” label — matches `@backsteros/ui` / desktop profile menu. */
export function formatLastSyncedAt(date: Date, nowMs = Date.now()): string {
  const diffMs = Math.max(0, nowMs - date.getTime());
  if (diffMs < 60_000) {
    return "Just now";
  }
  if (diffMs < 3_600_000) {
    return `${Math.floor(diffMs / 60_000)}m ago`;
  }

  const sameDay = new Date(nowMs).toDateString() === date.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
