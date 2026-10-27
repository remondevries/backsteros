import {
  filterInboxItemsByListMode,
  type InboxListMode,
} from "./inbox-list-mode.js";
import { getSelectedInboxSlugFromPathname } from "../content/content-side-panel.js";
import {
  parseEmailDraftPath,
  parseEmailMessagePath,
} from "../email/email.js";
import {
  findInboxItemBySlugOrId,
  getFirstInboxItemHref,
  getInboxItemHref,
  sortInboxItemsByAttentionStatus,
  type InboxListItem,
} from "./inbox-items.js";

/**
 * Mode-filtered + attention-sorted rows for the Inbox side panel / detail.
 * Session display order still includes emails — always re-sort after filter.
 */
export function resolveInboxModeListItems(
  allItems: readonly InboxListItem[],
  mode: InboxListMode,
): InboxListItem[] {
  return sortInboxItemsByAttentionStatus(
    filterInboxItemsByListMode(allItems, mode),
  );
}

/** True when the shell URL is an email/draft detail (Outlet), not Inbox keep-alive. */
export function isInboxEmailShellPath(pathname: string): boolean {
  return (
    pathname.startsWith("/email/") || Boolean(parseEmailDraftPath(pathname))
  );
}

/**
 * Which list row (if any) the pathname refers to within `items`.
 * Returns null when the path is outside this mode's list.
 */
export function resolveInboxListItemIdFromPathname(
  pathname: string,
  items: readonly InboxListItem[],
): string | null {
  const draftPath = parseEmailDraftPath(pathname);
  if (draftPath) {
    return (
      items.find(
        (entry) =>
          entry.kind === "email" &&
          entry.inboxId === draftPath.inboxId &&
          (entry.draftId === draftPath.draftId ||
            entry.messageId === draftPath.draftId),
      )?.id ?? null
    );
  }
  const emailPath = parseEmailMessagePath(pathname);
  if (emailPath) {
    return (
      items.find(
        (entry) =>
          entry.kind === "email" &&
          entry.inboxId === emailPath.inboxId &&
          entry.messageId === emailPath.messageId,
      )?.id ?? null
    );
  }
  const slug = getSelectedInboxSlugFromPathname(pathname);
  if (!slug) return null;
  return findInboxItemBySlugOrId(items, slug)?.id ?? null;
}

export type InboxOpenTarget = {
  /** Navigate here to show the row in the content pane. */
  href: string;
  /** List row id (null when navigating to empty `/inbox`). */
  itemId: string | null;
  reason:
    | "highlight"
    | "mode-mismatch"
    | "email-outside-messages"
    | "inbox-root"
    | "empty";
};

/**
 * Single decision for what the Inbox content pane should show.
 *
 * Prefer an explicit keyboard highlight, otherwise keep the shell URL when it
 * already names a row in this mode, otherwise open the first mode row (or
 * `/inbox` when the mode list is empty).
 */
export function resolveInboxOpenTarget(input: {
  mode: InboxListMode;
  shellPathname: string;
  /** Already mode-filtered + sorted. */
  items: readonly InboxListItem[];
  highlightedId?: string | null;
}): InboxOpenTarget | null {
  const { mode, shellPathname, items, highlightedId = null } = input;
  const shellItemId = resolveInboxListItemIdFromPathname(
    shellPathname,
    items,
  );
  const shellHrefMatches = (href: string): boolean => {
    const pathOnly = href.split(/[?#]/, 1)[0] ?? href;
    if (shellPathname === pathOnly) return true;
    // Email hrefs include `?list=inbox`; shell pathname has no query.
    if (pathOnly.startsWith("/email/") && shellPathname === pathOnly) {
      return true;
    }
    return false;
  };

  if (highlightedId != null) {
    const highlighted = items.find((entry) => entry.id === highlightedId);
    if (highlighted) {
      const href = getInboxItemHref(highlighted, items);
      if (shellItemId === highlightedId || shellHrefMatches(href)) {
        return null;
      }
      return { href, itemId: highlighted.id, reason: "highlight" };
    }
  }

  if (shellItemId != null) {
    // Shell already points at a row in this mode.
    return null;
  }

  const onEmail = isInboxEmailShellPath(shellPathname);
  if (onEmail && mode !== "messages") {
    const first = items[0];
    if (first) {
      return {
        href: getInboxItemHref(first, items),
        itemId: first.id,
        reason: "email-outside-messages",
      };
    }
    return { href: "/inbox", itemId: null, reason: "empty" };
  }

  const slug = getSelectedInboxSlugFromPathname(shellPathname);
  // Legacy chat hrefs pointed at Communication; Inbox owns those rows now.
  const onCommunicationItem = shellPathname.startsWith("/communication/");
  const pathClaimsInboxItem =
    Boolean(slug) || (mode === "messages" && onEmail) || onCommunicationItem;
  const atInboxRoot = shellPathname === "/inbox";

  if (!pathClaimsInboxItem && !atInboxRoot) {
    // Concrete non-inbox route (e.g. calendar meeting from a notifications row)
    // — do not yank the user back.
    if (!shellPathname.startsWith("/inbox")) {
      return null;
    }
  }

  const first = items[0];
  if (first) {
    const href = getInboxItemHref(first, items);
    if (shellHrefMatches(href)) return null;
    return {
      href,
      itemId: first.id,
      reason: atInboxRoot ? "inbox-root" : "mode-mismatch",
    };
  }

  if (pathClaimsInboxItem || atInboxRoot || (onEmail && mode !== "messages")) {
    return { href: "/inbox", itemId: null, reason: "empty" };
  }

  return null;
}

/** Panel list selection pathname — seed first row at section root only. */
export function resolveInboxPanelPathname(input: {
  shellPathname: string;
  mode: InboxListMode;
  items: readonly InboxListItem[];
}): string {
  const { shellPathname, mode, items } = input;
  const firstHref = getFirstInboxItemHref(items) ?? null;
  const pathOnly = firstHref?.split(/[?#]/, 1)[0] ?? null;

  // Notifications/Agents must not keep an email pathname for selection chrome.
  if (mode !== "messages" && isInboxEmailShellPath(shellPathname)) {
    return pathOnly ?? "/inbox";
  }

  if (
    shellPathname.startsWith("/inbox/") ||
    shellPathname.startsWith("/email/")
  ) {
    return shellPathname;
  }

  if (shellPathname === "/inbox") {
    return pathOnly ?? "/inbox";
  }

  return shellPathname;
}
