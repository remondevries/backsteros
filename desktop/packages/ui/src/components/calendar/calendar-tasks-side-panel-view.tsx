"use client";

import { useRef, useState, type HTMLAttributes, type Ref } from "react";

import {
  type CalendarTaskLike,
} from "../../calendar/calendar-events.js";
import {
  calendarSidePanelHabitItemId,
  calendarSidePanelMeetingItemId,
  calendarSidePanelTaskItemId,
  partitionCalendarSidePanelMeetings,
} from "../../calendar/calendar-side-panel-keyboard.js";
import { type CalendarPageMode } from "../../calendar/calendar-page-mode.js";
import { CalendarSidePanelModeFooter } from "./calendar-side-panel-mode-footer.js";
import { type MeetingListItem } from "../../meetings/meetings.js";
import {
  meetingEpochAttribute,
  CALENDAR_EXTERNAL_DRAG_ITEM_SELECTOR,
} from "../../calendar/calendar-task-drag.js";
import { useCalendarExternalTaskDrag } from "../../calendar/use-calendar-external-task-drag.js";
import { fireHabitCompleteConfetti } from "../../habits/habit-complete-confetti.js";
import { keyboardNavItemProps } from "../../list-nav/keyboard-nav-item.js";
import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import { ContentSidePanelShell } from "../content/content-side-panel-shell.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import {
  buildMeetingListItemCardData,
  MeetingListItemCard,
} from "../meetings/meeting-list-item-card.js";

/** Today's habit row for the calendar side panel (icon + checkbox + drag). */
export type CalendarSidePanelHabitItem = {
  id: string;
  title: string;
  icon: string | null;
  todayTaskId: string;
  todayTaskStatus: string;
  checked: boolean;
};

export type CalendarTasksSidePanelViewProps = {
  meetings?: MeetingListItem[];
  tasks: CalendarTaskLike[];
  /** Today's habits with a day task — checkbox + drag onto the grid. */
  habits?: CalendarSidePanelHabitItem[];
  loading?: boolean;
  pageMode: CalendarPageMode;
  onPageModeChange: (mode: CalendarPageMode) => void;
  onCreateMeeting?: () => void;
  onMeetingOpen?: (meetingId: string) => void;
  onTaskOpen?: (taskId: string) => void;
  onToggleHabit?: (
    habit: CalendarSidePanelHabitItem,
    checked: boolean,
  ) => void;
  emptyLabel?: string;
  /** When `meetings`, hide unscheduled tasks/habits and use a meetings-focused header. */
  panelVariant?: "calendar" | "meetings";
  selectedItemId?: string | null;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
  inboxCollapsed?: boolean;
  onToggleInboxGroup?: () => void;
  meetingsCollapsed?: boolean;
  onToggleMeetingsGroup?: () => void;
  tasksCollapsed?: boolean;
  onToggleTasksGroup?: () => void;
  habitsCollapsed?: boolean;
  onToggleHabitsGroup?: () => void;
  /** When true, render only the list body — parent shell owns chrome + mode footer. */
  embedded?: boolean;
};

/**
 * Calendar left panel: meetings + habits + unscheduled tasks.
 */
export function CalendarTasksSidePanelView({
  meetings = [],
  tasks,
  habits = [],
  loading = false,
  pageMode,
  onPageModeChange,
  onCreateMeeting,
  onMeetingOpen,
  onTaskOpen,
  onToggleHabit,
  emptyLabel = "No unscheduled tasks.",
  panelVariant = "calendar",
  selectedItemId = null,
  highlightedId = null,
  listRef,
  listContainerProps,
  inboxCollapsed: inboxCollapsedProp,
  onToggleInboxGroup,
  meetingsCollapsed: meetingsCollapsedProp,
  onToggleMeetingsGroup,
  tasksCollapsed: tasksCollapsedProp,
  onToggleTasksGroup,
  habitsCollapsed: habitsCollapsedProp,
  onToggleHabitsGroup,
  embedded = false,
}: CalendarTasksSidePanelViewProps) {
  const dragContainerRef = useRef<HTMLDivElement>(null);
  const showUnscheduledTasks = panelVariant === "calendar";
  const showHabits = panelVariant === "calendar";
  const { inboxMeetings, scheduledMeetings } =
    partitionCalendarSidePanelMeetings(meetings);
  const [localInboxCollapsed, setLocalInboxCollapsed] = useState(false);
  const [localMeetingsCollapsed, setLocalMeetingsCollapsed] = useState(false);
  const [localTasksCollapsed, setLocalTasksCollapsed] = useState(false);
  const [localHabitsCollapsed, setLocalHabitsCollapsed] = useState(false);
  const inboxCollapsed = inboxCollapsedProp ?? localInboxCollapsed;
  const meetingsCollapsed =
    meetingsCollapsedProp ?? localMeetingsCollapsed;
  const tasksCollapsed = tasksCollapsedProp ?? localTasksCollapsed;
  const habitsCollapsed = habitsCollapsedProp ?? localHabitsCollapsed;
  const toggleInboxGroup =
    onToggleInboxGroup ??
    (() => setLocalInboxCollapsed((value) => !value));
  const toggleMeetingsGroup =
    onToggleMeetingsGroup ??
    (() => setLocalMeetingsCollapsed((value) => !value));
  const toggleTasksGroup =
    onToggleTasksGroup ?? (() => setLocalTasksCollapsed((value) => !value));
  const toggleHabitsGroup =
    onToggleHabitsGroup ?? (() => setLocalHabitsCollapsed((value) => !value));

  function renderMeetingRow(meeting: MeetingListItem) {
    const itemId = calendarSidePanelMeetingItemId(meeting.id);
    return (
      <li
        key={meeting.id}
        className="calendar-tasks-side-panel-item calendar-tasks-side-panel-item--draggable"
        data-calendar-meeting-id={meeting.id}
        data-calendar-meeting-title={meeting.title || "Untitled meeting"}
        data-calendar-meeting-start-ms={meetingEpochAttribute(meeting.startAt)}
        data-calendar-meeting-end-ms={meetingEpochAttribute(meeting.endAt)}
      >
        <MeetingListItemCard
          item={buildMeetingListItemCardData(meeting)}
          itemId={itemId}
          active={selectedItemId === itemId}
          keyboardHighlighted={highlightedId === itemId}
          onActivate={() => onMeetingOpen?.(meeting.id)}
        />
      </li>
    );
  }

  const canDragExternal =
    showUnscheduledTasks &&
    !loading &&
    (tasks.length > 0 || habits.length > 0);

  useCalendarExternalTaskDrag(dragContainerRef, {
    enabled: canDragExternal,
    itemSelector: CALENDAR_EXTERNAL_DRAG_ITEM_SELECTOR,
    appendTo: typeof document !== "undefined" ? document.body : null,
  });

  const hasInboxMeetings = inboxMeetings.length > 0;
  const hasMeetings = scheduledMeetings.length > 0;
  const hasHabits = showHabits && habits.length > 0;
  const hasTasks = showUnscheduledTasks && tasks.length > 0;
  const hasListContent =
    hasInboxMeetings || hasMeetings || hasHabits || hasTasks;
  const panelTitle = panelVariant === "meetings" ? "Meetings" : "Calendar";
  const listAriaLabel =
    panelVariant === "meetings" ? "Meetings" : "Calendar items";
  const resolvedEmptyLabel =
    panelVariant === "meetings" ? "No meetings yet." : emptyLabel;

  const shell = (
    <ContentSidePanelShell
      title={panelTitle}
      className="calendar-side-panel"
      mainRef={embedded ? undefined : dragContainerRef}
      headerActions={
        onCreateMeeting ? (
          <button
            type="button"
            className="app-side-panel-section-action"
            aria-label="Create meeting"
            onClick={onCreateMeeting}
          >
            <SidePanelPlusIcon />
          </button>
        ) : null
      }
      loading={loading}
      loadingSkeleton={
        <p className="app-content-side-panel-empty">Loading…</p>
      }
      isEmpty={loading || !hasListContent}
      emptyLabel={resolvedEmptyLabel}
      listAriaLabel={listAriaLabel}
      listRef={listRef}
      listContainerProps={listContainerProps}
      bare={embedded}
      afterMain={
        embedded ? null : (
          <CalendarSidePanelModeFooter
            pageMode={pageMode}
            onPageModeChange={onPageModeChange}
          />
        )
      }
      showHeader={!embedded}
    >
      {hasInboxMeetings ? (
        <ProjectTypeGroupSection
          title="Inbox"
          collapsed={inboxCollapsed}
          onToggle={toggleInboxGroup}
        >
          {inboxMeetings.map((meeting) => renderMeetingRow(meeting))}
        </ProjectTypeGroupSection>
      ) : null}
      {hasMeetings ? (
        <ProjectTypeGroupSection
          title="Meetings"
          collapsed={meetingsCollapsed}
          onToggle={toggleMeetingsGroup}
        >
          {scheduledMeetings.map((meeting) => renderMeetingRow(meeting))}
        </ProjectTypeGroupSection>
      ) : null}
      {hasHabits ? (
        <ProjectTypeGroupSection
          title="Habits"
          collapsed={habitsCollapsed}
          onToggle={toggleHabitsGroup}
        >
          {habits.map((habit) => {
            const itemId = calendarSidePanelHabitItemId(habit.id);
            const canToggle = Boolean(onToggleHabit);
            return (
              <li
                key={habit.id}
                className={[
                  "calendar-tasks-side-panel-item",
                  "calendar-tasks-side-panel-item--draggable",
                  "calendar-tasks-side-panel-item--habit",
                  "habit-side-panel-item",
                  habit.checked ? "is-checked" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-calendar-task-id={habit.todayTaskId}
                data-calendar-task-title={habit.title || "Untitled habit"}
                data-calendar-task-status={habit.todayTaskStatus}
              >
                <div
                  role="button"
                  tabIndex={0}
                  className={sidePanelItemClass({
                    stacked: true,
                    active: selectedItemId === itemId,
                    keyboardHighlighted: highlightedId === itemId,
                  })}
                  {...keyboardNavItemProps(itemId)}
                >
                  <span className="calendar-tasks-side-panel-row calendar-tasks-side-panel-row--habit">
                    <span className="habit-side-panel-item__leading">
                      <span
                        className="habit-side-panel-item__icon"
                        aria-hidden="true"
                      >
                        {habit.icon ? (
                          <ProjectOcticon icon={habit.icon} size={16} />
                        ) : (
                          <DefaultProjectIcon size={16} />
                        )}
                      </span>
                      <span
                        className="habit-side-panel-item__check"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <PolishedCheckbox
                          checked={habit.checked}
                          disabled={!canToggle}
                          ariaLabel={`Mark ${habit.title} complete`}
                          onCheckedChange={(checked, event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (checked) {
                              fireHabitCompleteConfetti(event.currentTarget);
                            }
                            onToggleHabit?.(habit, checked);
                          }}
                        />
                      </span>
                    </span>
                    <span className="calendar-tasks-side-panel-title">
                      {habit.title || "Untitled habit"}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ProjectTypeGroupSection>
      ) : null}
      {hasTasks ? (
        <ProjectTypeGroupSection
          title="Unscheduled tasks"
          collapsed={tasksCollapsed}
          onToggle={toggleTasksGroup}
        >
          {tasks.map((task) => {
            const itemId = calendarSidePanelTaskItemId(task.id);
            return (
              <li
                key={task.id}
                className="calendar-tasks-side-panel-item calendar-tasks-side-panel-item--draggable"
                data-calendar-task-id={task.id}
                data-calendar-task-title={task.title || "Untitled task"}
                data-calendar-task-status={task.status}
              >
                <div
                  role="button"
                  tabIndex={0}
                  className={sidePanelItemClass({
                    stacked: true,
                    active: selectedItemId === itemId,
                    keyboardHighlighted: highlightedId === itemId,
                  })}
                  {...keyboardNavItemProps(itemId)}
                  onClick={() => onTaskOpen?.(task.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onTaskOpen?.(task.id);
                    }
                  }}
                >
                  <span className="calendar-tasks-side-panel-row">
                    <TaskStatusIcon
                      status={task.status}
                      size={14}
                      support={Boolean(task.support)}
                      notification={Boolean(task.notification)}
                      inboxUpdatedAt={task.inboxUpdatedAt}
                    />
                    <span className="calendar-tasks-side-panel-title">
                      {task.title || "Untitled task"}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ProjectTypeGroupSection>
      ) : null}
    </ContentSidePanelShell>
  );

  if (embedded) {
    return <div ref={dragContainerRef}>{shell}</div>;
  }
  return shell;
}
