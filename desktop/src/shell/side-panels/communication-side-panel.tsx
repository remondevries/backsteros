import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CommunicationSidePanelNavView,
  buildCommunicationSidePanelKeyboardItemIds,
  getCommunicationChannelHref,
  getEmailComposeHref,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  parseCommunicationChannelFromSearch,
  parseCommunicationInboxIdFromSearch,
  readCommunicationEmailAccountsExpanded,
  resolveActiveCommunicationChannel,
  resolveActiveCommunicationInboxId,
  resolveCommunicationSidePanelHref,
  communicationSidePanelInboxKeyboardId,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  writeCommunicationEmailAccountsExpanded,
  writeCommunicationListFilter,
} from "@backsteros/ui";

import { useAgentMail } from "../../lib/agentmail-context";
import { rememberSectionEntryHrefs } from "../../lib/section-entry-store";
import {
  useKeepAliveActive,
  useShellLocation,
} from "../../lib/shell-route-keep-alive";
import { RouterLink } from "../app-shell-links";
import type { SidePanelNavProps } from "./types.js";

export function DesktopCommunicationSidePanel({
  onNavigate,
}: SidePanelNavProps) {
  const { pathname, searchStr } = useShellLocation();
  const search = searchStr ?? "";
  const agentMail = useAgentMail();
  const keepAliveActive = useKeepAliveActive();
  const listRef = useRef<HTMLElement>(null);
  const [emailAccountsExpanded, setEmailAccountsExpanded] = useState(() =>
    readCommunicationEmailAccountsExpanded(),
  );

  const mailboxes = useMemo(
    () =>
      [...agentMail.mailboxes].sort((left, right) =>
        (left.email || left.displayName || left.inboxId).localeCompare(
          right.email || right.displayName || right.inboxId,
          undefined,
          { sensitivity: "base" },
        ),
      ),
    [agentMail.mailboxes],
  );

  const setEmailExpanded = useCallback((expanded: boolean) => {
    setEmailAccountsExpanded(expanded);
    writeCommunicationEmailAccountsExpanded(expanded);
  }, []);

  // Keep accounts visible when a mailbox is the active selection.
  useEffect(() => {
    const channel = resolveActiveCommunicationChannel({ pathname, search });
    const inboxId = resolveActiveCommunicationInboxId({ pathname, search });
    if (channel === "email" && inboxId && !emailAccountsExpanded) {
      setEmailExpanded(true);
    }
  }, [emailAccountsExpanded, pathname, search, setEmailExpanded]);

  const itemIds = useMemo(
    () =>
      buildCommunicationSidePanelKeyboardItemIds(mailboxes, {
        emailExpanded: emailAccountsExpanded,
      }),
    [emailAccountsExpanded, mailboxes],
  );

  const selectedId = useMemo(() => {
    const channel = resolveActiveCommunicationChannel({ pathname, search });
    const inboxId = resolveActiveCommunicationInboxId({ pathname, search });
    if (channel === "email" && inboxId && emailAccountsExpanded) {
      return communicationSidePanelInboxKeyboardId(inboxId);
    }
    return channel;
  }, [emailAccountsExpanded, pathname, search]);

  // Persist channel (+ mailbox) when browsing the list so cold opens remember it.
  useEffect(() => {
    if (pathname !== "/communication") return;
    const channel = parseCommunicationChannelFromSearch(search);
    const inboxId = parseCommunicationInboxIdFromSearch(search);
    writeCommunicationListFilter(channel);
    rememberSectionEntryHrefs({
      communication: getCommunicationChannelHref(channel, { inboxId }),
    });
  }, [pathname, search]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (itemId) => {
      const href = resolveCommunicationSidePanelHref(itemId);
      if (href) onNavigate(href);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: keepAliveActive && itemIds.length > 0,
  });

  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );

  return (
    <CommunicationSidePanelNavView
      pathname={pathname}
      search={search}
      Link={RouterLink}
      mailboxes={mailboxes}
      emailAccountsExpanded={emailAccountsExpanded}
      onEmailAccountsExpandedChange={setEmailExpanded}
      highlightedId={highlightedId}
      listRef={listRef}
      listContainerProps={listContainerProps}
      onComposeEmail={() =>
        onNavigate(getEmailComposeHref({ list: "communication" }))
      }
    />
  );
}

export function getCommunicationSidePanelFirstHref(): string | null {
  return "/communication";
}
