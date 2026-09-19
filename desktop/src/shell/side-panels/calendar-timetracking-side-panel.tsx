import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  CalendarTimetrackingSidePanelView,
  CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM,
  CALENDAR_MEETING_OVERLAY_PARAM,
  CALENDAR_PAGE_MODE_PARAM,
  CALENDAR_TASK_OVERLAY_LAYOUT_PARAM,
  CALENDAR_TASK_OVERLAY_PARAM,
  CALENDAR_TIMETRACKING_DATE_PARAM,
  CALENDAR_TIMETRACKING_WEEK_PARAM,
  CALENDAR_TIMETRACKING_MONTH_PARAM,
  readTimetrackingPeriodFromSearch,
  buildTimetrackingDayGroups,
  buildTimetrackingSidePanelKeyboardItemIds,
  getSelectedTimetrackingSidePanelItemId,
  parseTimetrackingSidePanelItemId,
  type CalendarPageMode,
} from "@backsteros/ui";

import { useDesktopSidePanelListNav } from "../../lib/use-desktop-side-panel-list-nav";
import { useShellLocation } from "../../lib/shell-route-keep-alive";
import { navigateToHref } from "../../router/navigate-href";

function searchParamsFromSearchStr(searchStr: string): URLSearchParams {
  return new URLSearchParams(
    searchStr.startsWith("?") ? searchStr.slice(1) : searchStr,
  );
}

/** Timetracking body — chrome owned by DesktopCalendarSidePanel when embedded. */
export function DesktopCalendarTimetrackingSidePanel({
  embedded = false,
  pageMode,
  onPageModeChange,
}: {
  embedded?: boolean;
  pageMode: CalendarPageMode;
  onPageModeChange: (mode: CalendarPageMode) => void;
}) {
  const navigate = useNavigate();
  const { searchStr: rawSearchStr } = useShellLocation();
  const searchStr = rawSearchStr ?? "";
  const searchParams = useMemo(
    () => searchParamsFromSearchStr(searchStr),
    [searchStr],
  );
  const setSearchParams = useCallback(
    (
      nextInit: (prev: URLSearchParams) => URLSearchParams,
      navigateOpts?: { replace?: boolean },
    ) => {
      const prev = searchParamsFromSearchStr(searchStr);
      const next = nextInit(prev);
      if (next.toString() === prev.toString()) return;
      // Absolute /calendar?... so keep-alive lastHref + address bar stay in sync
      // (same pattern as CalendarPage) — relative navigate() misses warm flips.
      const query = next.toString();
      navigateToHref(navigate, query ? `/calendar?${query}` : "/calendar", {
        replace: navigateOpts?.replace ?? false,
      });
    },
    [navigate, searchStr],
  );
  const period = readTimetrackingPeriodFromSearch(
    `?${searchParams.toString()}`,
    { fallbackToday: true },
  );
  const monthGroups = useMemo(
    () => buildTimetrackingDayGroups({ monthsBack: 3 }),
    [],
  );
  const [collapsedWeeks, setCollapsedWeeks] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const itemIds = useMemo(
    () => buildTimetrackingSidePanelKeyboardItemIds(monthGroups, collapsedWeeks),
    [collapsedWeeks, monthGroups],
  );
  const selectedId = getSelectedTimetrackingSidePanelItemId(period);

  const setTimetrackingParams = (
    updater: (next: URLSearchParams) => void,
  ) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(CALENDAR_PAGE_MODE_PARAM, "timetracking");
        next.delete(CALENDAR_TIMETRACKING_DATE_PARAM);
        next.delete(CALENDAR_TIMETRACKING_WEEK_PARAM);
        next.delete(CALENDAR_TIMETRACKING_MONTH_PARAM);
        // Period picks show the overview list — dismiss any open entry detail.
        next.delete(CALENDAR_MEETING_OVERLAY_PARAM);
        next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
        next.delete(CALENDAR_TASK_OVERLAY_PARAM);
        next.delete(CALENDAR_TASK_OVERLAY_LAYOUT_PARAM);
        updater(next);
        return next;
      },
      { replace: true },
    );
  };

  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
      itemIds,
      selectedId,
      onNavigate: (itemId) => {
        const parsed = parseTimetrackingSidePanelItemId(itemId);
        if (!parsed) return;
        if (parsed.kind === "day") {
          setTimetrackingParams((next) => {
            next.set(CALENDAR_TIMETRACKING_DATE_PARAM, parsed.ymd);
          });
          return;
        }
        if (parsed.kind === "week") {
          for (const month of monthGroups) {
            const week = month.weeks.find(
              (entry) => entry.weekKey === parsed.weekKey,
            );
            if (!week) continue;
            setTimetrackingParams((next) => {
              next.set(CALENDAR_TIMETRACKING_WEEK_PARAM, week.weekKey);
            });
            return;
          }
          return;
        }
        for (const month of monthGroups) {
          if (month.monthKey !== parsed.monthKey) continue;
          setTimetrackingParams((next) => {
            next.set(CALENDAR_TIMETRACKING_MONTH_PARAM, month.monthKey);
          });
          return;
        }
      },
      enabled: itemIds.length > 0,
    });

  return (
    <CalendarTimetrackingSidePanelView
      pageMode={pageMode}
      onPageModeChange={onPageModeChange}
      period={period}
      monthGroups={monthGroups}
      collapsedWeeks={collapsedWeeks}
      onCollapsedWeeksChange={setCollapsedWeeks}
      highlightedId={highlightedId}
      listRef={listRef}
      listContainerProps={listContainerProps}
      embedded={embedded}
      onSelectDay={(ymd) => {
        setTimetrackingParams((next) => {
          next.set(CALENDAR_TIMETRACKING_DATE_PARAM, ymd);
        });
      }}
      onSelectWeek={(weekKey) => {
        setTimetrackingParams((next) => {
          next.set(CALENDAR_TIMETRACKING_WEEK_PARAM, weekKey);
        });
      }}
      onSelectMonth={(monthKey) => {
        setTimetrackingParams((next) => {
          next.set(CALENDAR_TIMETRACKING_MONTH_PARAM, monthKey);
        });
      }}
    />
  );
}
