"use client";

import { useRef, useState } from "react";

import {
  formatCalendarTaskScheduleLabel,
  type CalendarTaskLike,
} from "../calendar/calendar-events.js";
import {
  formatMeetingDisplayId,
  sortMeetingsByStart,
  type MeetingListItem,
} from "../meetings/meetings.js";
import {
  meetingEpochAttribute,
  CALENDAR_EXTERNAL_DRAG_ITEM_SELECTOR,
} from "../calendar/calendar-task-drag.js";
import { useCalendarExternalTaskDrag } from "../calendar/use-calendar-external-task-drag.js";
import { sidePanelItemClass } from "../content/side-panel-styles.js";
import { ContentSidePanelHeader } from "./content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "./content-side-panel-list.js";
import { ProjectTypeGroupSection } from "./project-type-group-section.js";
import { SidePanelPlusIcon } from "./side-panel-plus-icon.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type CalendarTasksSidePanelViewProps = {
  meetings?: MeetingListItem[];
  tasks: CalendarTaskLike[];
  loading?: boolean;
  onCreateMeeting?: () => void;
  onMeetingOpen?: (meetingId: string) => void;
  onTaskOpen?: (taskId: string) => void;
  emptyLabel?: string;
};

/**
 * Calendar left panel: meetings + unscheduled tasks.
 */
export function CalendarTasksSidePanelView({
  meetings = [],
  tasks,
  loading = false,
  onCreateMeeting,
  onMeetingOpen,
  onTaskOpen,
  emptyLabel = "No unscheduled tasks.",
}: CalendarTasksSidePanelViewProps) {
  const dragContainerRef = useRef<HTMLDivElement>(null);
  const sortedMeetings = sortMeetingsByStart(meetings);
  const [meetingsCollapsed, setMeetingsCollapsed] = useState(false);
  const [tasksCollapsed, setTasksCollapsed] = useState(false);

  useCalendarExternalTaskDrag(dragContainerRef, {
    enabled: !loading && tasks.length > 0,
    itemSelector: CALENDAR_EXTERNAL_DRAG_ITEM_SELECTOR,
    appendTo: typeof document !== "undefined" ? document.body : null,
  });

  const hasMeetings = sortedMeetings.length > 0;
  const hasTasks = tasks.length > 0;
  const hasListContent = hasMeetings || hasTasks;

  return (
    <div className="app-content-side-panel">
      <ContentSidePanelHeader
        title="Calendar"
        actions={
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
      />
      <div className="app-content-side-panel-main" ref={dragContainerRef}>
        {loading ? (
          <ContentSidePanelEmpty>Loading…</ContentSidePanelEmpty>
        ) : !hasListContent ? (
          <ContentSidePanelEmpty>{emptyLabel}</ContentSidePanelEmpty>
        ) : (
          <ContentSidePanelList aria-label="Calendar items">
            {hasMeetings ? (
              <ProjectTypeGroupSection
                title="Meetings"
                collapsed={meetingsCollapsed}
                onToggle={() => setMeetingsCollapsed((value) => !value)}
              >
                {sortedMeetings.map((meeting) => {
                  const scheduleLabel = formatCalendarTaskScheduleLabel(
                    meeting.startAt,
                    meeting.endAt,
                  );
                  return (
                  <li
                    key={meeting.id}
                    className="calendar-tasks-side-panel-item calendar-tasks-side-panel-item--draggable"
                    data-calendar-meeting-id={meeting.id}
                    data-calendar-meeting-title={
                      meeting.title || "Untitled meeting"
                    }
                    data-calendar-meeting-start-ms={
                      meetingEpochAttribute(meeting.startAt)
                    }
                    data-calendar-meeting-end-ms={
                      meetingEpochAttribute(meeting.endAt)
                    }
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      className={sidePanelItemClass({ stacked: true })}
                      onClick={() => onMeetingOpen?.(meeting.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onMeetingOpen?.(meeting.id);
                        }
                      }}
                    >
                      <div className="app-side-panel-item-row-primary calendar-tasks-side-panel-row">
                        <TaskDueDateIcon
                          active
                          urgency="due_today"
                          size={14}
                          className="calendar-tasks-side-panel-icon"
                        />
                        <span className="calendar-tasks-side-panel-title">
                          {meeting.title || "Untitled meeting"}
                        </span>
                        <span className="calendar-tasks-side-panel-meta">
                          {formatMeetingDisplayId(meeting.number)}
                        </span>
                      </div>
                      {scheduleLabel ? (
                        <div
                          className="app-side-panel-item-row-meta calendar-tasks-side-panel-schedule"
                        >
                          {scheduleLabel}
                        </div>
                      ) : null}
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
                onToggle={() => setTasksCollapsed((value) => !value)}
              >
                {tasks.map((task) => (
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
                      className={sidePanelItemClass({ stacked: true })}
                      onClick={() => onTaskOpen?.(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onTaskOpen?.(task.id);
                        }
                      }}
                    >
                      <span className="calendar-tasks-side-panel-row">
                        <TaskStatusIcon status={task.status} size={14} />
                        <span className="calendar-tasks-side-panel-title">
                          {task.title || "Untitled task"}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ProjectTypeGroupSection>
            ) : null}
          </ContentSidePanelList>
        )}
      </div>
    </div>
  );
}
