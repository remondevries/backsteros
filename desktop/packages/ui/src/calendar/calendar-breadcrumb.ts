import type { ContentBreadcrumbItem } from "../components/content/content-chrome-header.js";
import {
  buildCalendarPageHref,
  type CalendarPageMode,
  DEFAULT_CALENDAR_PAGE_MODE,
} from "./calendar-page-mode.js";
import {
  getCalendarViewModeLabel,
  type CalendarViewMode,
} from "./calendar-view-modes.js";

export function buildCalendarBreadcrumbItems(input: {
  viewMode: CalendarViewMode;
  pageMode?: CalendarPageMode;
  rangeTitle?: string | null;
  detailLabel?: string | null;
}): ContentBreadcrumbItem[] {
  const pageMode = input.pageMode ?? DEFAULT_CALENDAR_PAGE_MODE;
  const detailLabel = input.detailLabel?.trim();

  const rangeLabel =
    input.rangeTitle?.trim() || getCalendarViewModeLabel(input.viewMode);
  const items: ContentBreadcrumbItem[] = [
    { label: "Calendar", href: "/calendar" },
    {
      label: rangeLabel,
      href: buildCalendarPageHref({
        viewMode: input.viewMode,
        pageMode: "calendar",
      }),
    },
  ];
  if (pageMode === "timetracking") {
    items.push({
      label: "Timetracking",
      href: buildCalendarPageHref({
        viewMode: input.viewMode,
        pageMode: "timetracking",
      }),
    });
  }
  if (pageMode === "availability") {
    items.push({
      label: "Availability",
      href: buildCalendarPageHref({
        viewMode: input.viewMode,
        pageMode: "availability",
      }),
    });
  }
  if (detailLabel) {
    items.push({ label: detailLabel });
  }
  return items;
}
