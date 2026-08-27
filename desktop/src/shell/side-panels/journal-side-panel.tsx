import { useCallback, useMemo, useRef, type FocusEvent, type MouseEvent, type ReactNode } from "react";

import {
  JournalSidePanelView,
  getJournalHref,
  getJournalV2Href,
  getSelectedJournalDateFromPathname,
  getSelectedJournalV2DateFromPathname,
  isValidJournalDateSlug,
  type JournalSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";

import { prefetchJournalEntryContent } from "../../lib/prefetch-workspace-content";

import { useDesktopSidePanelListNav } from "../../lib/use-desktop-side-panel-list-nav";
import { useDesktopResource } from "../../lib/use-desktop-resource";
import { useDesktopWorkspaceDocuments } from "../../lib/workspace-data";
import { RouterLink } from "../app-shell-links";

import type { SidePanelNavProps } from "./types.js";

export function DesktopJournalSidePanel({
  onNavigate,
  listOnly = false,
  variant = "journal",
  ...viewProps
}: Omit<
  JournalSidePanelViewProps,
  | "highlightedId"
  | "listRef"
  | "listContainerProps"
  | "Link"
  | "getEntryHref"
  | "getSelectedDateFromPathname"
  | "title"
> &
  SidePanelNavProps & {
    /** List rows only — no API fallback fetch and no content prefetch. */
    listOnly?: boolean;
    /** `journal-v2` keeps navigation inside `/journal-v2/...`. */
    variant?: "journal" | "journal-v2";
  }) {
  const { client } = useDesktopApi();
  const { journalDocumentIdsByDate } = useDesktopWorkspaceDocuments();
  const resource = useDesktopResource<{
    documents: Array<{ journalDate?: string | null }>;
  }>(
    listOnly
      ? async () => ({ documents: [] })
      : (api) => api.requestJson("/api/v1/documents?type=journal"),
    [listOnly],
  );
  const { pathname } = viewProps;
  const getEntryHref =
    variant === "journal-v2" ? getJournalV2Href : getJournalHref;
  const getSelectedDateFromPathname =
    variant === "journal-v2"
      ? getSelectedJournalV2DateFromPathname
      : getSelectedJournalDateFromPathname;
  const items = useMemo(() => {
    if (viewProps.items.length > 0) return viewProps.items;
    if (listOnly) return [];
    const dates =
      resource.data?.documents
        .map((document) => document.journalDate)
        .filter((date): date is string => Boolean(date)) ?? [];
    return [...new Set(dates)]
      .sort((a, b) => b.localeCompare(a))
      .map((dateSlug) => ({ dateSlug }));
  }, [listOnly, resource.data, viewProps.items]);
  const selectedId = getSelectedDateFromPathname(pathname) ?? null;
  const itemIds = useMemo(
    () => items.map((item) => item.dateSlug),
    [items],
  );
  const documentIdByDateRef = useRef(journalDocumentIdsByDate);
  documentIdByDateRef.current = journalDocumentIdsByDate;

  const prefetchItemId = useCallback(
    (dateSlug: string) => {
      if (listOnly) return;
      prefetchJournalEntryContent(client, {
        dateSlug,
        documentIdByDate: documentIdByDateRef.current,
      });
    },
    [client, listOnly],
  );

  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
      itemIds,
      selectedId,
      onNavigate: (dateSlug) => {
        onNavigate(getEntryHref(dateSlug));
      },
      enabled: items.length > 0,
      prefetchItemId: listOnly ? undefined : prefetchItemId,
    });

  const PrefetchLink = useMemo(() => {
    return function JournalPrefetchLink({
      to,
      onMouseEnter,
      onFocus,
      onClick,
      ...rest
    }: {
      to: string;
      className?: string;
      children: ReactNode;
      onMouseEnter?: (event: MouseEvent<HTMLAnchorElement>) => void;
      onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
      onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
      [key: string]: unknown;
    }) {
      const rawSlug = String(to)
        .replace(/^\/journal-v2\/?/, "")
        .replace(/^\/journal\/?/, "");
      const dateSlug = isValidJournalDateSlug(rawSlug) ? rawSlug : "";
      return (
        <RouterLink
          to={to}
          {...rest}
          onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
            if (dateSlug) prefetchItemId(dateSlug);
            onMouseEnter?.(event);
          }}
          onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
            if (dateSlug) prefetchItemId(dateSlug);
            onFocus?.(event);
          }}
          onClick={onClick}
        />
      );
    };
  }, [prefetchItemId]);

  return (
    <JournalSidePanelView
      {...viewProps}
      title={variant === "journal-v2" ? "Journal" : "Journal"}
      getEntryHref={getEntryHref}
      getSelectedDateFromPathname={getSelectedDateFromPathname}
      items={items}
      Link={PrefetchLink}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}
