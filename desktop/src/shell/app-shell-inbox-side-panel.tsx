import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  InboxSidePanelView,
  findInboxItemBySlugOrId,
  getInboxAttentionKeyboardItemIds,
  getInboxItemHref,
  getSelectedInboxSlugFromPathname,
  parseEmailDraftPath,
  parseEmailMessagePath,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  type InboxSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import {
  prefetchEmailDraftDetail,
  prefetchEmailMessageDetail,
} from "../lib/email-message-detail-cache";

type SidePanelNavProps = { onNavigate: (href: string) => void };

/** Eager inbox side panel — default cold-start route. */
export function DesktopInboxSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  InboxSidePanelViewProps,
  | "highlightedId"
  | "listRef"
  | "listContainerProps"
  | "collapsedGroups"
  | "onToggleGroup"
> &
  SidePanelNavProps) {
  const listRef = useRef<HTMLElement>(null);
  const { pathname, items, groupByAttentionStatus = false } = viewProps;
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const selectedSlug = getSelectedInboxSlugFromPathname(pathname);
  const emailPath = parseEmailMessagePath(pathname);
  const draftPath = parseEmailDraftPath(pathname);
  const selectedId = draftPath
    ? (items.find(
        (entry) =>
          entry.kind === "email" &&
          entry.inboxId === draftPath.inboxId &&
          (entry.draftId === draftPath.draftId ||
            entry.messageId === draftPath.draftId),
      )?.id ?? null)
    : emailPath
      ? (items.find(
          (entry) =>
            entry.kind === "email" &&
            entry.inboxId === emailPath.inboxId &&
            entry.messageId === emailPath.messageId,
        )?.id ?? null)
      : selectedSlug
        ? (findInboxItemBySlugOrId(items, selectedSlug)?.id ?? null)
        : null;
  const itemIds = useMemo(() => {
    if (groupByAttentionStatus) {
      return getInboxAttentionKeyboardItemIds(
        items,
        collapsedGroups,
        new Date(),
        viewProps.attentionGroupOverrides,
      );
    }
    return items.map((item) => item.id);
  }, [
    collapsedGroups,
    groupByAttentionStatus,
    items,
    viewProps.attentionGroupOverrides,
  ]);
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      if (item) onNavigate(getInboxItemHref(item, items));
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: itemIds.length > 0,
  });
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );

  const { client } = useDesktopApi();
  useEffect(() => {
    const item = items.find((entry) => entry.id === highlightedId);
    if (item?.kind === "email") {
      if (item.draftId?.trim()) {
        prefetchEmailDraftDetail(client, item.inboxId, item.draftId);
      } else {
        prefetchEmailMessageDetail(client, item.inboxId, item.messageId);
      }
    }
  }, [client, highlightedId, items]);

  return (
    <InboxSidePanelView
      {...viewProps}
      collapsedGroups={collapsedGroups}
      onToggleGroup={(status) => {
        setCollapsedGroups((current) => {
          const next = new Set(current);
          if (next.has(status)) next.delete(status);
          else next.add(status);
          return next;
        });
      }}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}
