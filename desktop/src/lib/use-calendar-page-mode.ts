import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

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

export function useCalendarPageModeControls() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
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
        navigate(
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

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
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
          return next;
        },
        { replace: true },
      );
    },
    [navigate, pathname, searchParams, setSearchParams],
  );

  useCalendarPageModeShortcuts({
    enabled: pathname === "/calendar" || pathname.startsWith("/calendar/"),
    pageMode,
    onPageModeChange: handlePageModeChange,
  });

  return { pageMode, handlePageModeChange };
}
