/**
 * Start room → product-tab decision (new tab vs activate existing).
 *
 * Meeting detail / Agenda call {@link requestOpenHrefInNewTab} with
 * `/calendar/meetings/:id/room`. Opening a second tab for the same meeting
 * remounts another Director session and fights the keep-alive host. Prefer
 * activating the existing room tab when one is already open.
 */

import {
  isMeetingRoomPath,
  normalizeTabHref,
  parseMeetingRoomMeetingId,
  type ProductTab,
} from "@backsteros/ui/shell";

export function meetingRoomHref(meetingId: string): string {
  return `/calendar/meetings/${encodeURIComponent(meetingId.trim())}/room`;
}

export type StartRoomTabDecision =
  | { action: "activate"; tabId: string; href: string }
  | { action: "open"; href: string };

/**
 * Decide whether Start room should activate an existing room tab or open a new
 * one. Matching is by meeting id (URL-decoded), not raw href string equality.
 */
export function resolveStartRoomTabDecision(
  tabs: readonly Pick<ProductTab, "id" | "href">[],
  meetingId: string,
): StartRoomTabDecision {
  const id = meetingId.trim();
  const href = meetingRoomHref(id);
  if (!id) return { action: "open", href };

  for (const tab of tabs) {
    if (!isMeetingRoomPath(tab.href)) continue;
    const tabMeetingId = parseMeetingRoomMeetingId(tab.href);
    if (tabMeetingId && tabMeetingId === id) {
      return {
        action: "activate",
        tabId: tab.id,
        href: normalizeTabHref(tab.href),
      };
    }
  }
  return { action: "open", href };
}
