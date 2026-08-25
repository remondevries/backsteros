"use client";

import type { EventContentArg } from "@fullcalendar/core";

import {
  calendarEntityFromEvent,
  calendarEventDurationMs,
  calendarEventHasExpandedContent,
} from "../../calendar/calendar-events.js";
import { MEETINGS_AVAILABILITY_MARKER_TYPE } from "../../calendar/calendar-availability-events.js";
import { isPastCompletedMeeting } from "../../meetings/meeting-status.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { TaskDueDateIcon } from "../tasks/task-due-date-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";

function readMeetingFinished(
  extendedProps: Record<string, unknown>,
): boolean {
  if (extendedProps.finished === true) return true;
  if (extendedProps.finished === false) return false;
  const endAt = extendedProps.endAt;
  const status = extendedProps.status;
  if (
    (typeof endAt === "string" || endAt instanceof Date || typeof endAt === "number") &&
    (typeof status === "string" || status == null)
  ) {
    return isPastCompletedMeeting({
      endAt,
      status: typeof status === "string" ? status : null,
    });
  }
  return false;
}

function readProjectName(extendedProps: Record<string, unknown>): string | null {
  const value = extendedProps.projectName;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readHabitId(extendedProps: Record<string, unknown>): string | null {
  const value = extendedProps.habitId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readHabitIcon(extendedProps: Record<string, unknown>): string | null {
  const value = extendedProps.habitIcon;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function CalendarTaskEventContent({
  arg,
}: {
  arg: EventContentArg;
}) {
  const entity = calendarEntityFromEvent(arg.event);
  const habitId = readHabitId(arg.event.extendedProps);
  const habitIcon = readHabitIcon(arg.event.extendedProps);
  const title =
    arg.event.title?.trim() ||
    (entity.entityType === "meeting"
      ? "Untitled meeting"
      : habitId
        ? "Untitled habit"
        : "Untitled task");
  const projectName = readProjectName(arg.event.extendedProps);
  const durationMs = calendarEventDurationMs(arg.event.start, arg.event.end);
  const expanded = calendarEventHasExpandedContent(durationMs);
  const meetingFinished =
    entity.entityType === "meeting" &&
    readMeetingFinished(arg.event.extendedProps);

  const statusIcon =
    entity.entityType === "meeting" ? (
      <TaskDueDateIcon
        active={!meetingFinished}
        urgency={meetingFinished ? null : "due_today"}
        size={12}
        className="task-calendar-event__status-icon"
      />
    ) : habitId ? (
      <span className="task-calendar-event__status-icon" aria-hidden="true">
        {habitIcon ? (
          <ProjectOcticon icon={habitIcon} size={12} />
        ) : (
          <DefaultProjectIcon size={12} />
        )}
      </span>
    ) : (
      <TaskStatusIcon
        status={
          typeof arg.event.extendedProps.status === "string"
            ? arg.event.extendedProps.status
            : "ready_to_start"
        }
        size={12}
        className="task-calendar-event__status-icon"
        inboxUpdatedAt={
          "inboxUpdatedAt" in arg.event.extendedProps
            ? (arg.event.extendedProps.inboxUpdatedAt as
                | number
                | Date
                | string
                | null)
            : null
        }
      />
    );

  return (
    <div
      className={`task-calendar-event__content${
        expanded ? " task-calendar-event__content--expanded" : ""
      }`}
    >
      {expanded && projectName ? (
        <span className="task-calendar-event__project">{projectName}</span>
      ) : null}
      <div className="task-calendar-event__row">
        {statusIcon}
        {arg.timeText ? (
          <span className="task-calendar-event__time">{arg.timeText}</span>
        ) : null}
        <span className="task-calendar-event__title">{title}</span>
      </div>
    </div>
  );
}

export function renderCalendarTaskEventContent(arg: EventContentArg) {
  if (
    arg.event.display === "background" ||
    arg.event.extendedProps.entityType === MEETINGS_AVAILABILITY_MARKER_TYPE
  ) {
    return null;
  }
  return <CalendarTaskEventContent arg={arg} />;
}
