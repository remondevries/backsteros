/**
 * Collapse agent/task/meeting/comment activity between emails behind a
 * "View details" spacer so the thread stays email-first (OS-100 follow-up).
 */

export type EmailThreadTimelineKind = "email" | "reply" | "detail";

export type EmailThreadTimelineItem<T = unknown> = {
  key: string;
  at: number;
  kind: EmailThreadTimelineKind;
  node: T;
};

export type EmailThreadTimelineSegment<T = unknown> =
  | { type: "email"; key: string; item: EmailThreadTimelineItem<T> }
  | {
      type: "details";
      key: string;
      items: EmailThreadTimelineItem<T>[];
    };

/** True for messages that stay visible (sent/received/draft chrome). */
export function isEmailThreadPrimaryKind(
  kind: EmailThreadTimelineKind,
): boolean {
  return kind === "email" || kind === "reply";
}

/**
 * Group sorted timeline items into primary emails and detail runs between them.
 * Detail runs keep chronological order inside the group.
 */
export function groupEmailThreadTimeline<T>(
  items: readonly EmailThreadTimelineItem<T>[],
): EmailThreadTimelineSegment<T>[] {
  const segments: EmailThreadTimelineSegment<T>[] = [];
  let pending: EmailThreadTimelineItem<T>[] = [];

  const flushDetails = () => {
    if (pending.length === 0) return;
    const first = pending[0]!;
    const last = pending[pending.length - 1]!;
    segments.push({
      type: "details",
      key: `details:${first.key}..${last.key}`,
      items: pending,
    });
    pending = [];
  };

  for (const item of items) {
    if (isEmailThreadPrimaryKind(item.kind)) {
      flushDetails();
      segments.push({ type: "email", key: item.key, item });
      continue;
    }
    pending.push(item);
  }
  flushDetails();
  return segments;
}

/** Last details group that sits immediately before a reply draft (or at end). */
export function findLiveEmailThreadDetailsKey<T>(
  segments: readonly EmailThreadTimelineSegment<T>[],
): string | null {
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]!;
    if (segment.type === "details") return segment.key;
    if (segment.type === "email" && segment.item.kind === "reply") continue;
    if (segment.type === "email") break;
  }
  return null;
}
