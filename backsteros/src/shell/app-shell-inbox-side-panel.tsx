import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  InboxSidePanelModeFooter,
  InboxSidePanelView,
  RegisterEntityDeleteAction,
  filterInboxItemsByListMode,
  findInboxItemBySlugOrId,
  getInboxAttentionKeyboardItemIds,
  getInboxItemHref,
  getSelectedInboxSlugFromPathname,
  inboxListModeLabel,
  parseEmailDraftPath,
  parseEmailMessagePath,
  useInboxListMode,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  type InboxSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import {
  deleteEmailMessage,
  emailDeleteEntityLabel,
} from "../lib/delete-email-message";
import {
  prefetchEmailDraftDetail,
  prefetchEmailMessageDetail,
} from "../lib/email-message-detail-cache";
import { useKeepAliveActive } from "../lib/shell-route-keep-alive";

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
  | "footer"
  | "title"
> &
  SidePanelNavProps) {
  const listRef = useRef<HTMLElement>(null);
  const keepAliveActive = useKeepAliveActive();
  const [listMode, setListMode] = useInboxListMode();
  const { pathname, items: allItems, groupByAttentionStatus = false } =
    viewProps;
  const items = useMemo(
    () => filterInboxItemsByListMode(allItems, listMode),
    [allItems, listMode],
  );
  // Agents mode is already a single list — skip the redundant "Agents" subgroup.
  const groupItems =
    listMode === "agents" ? false : groupByAttentionStatus;
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const { activeZone, setActiveZone } = useListKeyboardNavigationZone();
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
    if (groupItems) {
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
    groupItems,
    items,
    viewProps.attentionGroupOverrides,
  ]);

  // When Inbox becomes the visible surface, claim the side-panel zone and land
  // keyboard highlight on the open row (or first when nothing is selected).
  const landingId = selectedId ?? itemIds[0] ?? null;
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

  // When the open row is not in this mode's list (mode switch, or cold open
  // with a selection that belongs to the other mode), land on the first row.
  const lastModeRef = useRef(listMode);
  useEffect(() => {
    if (!keepAliveActive) return;
    const modeChanged = lastModeRef.current !== listMode;
    lastModeRef.current = listMode;
    if (selectedId != null) return;
    const pathHasSelection = Boolean(selectedSlug || emailPath || draftPath);
    if (!modeChanged && !pathHasSelection) return;
    const first = items[0];
    onNavigate(first ? getInboxItemHref(first, items) : "/inbox");
  }, [
    draftPath,
    emailPath,
    keepAliveActive,
    items,
    listMode,
    onNavigate,
    selectedId,
    selectedSlug,
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
    enabled: keepAliveActive && itemIds.length > 0,
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

  // When an email is open in the main pane, detail owns D — avoid stealing it.
  const highlightedEmailItem =
    !emailPath &&
    highlightedId &&
    activeZone === LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL
      ? (() => {
          const item = items.find((entry) => entry.id === highlightedId);
          if (
            !item ||
            item.kind !== "email" ||
            item.draftId?.trim()
          ) {
            return null;
          }
          return item;
        })()
      : null;

  const modeTitle = inboxListModeLabel(listMode);

  return (
    <>
      {keepAliveActive && highlightedEmailItem ? (
        <RegisterEntityDeleteAction
          entityLabel={emailDeleteEntityLabel(highlightedEmailItem.title)}
          confirmLabel="Delete email"
          actionVerb="Delete"
          onDelete={() =>
            deleteEmailMessage(client, {
              inboxId: highlightedEmailItem.inboxId,
              messageId: highlightedEmailItem.messageId,
              threadId: highlightedEmailItem.threadId,
            })
          }
        />
      ) : null}
      <InboxSidePanelView
        {...viewProps}
        items={items}
        title={modeTitle}
        emptyLabel={null}
        groupByAttentionStatus={groupItems}
        onCreateTask={
          listMode === "notifications" ? viewProps.onCreateTask : undefined
        }
        onComposeEmail={
          listMode === "notifications" ? viewProps.onComposeEmail : undefined
        }
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
        footer={
          <InboxSidePanelModeFooter
            mode={listMode}
            onModeChange={setListMode}
          />
        }
      />
    </>
  );
}
