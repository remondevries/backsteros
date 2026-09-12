import { useEffect, useMemo, useRef } from "react";

import {
  InboxSidePanelView,
  buildCommunicationItemHrefById,
  findCommunicationItemBySlugOrId,
  getCommunicationItemHref,
  getFirstCommunicationItemHref,
  getSelectedCommunicationSlugFromPathname,
  parseEmailMessagePath,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  type InboxSidePanelViewProps,
} from "@backsteros/ui";

import { useKeepAliveActive } from "../../lib/shell-route-keep-alive";
import type { SidePanelNavProps } from "./types.js";

export function DesktopCommunicationSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  InboxSidePanelViewProps,
  | "highlightedId"
  | "listRef"
  | "listContainerProps"
  | "title"
  | "hrefById"
  | "resolveSelectedSlug"
  | "emptyLabel"
> &
  SidePanelNavProps) {
  const listRef = useRef<HTMLElement>(null);
  const keepAliveActive = useKeepAliveActive();
  const { pathname, items } = viewProps;
  const { setActiveZone } = useListKeyboardNavigationZone();
  const selectedSlug = getSelectedCommunicationSlugFromPathname(pathname);
  const emailPath = parseEmailMessagePath(pathname);
  const selectedId = emailPath
    ? (items.find(
        (entry) =>
          entry.kind === "email" &&
          entry.inboxId === emailPath.inboxId &&
          entry.messageId === emailPath.messageId,
      )?.id ?? null)
    : selectedSlug
      ? (findCommunicationItemBySlugOrId(items, selectedSlug)?.id ?? null)
      : null;

  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const hrefById = useMemo(
    () => buildCommunicationItemHrefById(items),
    [items],
  );

  const landingId = itemIds[0] ?? null;
  const lastLandingKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!keepAliveActive || itemIds.length === 0 || landingId == null) return;
    if (lastLandingKeyRef.current === "active") return;
    lastLandingKeyRef.current = "active";
    const frame = requestAnimationFrame(() => {
      setActiveZone(LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL, {
        preferSidepanelForJk: true,
        activate: true,
        landAtStart: true,
        highlightItemId: landingId,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [keepAliveActive, itemIds.length, landingId, setActiveZone]);

  useEffect(() => {
    if (!keepAliveActive) {
      lastLandingKeyRef.current = null;
    }
  }, [keepAliveActive]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      if (item) {
        onNavigate(
          hrefById.get(item.id) ?? getCommunicationItemHref(item, items),
        );
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: keepAliveActive && itemIds.length > 0,
  });
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );

  return (
    <InboxSidePanelView
      {...viewProps}
      title="Communication"
      emptyLabel="No support tickets or email yet."
      hrefById={hrefById}
      resolveSelectedSlug={getSelectedCommunicationSlugFromPathname}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}

export function getCommunicationSidePanelFirstHref(
  items: InboxSidePanelViewProps["items"],
): string | null {
  return getFirstCommunicationItemHref(items);
}
