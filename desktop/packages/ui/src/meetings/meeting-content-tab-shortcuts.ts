/** Always-visible meeting content tabs. */
export const MEETING_BASE_CONTENT_TAB_ORDER = ["summary", "notes"] as const;

/** Video-call-only tabs (transcription + portal details). */
export const MEETING_VIDEO_CALL_CONTENT_TAB_ORDER = [
  "transcription",
  "details",
] as const;

/** @deprecated Use {@link buildMeetingContentTabOrder} — full list when all tabs show. */
export const MEETING_CONTENT_TAB_ORDER = [
  "summary",
  "notes",
  "transcription",
] as const;

export const MEETING_DETAILS_TAB = "details" as const;

export type MeetingContentTab =
  | (typeof MEETING_BASE_CONTENT_TAB_ORDER)[number]
  | (typeof MEETING_VIDEO_CALL_CONTENT_TAB_ORDER)[number];

export function isVideoCallMeetingFormat(
  format: string | null | undefined,
): boolean {
  return (format ?? "video_call") === "video_call";
}

/** Visible pill tabs for the open meeting, in display order. */
export function buildMeetingContentTabOrder(options: {
  isVideoCall: boolean;
}): MeetingContentTab[] {
  if (!options.isVideoCall) {
    return [...MEETING_BASE_CONTENT_TAB_ORDER];
  }
  return [
    ...MEETING_BASE_CONTENT_TAB_ORDER,
    ...MEETING_VIDEO_CALL_CONTENT_TAB_ORDER,
  ];
}

/**
 * Maps digit keys to the currently visible content tabs (`1` → first tab, etc.).
 */
export function resolveMeetingContentTabFromShortcutKey(
  key: string,
  modifiers: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  } = {},
  visibleTabs: readonly MeetingContentTab[] = buildMeetingContentTabOrder({
    isVideoCall: true,
  }),
): MeetingContentTab | null {
  if (
    modifiers.metaKey ||
    modifiers.ctrlKey ||
    modifiers.altKey ||
    modifiers.shiftKey
  ) {
    return null;
  }
  const index = Number.parseInt(key, 10);
  if (!Number.isInteger(index) || index < 1) return null;
  return visibleTabs[index - 1] ?? null;
}
