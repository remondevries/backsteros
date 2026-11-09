import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  CommunicationMessagesList,
  HairlineEmptyFigure,
  INBOX_MESSAGES_HIDDEN_STATUSES,
  InboxSidePanelModeFooter,
  InboxSidePanelView,
  RegisterEntityDeleteAction,
  getInboxAttentionKeyboardItemIds,
  getInboxHrefAfterRemovingItem,
  getInboxIdAfterRemovingItem,
  getInboxItemHref,
  inboxListModeLabel,
  isInboxEmailShellPath,
  parseEmailMessagePath,
  resolveInboxListItemIdFromPathname,
  resolveInboxOpenTarget,
  collectMailboxContactIds,
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

import { useAgentMail } from "../lib/agentmail-context";
import { useDesktopApi } from "../lib/api-context";
import {
  deleteEmailMessage,
  emailDeleteEntityLabel,
  reportEmailSpam,
} from "../lib/delete-email-message";
import { isEmailListItemPendingRemoval } from "../lib/email-list-pending-removals";
import {
  prefetchEmailDraftDetail,
  prefetchEmailMessageDetail,
} from "../lib/email-message-detail-cache";
import { useEmailDetailListPrefetch } from "../lib/use-email-detail-list-prefetch";
import { getBrandfetchClientId } from "../lib/brandfetch";
import { resolveEmailListAvatarSrc } from "../lib/resolve-email-list-avatar-src";
import {
  inboxContentAlreadyShowsHref,
  resolveInboxContentPathname,
} from "../lib/inbox/inbox-content-pathname";
import { useDesktopWorkspacePeople } from "../lib/workspace-data";
import { useInboxListSessionPin } from "../lib/inbox/inbox-list-session-context";
import { useInboxModeModel } from "../lib/inbox/inbox-mode-model";
import {
  consumeInboxOpenAfterRemoval,
  queueInboxOpenAfterRemoval,
} from "../lib/inbox/inbox-open-after-removal";
import { rememberSectionEntryHrefs } from "../lib/section-entry-store";
import { navigateToHrefIfWarmOwner } from "../lib/owned-warm-navigate";
import {
  getProductTabUiState,
  patchProductTabInboxUi,
} from "../lib/product-tab-ui-state";
import { useProductTabScrollRestore } from "../lib/use-product-tab-scroll";
import {
  captureWarmNavOwner,
  getWarmKeepAliveActiveProductTabId,
  isWarmNavOwnerCurrent,
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
  onNavigate: _onNavigate,
  renderTitleTrailing,
  isItemAgentWorking,
}: {
  /** Kept for call-site compatibility; panel navigates via owned warm navigate. */
  onNavigate: (href: string) => void;
  renderTitleTrailing?: (item: InboxListItem) => ReactNode;
  isItemAgentWorking?: (item: InboxListItem) => boolean;
}) {
  void _onNavigate;
  const listRef = useRef<HTMLElement>(null);
  const routerNavigate = useNavigate();
  useProductTabScrollRestore("inbox", "panel", listRef);
  const keepAliveActive = useKeepAliveActive();
  const { pathname: shellPathname } = useShellLocation();
  const activeTabId = getWarmKeepAliveActiveProductTabId();
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
  const tabInboxUi = activeTabId
    ? getProductTabUiState(activeTabId).inbox
    : null;
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(tabInboxUi?.collapsedGroupIds ?? []),
  );
  const [messagesKeyboardIds, setMessagesKeyboardIds] =
    useState<readonly string[]>(NO_IDS);
  const [messagesVisibleRowIds, setMessagesVisibleRowIds] =
    useState<readonly string[]>(NO_IDS);
  const [messagesHighlightedId, setMessagesHighlightedId] = useState<
    string | null
  >(() => tabInboxUi?.messagesHighlightedId ?? null);
  const lastOpenedHrefRef = useRef<string | null>(
    tabInboxUi?.lastOpenedHref ?? null,
  );
  const prevTabIdRef = useRef(activeTabId);
  useLayoutEffect(() => {
    if (prevTabIdRef.current === activeTabId) return;
    const prevId = prevTabIdRef.current;
    if (prevId) {
      patchProductTabInboxUi(prevId, {
        collapsedGroupIds: [...collapsedGroups],
        messagesHighlightedId,
        lastOpenedHref: lastOpenedHrefRef.current,
      });
    }
    prevTabIdRef.current = activeTabId;
    const nextUi = activeTabId
      ? getProductTabUiState(activeTabId).inbox
      : null;
    setCollapsedGroups(new Set(nextUi?.collapsedGroupIds ?? []));
    setMessagesHighlightedId(nextUi?.messagesHighlightedId ?? null);
    lastOpenedHrefRef.current = nextUi?.lastOpenedHref ?? null;
  }, [activeTabId, collapsedGroups, messagesHighlightedId]);
  // Persist highlight/collapse while staying on the same tab.
  useEffect(() => {
    if (!activeTabId) return;
    patchProductTabInboxUi(activeTabId, {
      collapsedGroupIds: [...collapsedGroups],
      messagesHighlightedId,
      lastOpenedHref: lastOpenedHrefRef.current,
    });
  }, [activeTabId, collapsedGroups, messagesHighlightedId]);
  // The Messages list unmounts on mode switch — drop its stale j/k state so
  // the open-on-highlight effect cannot reopen an old row on return.
  useEffect(() => {
    if (isMessages) return;
    setMessagesHighlightedId(null);
    setMessagesKeyboardIds(NO_IDS);
    setMessagesVisibleRowIds(NO_IDS);
  }, [isMessages]);
  const { activeZone, setActiveZone } = useListKeyboardNavigationZone();
  const selectedId = resolveInboxListItemIdFromPathname(pathname, items);
  // Keep-alive can mirror a neighbor email onto the panel before the outlet
  // commits — open checks must follow the live content path instead.
  const contentPathname = resolveInboxContentPathname(shellPathname);
  const shellSelectedId = resolveInboxListItemIdFromPathname(
    contentPathname,
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
      if (!item) return;
      const owner = captureWarmNavOwner();
      navigateToHrefIfWarmOwner(
        routerNavigate,
        getInboxItemHref(item, items),
        owner,
      );
    },
    [itemById, items, routerNavigate],
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
  // yank the content pane after a Link click — do not pass highlightedId here.
  const openTarget = useMemo(() => {
    // An in-flight list would send an empty pane to `/inbox`, or bounce a
    // deep-linked row that simply has not arrived yet.
    if (loading) return null;
    const target = resolveInboxOpenTarget({
      mode: listMode,
      shellPathname: contentPathname,
      items,
    });
    // mode-mismatch while still loading sources — wait.
    if (pending && target?.reason === "mode-mismatch") return null;
    // stale-email while pending: only recover when this URL was optimistically
    // deleted — otherwise a still-loading deep link would yank to row 0.
    if (pending && target?.reason === "stale-email") {
      const emailPath = parseEmailMessagePath(contentPathname);
      if (
        !emailPath ||
        !isEmailListItemPendingRemoval({
          inboxId: emailPath.inboxId,
          id: emailPath.messageId,
        })
      ) {
        return null;
      }
    }
    return target;
  }, [contentPathname, items, listMode, loading, pending]);
  useEffect(() => {
    // Keep the dedupe key across freeze — clearing it made every thaw
    // re-navigate to openTarget (first row / mode seed) and yank content.
    if (!keepAliveActive) return;
    if (!openTarget) return;
    const owner = captureWarmNavOwner();
    if (
      lastOpenedHrefRef.current === openTarget.href &&
      inboxContentAlreadyShowsHref(openTarget.href)
    ) {
      return;
    }
    if (!isWarmNavOwnerCurrent(owner)) return;
    lastOpenedHrefRef.current = openTarget.href;
    navigateToHrefIfWarmOwner(routerNavigate, openTarget.href, owner);
  }, [keepAliveActive, openTarget, routerNavigate]);

  // Clear the dedupe key once the live content matches so revisits can reopen.
  useEffect(() => {
    if (openTarget == null && shellSelectedId != null) {
      lastOpenedHrefRef.current = null;
    }
  }, [openTarget, shellSelectedId]);

  // Detail-pane delete queues the neighbor; finish highlight + navigate here so
  // an outlet race cannot leave the content pane blank on the deleted URL.
  useEffect(() => {
    if (!keepAliveActive) return;
    const queued = consumeInboxOpenAfterRemoval();
    if (!queued) return;
    const owner = captureWarmNavOwner();
    if (queued.itemId) {
      setMessagesHighlightedId(queued.itemId);
    }
    if (
      lastOpenedHrefRef.current === queued.href &&
      inboxContentAlreadyShowsHref(queued.href)
    ) {
      return;
    }
    if (!isWarmNavOwnerCurrent(owner)) return;
    lastOpenedHrefRef.current = queued.href;
    navigateToHrefIfWarmOwner(routerNavigate, queued.href, owner);
  }, [keepAliveActive, items, routerNavigate, contentPathname]);

  // After delete/navigation, if j/k still points at a removed row, pull it onto
  // the open Messages row so open-on-highlight cannot reopen the deleted id.
  useEffect(() => {
    if (!isMessages || !keepAliveActive) return;
    if (shellSelectedId == null || !itemById.has(shellSelectedId)) return;
    if (
      messagesHighlightedId != null &&
      itemById.has(messagesHighlightedId)
    ) {
      return;
    }
    if (messagesHighlightedId === shellSelectedId) return;
    setMessagesHighlightedId(shellSelectedId);
  }, [
    isMessages,
    itemById,
    keepAliveActive,
    messagesHighlightedId,
    shellSelectedId,
  ]);

  // j/k only moves the orange highlight — open that row in the content pane.
  useEffect(() => {
    if (!keepAliveActive || highlightedId == null) return;
    if (shellSelectedId === highlightedId) return;
    const item = itemById.get(highlightedId);
    if (!item) return;
    const href = getInboxItemHref(item, items);
    const owner = captureWarmNavOwner();
    if (
      lastOpenedHrefRef.current === href &&
      inboxContentAlreadyShowsHref(href)
    ) {
      return;
    }
    if (!isWarmNavOwnerCurrent(owner)) return;
    lastOpenedHrefRef.current = href;
    navigateToHrefIfWarmOwner(routerNavigate, href, owner);
  }, [
    keepAliveActive,
    highlightedId,
    itemById,
    items,
    routerNavigate,
    shellSelectedId,
  ]);

  const { client } = useDesktopApi();
  const { unpinInboxListItem } = useInboxListSessionPin();
  const itemsRef = useRef(items);
  itemsRef.current = items;
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
      isInboxEmailShellPath(contentPathname) ||
      !highlightedId ||
      activeZone !== LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL
    ) {
      return null;
    }
    const item = itemById.get(highlightedId);
    if (!item || item.kind !== "email" || item.draftId?.trim()) return null;
    return item;
  })();

  const leaveHighlightedEmail = useCallback(() => {
    if (!highlightedEmailItem) {
      return { ok: false as const, error: "Email is required." as const };
    }
    const currentItems = itemsRef.current;
    const nextId = getInboxIdAfterRemovingItem(
      currentItems,
      highlightedEmailItem.id,
    );
    const nextHref =
      getInboxHrefAfterRemovingItem(currentItems, highlightedEmailItem.id) ??
      "/inbox";
    unpinInboxListItem(highlightedEmailItem.id);
    rememberSectionEntryHrefs({ inbox: nextHref === "/inbox" ? null : nextHref });
    setMessagesHighlightedId(nextId);
    if (nextId) {
      setActiveZone(LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL, {
        preferSidepanelForJk: true,
        activate: true,
        highlightItemId: nextId,
      });
    }
    queueInboxOpenAfterRemoval({ href: nextHref, itemId: nextId });
    // Do not stamp lastOpenedHrefRef until the outlet actually shows nextHref —
    // otherwise open-on-highlight / void consume skip the real navigate.
    const owner = captureWarmNavOwner();
    navigateToHrefIfWarmOwner(routerNavigate, nextHref, owner);
    return {
      ok: true as const,
      target: {
        inboxId: highlightedEmailItem.inboxId,
        messageId: highlightedEmailItem.messageId,
        threadId: highlightedEmailItem.threadId,
      },
    };
  }, [
    highlightedEmailItem,
    routerNavigate,
    setActiveZone,
    unpinInboxListItem,
  ]);

  const handleHighlightedEmailDelete = useCallback(async () => {
    const left = leaveHighlightedEmail();
    if (!left.ok) return left;
    // Match detail delete: optimistic remove + navigate immediately. Waiting on
    // the API left highlight on the deleted id and could reopen it.
    void deleteEmailMessage(client, left.target);
    return { ok: true as const };
  }, [client, leaveHighlightedEmail]);

  const handleHighlightedEmailReportSpam = useCallback(async () => {
    const left = leaveHighlightedEmail();
    if (!left.ok) return left;
    void reportEmailSpam(client, left.target);
    return { ok: true as const };
  }, [client, leaveHighlightedEmail]);

  const { contacts, organizations } = useDesktopWorkspacePeople();
  const agentMail = useAgentMail();
  const mailboxContactIds = useMemo(
    () => collectMailboxContactIds(agentMail.mailboxes),
    [agentMail.mailboxes],
  );
  const resolveEmailAvatarSrc = useCallback(
    (item: InboxEmailListItem) =>
      resolveEmailListAvatarSrc({
        item,
        contacts,
        organizations,
        contactAvatarSrc,
        organizationUploadedSrc: organizationAvatarSrc,
        brandfetchClientId: getBrandfetchClientId(),
        mailboxContactIds,
      }),
    [
      contactAvatarSrc,
      contacts,
      mailboxContactIds,
      organizationAvatarSrc,
      organizations,
    ],
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

  useEmailDetailListPrefetch({
    enabled: keepAliveActive && isMessages,
    client,
    emails: messages.emails,
    orderedRowIds: messagesVisibleRowIds,
    focusRowId: messagesHighlightedId ?? selectedEmailId,
  });

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
        onVisibleRowIdsChange={setMessagesVisibleRowIds}
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
          onDelete={handleHighlightedEmailDelete}
          secondaryAction={{
            label: "Report Spam",
            shortcutKey: "s",
            onConfirm: handleHighlightedEmailReportSpam,
          }}
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
