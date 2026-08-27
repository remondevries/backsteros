import type { ReactNode } from "react";

import {
  CALENDAR_PAGE_MODE_OPTIONS,
  type CalendarPageMode,
} from "../../lib/calendar/calendar-page-mode";
import { SectionListHeader } from "../section-list-header";

type Props = {
  mode: CalendarPageMode;
  onCreateMeeting: () => void;
  titleAccessory?: ReactNode;
  belowExtra?: ReactNode;
};

export function CalendarScreenHeader({
  mode,
  onCreateMeeting,
  titleAccessory,
  belowExtra,
}: Props) {
  const title =
    CALENDAR_PAGE_MODE_OPTIONS.find((option) => option.value === mode)?.label ??
    "Calendar";

  return (
    <SectionListHeader
      title={title}
      titleAccessory={titleAccessory}
      showGlobalSearch
      onPressPlus={onCreateMeeting}
      plusAccessibilityLabel="Create meeting"
      below={belowExtra}
    />
  );
}
