"use client";

import {
  Fragment,
  useMemo,
  useState,
  type HTMLAttributes,
  type Ref,
} from "react";

import { type CalendarPageMode } from "../../calendar/calendar-page-mode.js";
import {
  buildTimetrackingDayGroups,
  type TimetrackingMonthGroup,
  type TimetrackingPeriod,
} from "../../calendar/calendar-timetracking-days.js";
import {
  timetrackingSidePanelDayItemId,
  timetrackingSidePanelMonthItemId,
  timetrackingSidePanelWeekItemId,
} from "../../calendar/calendar-timetracking-keyboard.js";
import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import {
  keyboardNavItemClass,
  keyboardNavItemProps,
} from "../../list-nav/keyboard-nav-item.js";
import { isKeyboardNavHighlighted } from "../list-nav/list-keyboard-navigation-provider.js";
import { CalendarSidePanelModeFooter } from "./calendar-side-panel-mode-footer.js";
import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "../content/content-side-panel-list.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";

export type CalendarTimetrackingSidePanelViewProps = {
  pageMode: CalendarPageMode;
  onPageModeChange: (mode: CalendarPageMode) => void;
  period: TimetrackingPeriod | null;
  onSelectDay: (ymd: string) => void;
  onSelectWeek: (weekKey: string, weekNumber: number) => void;
  onSelectMonth: (monthKey: string, monthLabel: string) => void;
  /** Override grouping (tests / custom ranges). */
  monthGroups?: TimetrackingMonthGroup[];
  collapsedWeeks?: ReadonlySet<string>;
  onCollapsedWeeksChange?: (next: ReadonlySet<string>) => void;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement | null>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
  /** When true, render only the day list — parent shell owns chrome + mode footer. */
  embedded?: boolean;
};

/**
 * Timetracking left panel: months → week numbers → days, plus mode footer.
 * Day / Week / Month labels select the main list range; week chevrons still
 * expand and collapse. j/k navigates rows; Tab moves to the content list.
 */
export function CalendarTimetrackingSidePanelView({
  pageMode,
  onPageModeChange,
  period,
  onSelectDay,
  onSelectWeek,
  onSelectMonth,
  monthGroups: monthGroupsProp,
  collapsedWeeks: collapsedWeeksProp,
  onCollapsedWeeksChange,
  highlightedId = null,
  listRef,
  listContainerProps,
  embedded = false,
}: CalendarTimetrackingSidePanelViewProps) {
  const monthGroups = useMemo(
    () => monthGroupsProp ?? buildTimetrackingDayGroups({ monthsBack: 3 }),
    [monthGroupsProp],
  );

  const [localCollapsedWeeks, setLocalCollapsedWeeks] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const collapsedWeeks = collapsedWeeksProp ?? localCollapsedWeeks;
  const setCollapsedWeeks = (next: ReadonlySet<string>) => {
    onCollapsedWeeksChange?.(next);
    if (!collapsedWeeksProp) {
      setLocalCollapsedWeeks(next);
    }
  };

  const hasDays = monthGroups.some((month) =>
    month.weeks.some((week) => week.days.length > 0),
  );

  const mainBody = !hasDays ? (
    <ContentSidePanelEmpty>No days to show.</ContentSidePanelEmpty>
  ) : (
    <ContentSidePanelList
      ref={listRef}
      aria-label="Timetracking days"
      {...listContainerProps}
    >
      {monthGroups.map((month) => {
        const monthItemId = timetrackingSidePanelMonthItemId(month.monthKey);
        const monthSelected =
          period?.kind === "month" && period.monthKey === month.monthKey;
        const monthHighlighted = isKeyboardNavHighlighted(
          highlightedId,
          monthItemId,
        );
        return (
          <Fragment key={month.monthKey}>
            <li className="side-panel-plain-group-header">
              <button
                type="button"
                className={[
                  "side-panel-plain-group-label",
                  keyboardNavItemClass(monthHighlighted),
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={monthSelected ? "true" : undefined}
                {...keyboardNavItemProps(monthItemId)}
                onClick={() => onSelectMonth(month.monthKey, month.monthLabel)}
              >
                {month.monthLabel}
              </button>
            </li>
            {month.weeks.map((week) => {
              const weekItemId = timetrackingSidePanelWeekItemId(week.weekKey);
              const collapsed = collapsedWeeks.has(week.weekKey);
              const weekSelected =
                period?.kind === "week" && period.weekKey === week.weekKey;
              const weekHighlighted = isKeyboardNavHighlighted(
                highlightedId,
                weekItemId,
              );
              return (
                <ProjectTypeGroupSection
                  key={week.weekKey}
                  title={`Week ${week.weekNumber}`}
                  collapsed={collapsed}
                  titleSelected={weekSelected}
                  titleKeyboardItemId={weekItemId}
                  titleKeyboardHighlighted={weekHighlighted}
                  onTitleClick={() =>
                    onSelectWeek(week.weekKey, week.weekNumber)
                  }
                  onToggle={() => {
                    const next = new Set(collapsedWeeks);
                    if (next.has(week.weekKey)) next.delete(week.weekKey);
                    else next.add(week.weekKey);
                    setCollapsedWeeks(next);
                  }}
                >
                  {week.days.map((day) => {
                    const dayItemId = timetrackingSidePanelDayItemId(day.ymd);
                    const active =
                      period?.kind === "day" && period.ymd === day.ymd;
                    return (
                      <li key={day.ymd} className="inbox-list-item">
                        <button
                          type="button"
                          className={sidePanelItemClass({
                            active,
                            keyboardHighlighted: isKeyboardNavHighlighted(
                              highlightedId,
                              dayItemId,
                            ),
                          })}
                          aria-current={active ? "true" : undefined}
                          {...keyboardNavItemProps(dayItemId)}
                          onClick={() => onSelectDay(day.ymd)}
                        >
                          <span className="side-panel-item-stack">
                            <span className="app-side-panel-item-label">
                              {day.label}
                              {day.isToday ? (
                                <span className="journal-side-panel-today">
                                  {" "}
                                  Today
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ProjectTypeGroupSection>
              );
            })}
          </Fragment>
        );
      })}
    </ContentSidePanelList>
  );

  if (embedded) {
    return mainBody;
  }

  return (
    <div className="app-content-side-panel calendar-side-panel calendar-timetracking-side-panel">
      <ContentSidePanelHeader title="Timetracking" />
      <div className="app-content-side-panel-main">{mainBody}</div>
      <CalendarSidePanelModeFooter
        pageMode={pageMode}
        onPageModeChange={onPageModeChange}
      />
    </div>
  );
}
