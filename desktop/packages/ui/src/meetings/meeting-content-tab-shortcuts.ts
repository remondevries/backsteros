export const MEETING_CONTENT_TAB_ORDER = [
  "summary",
  "notes",
  "transcription",
] as const;

export type MeetingContentTab = (typeof MEETING_CONTENT_TAB_ORDER)[number];

/**
 * `1` → Summary, `2` → Notes, `3` → Transcription.
 */
export function resolveMeetingContentTabFromShortcutKey(
  key: string,
  modifiers: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  } = {},
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
  return MEETING_CONTENT_TAB_ORDER[index - 1] ?? null;
}
