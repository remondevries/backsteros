/**
 * Open Director room sessions keyed by meeting id (from product tabs).
 *
 * Room routes are outlet-mounted today, so switching tabs would unmount
 * DirectorRoom and disconnect LiveKit. The keep-alive host mounts one session
 * per open room tab and only tears down when that tab closes.
 *
 * Visible room UI (breadcrumb toggles, meetings rail, Director pane) belongs
 * only to the active room route. Backgrounded sessions keep LiveKit + tab
 * media indicators — not shell chrome.
 */

export type RoomSessionTabRef = {
  href: string;
};

let openMeetingIds: string[] = [];
let epoch = 0;
const listeners = new Set<() => void>();

function emit(): void {
  epoch += 1;
  for (const listener of listeners) listener();
}

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

/** Pure helper — which meeting ids have an open room product tab. */
export function collectOpenRoomMeetingIds(
  tabs: readonly RoomSessionTabRef[],
  isRoomPath: (href: string) => boolean,
  parseMeetingId: (href: string) => string | null,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const tab of tabs) {
    if (!isRoomPath(tab.href)) continue;
    const id = parseMeetingId(tab.href)?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Visit-gated mount set: sessions start only after the room route is opened
 * once, stay while their product tab remains open, and drop on tab close.
 * Switching the active tab must not remove an already-visited open room.
 */
export function nextVisitedRoomMeetingIds(
  current: readonly string[],
  openIds: readonly string[],
  activeMeetingId: string | null,
): string[] {
  const open = new Set(openIds);
  const next = current.filter((id) => open.has(id));
  if (
    activeMeetingId &&
    open.has(activeMeetingId) &&
    !next.includes(activeMeetingId)
  ) {
    next.push(activeMeetingId);
  }
  return next;
}

/**
 * Which mounted room may register breadcrumb / host chrome.
 * Only the active room route — never a backgrounded session on Tasks/Inbox.
 */
export function nextRoomChromeOwnerId(
  activeMeetingId: string | null,
  mountedIds: readonly string[],
): string | null {
  if (activeMeetingId && mountedIds.includes(activeMeetingId)) {
    return activeMeetingId;
  }
  return null;
}

/** True when this session should publish the room breadcrumb control bar. */
export function shouldRegisterRoomChrome(
  active: boolean,
  hasMeeting: boolean,
): boolean {
  return active && hasMeeting;
}

/**
 * Which room (if any) owns visible Director UI right now.
 *
 * Warm keep-alive flips (Inbox/Tasks/…) update `window.history` + the warm
 * visible surface but intentionally leave TanStack on the previous Outlet URL
 * (e.g. still `/…/room`). Room UI must follow warm visibility + the address
 * bar — never TanStack alone — or the Director layer stays `is-active` and
 * covers main content / sidepanels after Room → Inbox/Messages/Tasks.
 *
 * Outlet→outlet is the inverse race (Room → Task-email): TanStack can commit
 * `/email/…` while `window.location` still reports `/…/room`. When
 * `routerPathname` is provided and has left the room, deactivate even if the
 * address bar lags — otherwise Director stays `is-active` over EmailPage.
 */
export function resolveActiveRoomMeetingId(input: {
  visibleKeepAliveSurface: string | null;
  /** Trusted location pathname (address bar / warm href), not a stale router match. */
  pathname: string;
  /**
   * Live TanStack pathname when available. Used to clear the Director layer
   * after Room → other-outlet navigations where History briefly lags.
   */
  routerPathname?: string | null;
  isRoomPath: (pathname: string) => boolean;
  parseMeetingId: (pathname: string) => string | null;
}): string | null {
  if (input.visibleKeepAliveSurface != null) return null;
  if (
    input.routerPathname != null &&
    input.routerPathname !== "" &&
    !input.isRoomPath(input.routerPathname)
  ) {
    return null;
  }
  if (!input.isRoomPath(input.pathname)) return null;
  return input.parseMeetingId(input.pathname);
}

/**
 * Tab-separation snapshot used by shell + tests: visible room UI vs background
 * media keepalive.
 */
export type RoomTabSeparationSnapshot = {
  /** Meeting id allowed to register room breadcrumb chrome (or null). */
  chromeOwnerMeetingId: string | null;
  /** Meetings list replaces product nav only on a room route. */
  roomNavReplacementActive: boolean;
  /** Keep-alive Director layer is visually on top. */
  roomLayerActive: boolean;
  /** Sessions that stay LiveKit-connected (may include backgrounded rooms). */
  mediaMountedMeetingIds: string[];
};

export function resolveRoomTabSeparation(input: {
  activeMeetingId: string | null;
  mountedIds: readonly string[];
}): RoomTabSeparationSnapshot {
  const mediaMountedMeetingIds = [...input.mountedIds];
  const chromeOwnerMeetingId = nextRoomChromeOwnerId(
    input.activeMeetingId,
    input.mountedIds,
  );
  const onRoomRoute = Boolean(input.activeMeetingId);
  return {
    chromeOwnerMeetingId,
    roomNavReplacementActive: onRoomRoute,
    roomLayerActive: onRoomRoute,
    mediaMountedMeetingIds,
  };
}

export function setOpenRoomMeetingIds(next: readonly string[]): void {
  const normalized = next
    .map((id) => id.trim())
    .filter(Boolean);
  if (sameIds(openMeetingIds, normalized)) return;
  openMeetingIds = normalized;
  emit();
}

export function getOpenRoomMeetingIds(): readonly string[] {
  return openMeetingIds;
}

export function getOpenRoomMeetingIdsEpoch(): number {
  return epoch;
}

export function subscribeOpenRoomMeetingIds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — wipe module state between cases. */
export function resetOpenRoomMeetingIdsForTests(): void {
  openMeetingIds = [];
  epoch = 0;
  listeners.clear();
}
