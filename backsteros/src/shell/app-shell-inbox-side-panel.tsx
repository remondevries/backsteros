import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  CommunicationMessagesList,
  HairlineEmptyFigure,
  INBOX_MESSAGES_HIDDEN_STATUSES,
  InboxSidePanelModeFooter,
  InboxSidePanelView,
  RegisterEntityDeleteAction,
  getInboxAttentionKeyboardItemIds,
  getInboxItemHref,
  inboxListModeLabel,
  isInboxEmailShellPath,
  resolveInboxListItemIdFromPathname,
  resolveInboxOpenTarget,
  resolveInboxPanelPathname,
  useInboxListModeShortcuts,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  type InboxEmailListItem,
  type InboxListItem,
  type InboxListMode,
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
import { useInboxModeModel } from "../lib/inbox/inbox-mode-model";
import {
  useKeepAliveActive,
  useShellLocation,
} from "../lib/shell-route-keep-alive";
import { RouterLink } from "./app-shell-links";

const NO_IDS: readonly string[] = [];

export function inboxModeEmptyLabel(mode: InboxListMode): string {
  if (mode === "agents") return "No Agents";
  if (mode === "messages") return "No Messages";
  return "No Notifications";
}

function InboxSidePanelEmptyFigure({ mode }: { mode: InboxListMode }) {
  const label = inboxModeEmptyLabel(mode);
  return (
    <HairlineEmptyFigure figure="stack" size={120} label={label} caption={label} />
  );
}

/**
 * Inbox side panel — list modes, j/k, and a single open-item pipeline so
 * Notifications / Messages / Agents stay in sync with the content pane
 * (InboxPage keep-alive + email Outlet). Data comes from the shared
 * {@link useInboxModeModel}; this component only owns presentation state.
 */
export function DesktopInboxSidePanel({
  onNavigate,
  renderTitleTrailing,
  isItemAgentWorking,
}: {
  onNavigate: (href: string) => void;
  renderTitleTrailing?: (item: InboxListItem) => ReactNode;
  isItemAgentWorking?: (item: InboxListItem) => boolean;
}) {
  const listRef = useRef<HTMLElement>(null);
  const keepAliveActive = useKeepAliveActive();
  const { pathname: shellPathname } = useShellLocation();
  const {
    listMode,
    setListMode,
    modeItems: items,
    messages,
    loading,
    pending,
    attentionGroupOverrides,
    chat,
    contactAvatarSrc,
    organizationAvatarSrc,
  } = useInboxModeModel();
  useInboxListModeShortcuts({
    enabled: keepAliveActive,
    mode: listMode,
    onModeChange: setListMode,
  });
  const isMessages = listMode === "messages";
  // Notifications groups by attention; Agents is a single-purpose list;
  // Messages uses the Communication status groups.
  const groupItems = listMode === "notifications";
  const pathname = useMemo(
    () =>
      resolveInboxPanelPathname({
        shellPathname,
        mode: listMode,
        items,
      }),
    [items, listMode, shellPathname],
  );
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [messagesKeyboardIds, setMessagesKeyboardIds] =
    useState<readonly string[]>(NO_IDS);
  const [messagesHighlightedId, setMessagesHighlightedId] = useState<
    string | null
  >(null);
  // The Messages list unmounts on mode switch — drop its stale j/k state so
  // the open-on-highlight effect cannot reopen an old row on return.
  useEffect(() => {
    if (isMessages) return;
    setMessagesHighlightedId(null);
    setMessagesKeyboardIds(NO_IDS);
  }, [isMessages]);
  const { activeZone, setActiveZone } = useListKeyboardNavigationZone();
  const selectedId = resolveInboxListItemIdFromPathname(pathname, items);
  const shellSelectedId = resolveInboxListItemIdFromPathname(
    shellPathname,
    items,
  );
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const itemIds = useMemo((): readonly string[] => {
    if (isMessages) return messagesKeyboardIds;
    if (groupItems) {
      return getInboxAttentionKeyboardItemIds(
        items,
        collapsedGroups,
        new Date(),
        attentionGroupOverrides,
      );
    }
    return items.map((item) => item.id);
  }, [
    attentionGroupOverrides,
    collapsedGroups,
    groupItems,
    isMessages,
    items,
    messagesKeyboardIds,
  ]);

  // Claim the side-panel j/k zone on show and whenever the list mode changes —
  // otherwise the highlight stays on a row id from the previous mode.
  const landingId =
    selectedId != null && itemIds.includes(selectedId)
      ? selectedId
      : (itemIds[0] ?? null);
  const lastJkLandingKeyRef = useRef<string | null>(null);
  useEffect(() => {
    // Do not clear the landing key on freeze — thaw would re-fire landAtStart
    // and fight KeepAlivePane's zone reclaim (scroll jump on every return).
    if (!keepAliveActive) return;
    if (itemIds.length === 0 || landingId == null) return;
    const landingKey = listMode;
    if (lastJkLandingKeyRef.current === landingKey) return;
    lastJkLandingKeyRef.current = landingKey;
    const frame = requestAnimationFrame(() => {
      setActiveZone(LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL, {
        preferSidepanelForJk: true,
        activate: true,
        landAtStart: true,
        highlightItemId: landingId,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [keepAliveActive, itemIds, landingId, listMode, setActiveZone]);

  const openItem = useCallback(
    (itemId: string) => {
      const item = itemById.get(itemId);
      if (item) onNavigate(getInboxItemHref(item, items));
    },
    [itemById, items, onNavigate],
  );

  const { highlightedId: rowsHighlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: itemIds as string[],
    selectedId,
    onNavigate: openItem,
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: keepAliveActive && !isMessages && itemIds.length > 0,
  });
  const highlightedId = isMessages ? messagesHighlightedId : rowsHighlightedId;
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );

  // Structural open pipeline: mode switch, leave email outside Messages, and
  // inbox root. j/k highlight is handled separately so a stale ring cannot
  // yank the content pane after a Link click.
  const openTarget = useMemo(() => {
    // An in-flight list would send an empty pane to `/inbox`, or bounce a
    // deep-linked row that simply has not arrived yet.
    if (loading) return null;
    const target = resolveInboxOpenTarget({
      mode: listMode,
      shellPathname,
      items,
    });
    if (pending && target?.reason === "mode-mismatch") return null;
    return target;
  }, [items, listMode, loading, pending, shellPathname]);
  const lastOpenedHrefRef = useRef<string | null>(null);
  useEffect(() => {
    // Keep the dedupe key across freeze — clearing it made every thaw
    // re-navigate to openTarget (first row / mode seed) and yank content.
    if (!keepAliveActive) return;
    if (!openTarget) return;
    if (lastOpenedHrefRef.current === openTarget.href) return;
    lastOpenedHrefRef.current = openTarget.href;
    onNavigate(openTarget.href);
  }, [keepAliveActive, onNavigate, openTarget]);

  // Clear the dedupe key once the shell matches so revisits can reopen.
  useEffect(() => {
    if (openTarget == null && shellSelectedId != null) {
      lastOpenedHrefRef.current = null;
    }
  }, [openTarget, shellSelectedId]);

  // j/k only moves the orange highlight — open that row in the content pane.
  useEffect(() => {
    if (!keepAliveActive || highlightedId == null) return;
    if (shellSelectedId === highlightedId) return;
    const item = itemById.get(highlightedId);
    if (!item) return;
    const href = getInboxItemHref(item, items);
    if (lastOpenedHrefRef.current === href) return;
    lastOpenedHrefRef.current = href;
    onNavigate(href);
  }, [
    keepAliveActive,
    highlightedId,
    itemById,
    items,
    onNavigate,
    shellSelectedId,
  ]);

  const { client } = useDesktopApi();
  useEffect(() => {
    const item = highlightedId ? itemById.get(highlightedId) : undefined;
    if (item?.kind !== "email") return;
    if (item.draftId?.trim()) {
      prefetchEmailDraftDetail(client, item.inboxId, item.draftId);
    } else {
      prefetchEmailMessageDetail(client, item.inboxId, item.messageId);
    }
  }, [client, highlightedId, itemById]);

  // When an email is open in the main pane, detail owns D — avoid stealing it.
  const highlightedEmailItem = (() => {
    if (
      isInboxEmailShellPath(shellPathname) ||
      !highlightedId ||
      activeZone !== LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL
    ) {
      return null;
    }
    const item = itemById.get(highlightedId);
    if (!item || item.kind !== "email" || item.draftId?.trim()) return null;
    return item;
  })();

  const resolveEmailAvatarSrc = useCallback(
    (item: InboxEmailListItem) => {
      const contactId = item.contactId?.trim();
      if (contactId) {
        return contactAvatarSrc[contactId] ?? item.mailboxAvatarSrc ?? null;
      }
      const organizationId = item.organizationId?.trim();
      if (organizationId) {
        return (
          organizationAvatarSrc[organizationId] ?? item.mailboxAvatarSrc ?? null
        );
      }
      return item.mailboxAvatarSrc ?? null;
    },
    [contactAvatarSrc, organizationAvatarSrc],
  );
  const resolveContactAvatarSrc = useCallback(
    (contactId: string) => contactAvatarSrc[contactId] ?? null,
    [contactAvatarSrc],
  );

  const selectedItem = selectedId ? itemById.get(selectedId) : undefined;
  const selectedChatId =
    selectedItem?.kind === "task" && selectedItem.chat ? selectedItem.id : null;
  const selectedEmailId = selectedItem?.kind === "email" ? selectedItem.id : null;
  const selectedSupportId =
    selectedItem?.kind === "task" && !selectedItem.chat ? selectedItem.id : null;

  const messagesBody = isMessages ? (
    <div className="inbox-side-panel__messages">
      <CommunicationMessagesList
        conversations={messages.conversations}
        emails={messages.emails}
        supportTasks={messages.supportTasks}
        selectedChatId={selectedChatId}
        selectedEmailId={selectedEmailId}
        selectedSupportId={selectedSupportId}
        loading={loading}
        error={chat.error}
        typingIds={chat.typingIds}
        resolveEmailAvatarSrc={resolveEmailAvatarSrc}
        resolveContactAvatarSrc={resolveContactAvatarSrc}
        onSelectChat={openItem}
        onSelectEmail={openItem}
        onSelectSupport={openItem}
        onKeyboardItemIdsChange={setMessagesKeyboardIds}
        onHighlightChange={setMessagesHighlightedId}
        hiddenStatuses={INBOX_MESSAGES_HIDDEN_STATUSES}
        showToolbar={false}
        keyboardZone={LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL}
        keyboardEnabled={keepAliveActive}
        emptyState={
          <div className="app-content-side-panel-empty">
            <InboxSidePanelEmptyFigure mode="messages" />
          </div>
        }
      />
    </div>
  ) : undefined;

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
        pathname={pathname}
        items={items}
        Link={RouterLink}
        title={inboxListModeLabel(listMode)}
        loading={loading}
        emptyLabel={<InboxSidePanelEmptyFigure mode={listMode} />}
        groupByAttentionStatus={groupItems}
        attentionGroupOverrides={attentionGroupOverrides}
        renderTitleTrailing={renderTitleTrailing}
        isItemAgentWorking={isItemAgentWorking}
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
        body={messagesBody}
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
