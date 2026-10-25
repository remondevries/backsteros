import { memo, type ComponentProps } from "react";
import { CalendarView } from "@backsteros/ui";

import {
  propsEqualIgnoringCallbacksExcept,
  useStableCallbackProps,
} from "../../lib/stable-callback-props";

export type CalendarGridPaneProps = ComponentProps<typeof CalendarView>;

/** Called while rendering the popovers, so identity changes must re-render. */
const gridPanePropsEqual = propsEqualIgnoringCallbacksExcept<CalendarGridPaneProps>(
  ["resolveTask", "resolveBirthdayContact"],
);

/**
 * FullCalendar grid. Skips re-rendering when only overlay / detail state on
 * the calendar page changes; callbacks always reach the latest handlers.
 */
export const CalendarGridPane = memo(function CalendarGridPane(
  props: CalendarGridPaneProps,
) {
  return <CalendarView {...useStableCallbackProps(props)} />;
}, gridPanePropsEqual);
