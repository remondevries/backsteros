import { normalizeTabHref } from "@backsteros/ui/shell";

/**
 * While activate/close arms a pending tab switch, location may still report the
 * previous route after `activeTabId` has already flipped. Clearing pending and
 * syncing in that window rewrites the newly activated tab's bookmark to the
 * old path (Room → Email: email tab becomes `/…/room`).
 *
 * Only clear when the live location key matches the pending target href.
 */
export function shouldClearPendingTabSwitch(input: {
  pending: { tabId: string; href: string } | null;
  activeTabId: string;
  locationKey: string;
}): boolean {
  const { pending, activeTabId, locationKey } = input;
  if (!pending) return false;
  if (pending.tabId !== activeTabId) return false;
  return (
    normalizeTabHref(locationKey) === normalizeTabHref(pending.href)
  );
}
