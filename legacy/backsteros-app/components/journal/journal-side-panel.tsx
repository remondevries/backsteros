"use client";

import type { Document as ApiDocument } from "@backsteros/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useTransition } from "react";
import { toast } from "sonner";

import { ContentSidePanelHeader } from "@/components/shell/content-side-panel-header";
import { ContentSidePanelList } from "@/components/shell/content-side-panel-list";
import { SidePanelPlusIcon } from "@/components/shell/side-panel-plus-icon";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { useApiResource, useAppApi } from "@/lib/api-context";
import {
  getTodayJournalDateSlug,
} from "@/lib/journal/dates";
import {
  getJournalHref,
  getSelectedJournalDateFromPathname,
} from "@/lib/journal/navigation-path";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { keyboardNavItemProps } from "@/lib/shortcuts/keyboard-nav-item";
import { LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL } from "@/lib/shortcuts/list-keyboard-nav-zone";
import { sidePanelItemClass } from "@/lib/side-panel-styles";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

export function JournalSidePanel({ pathname }: { pathname: string }) {
  const router = useRouter();
  const { client } = useAppApi();
  const listRef = useRef<HTMLElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  const [isCreating, startCreateTransition] = useTransition();
  const selectedDate = getSelectedJournalDateFromPathname(pathname);
  const todaySlug = getTodayJournalDateSlug();
  const resource = useApiResource<{ documents: ApiDocument[] }>((client) =>
    client.requestJson("/api/v1/documents?type=journal"),
  );
  const local = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT journal_date FROM documents WHERE deleted_at IS NULL AND type = 'journal' AND journal_date IS NOT NULL ORDER BY journal_date DESC",
  );

  const dateSlugs = useMemo(() => {
    const fromLocal =
      local.data
        ?.map((row) => String(snakeRow(row).journalDate ?? ""))
        .filter(Boolean) ?? [];
    const fromApi =
      resource.data?.documents
        ?.map((document) => document.journalDate)
        .filter((value): value is string => Boolean(value)) ?? [];
    const unique = [...new Set([...fromLocal, ...fromApi])];
    return unique.sort((a, b) => b.localeCompare(a));
  }, [local.data, resource.data]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: dateSlugs,
    selectedId: selectedDate ?? null,
    onNavigate: (dateSlug) => {
      const href = getJournalHref(dateSlug);
      if (href !== pathname) {
        router.push(href);
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: dateSlugs.length > 0,
  });

  const handleCreateToday = useCallback(() => {
    startCreateTransition(async () => {
      try {
        await client.requestJson(
          `/api/v1/journal/${encodeURIComponent(todaySlug)}`,
        );
        resource.reload();
        router.push(getJournalHref(todaySlug));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not open today's journal.",
        );
      }
    });
  }, [client, resource, router, todaySlug]);

  return (
    <div className="app-content-side-panel app-content-side-panel--journal flex h-full min-h-0 flex-col">
      <ContentSidePanelHeader
        title="Journal"
        actions={
          <button
            type="button"
            onClick={handleCreateToday}
            disabled={isCreating}
            className="app-side-panel-section-action"
            aria-label="Open today's journal"
          >
            <SidePanelPlusIcon />
          </button>
        }
      />
      <div className="app-content-side-panel-main flex min-h-0 flex-1 flex-col">
        {!dateSlugs.length ? (
          <p className="app-content-side-panel-empty">
            No journal entries yet. Use the plus button for today.
          </p>
        ) : (
          <ContentSidePanelList
            ref={listRef}
            aria-label="Journal entries"
            {...listContainerProps}
          >
            {dateSlugs.map((dateSlug) => {
              const isActive = selectedDate === dateSlug;
              const isToday = dateSlug === todaySlug;

              return (
                <li key={dateSlug} className="w-full">
                  <Link
                    href={getJournalHref(dateSlug)}
                    scroll={false}
                    className={sidePanelItemClass({
                      active: isActive,
                      keyboardHighlighted: highlightedId === dateSlug,
                    })}
                    aria-current={isActive ? "page" : undefined}
                    {...keyboardNavItemProps(dateSlug)}
                  >
                    <span className="app-side-panel-item-label">
                      {dateSlug}
                      {isToday ? (
                        <span className="ml-1.5 text-[11px] text-foreground/40">
                          Today
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ContentSidePanelList>
        )}
      </div>
    </div>
  );
}
