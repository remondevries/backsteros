/** Inbox list ids and triage rules for portal meeting bookings. */

const MEETING_INBOX_ITEM_PREFIX = "meeting:";

export function meetingInboxItemId(meetingId: string): string {
  return `${MEETING_INBOX_ITEM_PREFIX}${meetingId.trim()}`;
}

export function parseMeetingInboxItemId(itemId: string): string | null {
  const trimmed = itemId.trim();
  if (!trimmed.startsWith(MEETING_INBOX_ITEM_PREFIX)) return null;
  const id = trimmed.slice(MEETING_INBOX_ITEM_PREFIX.length).trim();
  return id || null;
}

/** Incoming / triage bookings stay in Inbox until reviewed. */
export function meetingBelongsInInbox(input: {
  status?: string | null;
}): boolean {
  const trimmed = input.status?.trim();
  if (!trimmed) return false;
  return trimmed === "triage";
}
