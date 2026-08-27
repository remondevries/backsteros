import { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM,
  CALENDAR_MEETING_OVERLAY_PARAM,
  CALENDAR_PAGE_MODE_PARAM,
  CALENDAR_TIMETRACKING_DATE_PARAM,
  CALENDAR_VIEW_MODE_PARAM,
  DEFAULT_CALENDAR_PAGE_MODE,
  buildCalendarPageHref,
  parseCalendarPageModeParam,
  parseCalendarViewModeParam,
  useCalendarPageModeShortcuts,
  type CalendarPageMode,
} from "@backsteros/ui";

import { navigateToHref } from "../router/navigate-href";
import { useKeepAliveFrozen, useShellLocation } from "./shell-route-keep-alive";

function searchParamsFromSearchStr(searchStr: string): URLSearchParams {
  return new URLSearchParams(
    searchStr.startsWith("?") ? searchStr.slice(1) : searchStr,
  );
}

export function useCalendarPageModeControls() {
  const navigate = useNavigate();
  const { pathname, searchStr: rawSearchStr } = useShellLocation();
  const searchStr = rawSearchStr ?? "";
  const keepAliveFrozen = useKeepAliveFrozen();
  const searchParams = useMemo(
    () => searchParamsFromSearchStr(searchStr),
    [searchStr],
  );
  const pageMode = parseCalendarPageModeParam(
    searchParams.get(CALENDAR_PAGE_MODE_PARAM),
  );

  const handlePageModeChange = useCallback(
    (mode: CalendarPageMode) => {
      const view = parseCalendarViewModeParam(
        searchParams.get(CALENDAR_VIEW_MODE_PARAM),
      );
      const onMeetingDetailRoute = pathname.startsWith("/calendar/meetings/");

      // Leaving the full meeting page for calendar/availability/timetracking restores the grid.
      if (
        onMeetingDetailRoute &&
        (mode === "calendar" || mode === "availability" || mode === "timetracking")
      ) {
        navigateToHref(
          navigate,
          buildCalendarPageHref({
            viewMode: mode === "availability" && (view === "day" || view === "list")
              ? undefined
              : view,
            pageMode: mode,
          }),
          { replace: true },
        );
        return;
      }

      const next = new URLSearchParams(searchParams);
      if (mode === DEFAULT_CALENDAR_PAGE_MODE) {
        next.delete(CALENDAR_PAGE_MODE_PARAM);
      } else {
        next.set(CALENDAR_PAGE_MODE_PARAM, mode);
      }
      if (mode === "calendar" || mode === "availability" || mode === "timetracking") {
        next.delete(CALENDAR_MEETING_OVERLAY_PARAM);
        next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
      }
      if (mode === "availability" || mode === "timetracking") {
        const nextView = parseCalendarViewModeParam(
          next.get(CALENDAR_VIEW_MODE_PARAM),
        );
        if (nextView === "day" || nextView === "list") {
          next.delete(CALENDAR_VIEW_MODE_PARAM);
        }
      }
      if (mode !== "timetracking") {
        next.delete(CALENDAR_TIMETRACKING_DATE_PARAM);
      }
      if (next.toString() === searchParams.toString()) return;
      navigate({
        to: ".",
        search: Object.fromEntries(next.entries()),
        replace: true,
      });
    },
    [navigate, pathname, searchParams],
  );

  useCalendarPageModeShortcuts({
    enabled:
      !keepAliveFrozen &&
      (pathname === "/calendar" || pathname.startsWith("/calendar/")),
    pageMode,
    onPageModeChange: handlePageModeChange,
  });

  return { pageMode, handlePageModeChange };
}
