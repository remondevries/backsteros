"use client";

import type { EventContentArg } from "@fullcalendar/core";

import {
  calendarEntityFromEvent,
  calendarEventDurationMs,
  calendarEventHasExpandedContent,
} from "../calendar/calendar-events.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";

function readProjectName(extendedProps: Record<string, unknown>): string | null {
  const value = extendedProps.projectName;
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
  const title =
    arg.event.title?.trim() ||
    (entity.entityType === "meeting" ? "Untitled meeting" : "Untitled task");
  const projectName = readProjectName(arg.event.extendedProps);
  const durationMs = calendarEventDurationMs(arg.event.start, arg.event.end);
  const expanded = calendarEventHasExpandedContent(durationMs);

  const statusIcon =
    entity.entityType === "meeting" ? (
      <TaskDueDateIcon
        active
        urgency="due_today"
        size={12}
        className="task-calendar-event__status-icon"
      />
    ) : (
      <TaskStatusIcon
        status={
          typeof arg.event.extendedProps.status === "string"
            ? arg.event.extendedProps.status
            : "ready_to_start"
        }
        size={12}
        className="task-calendar-event__status-icon"
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
  return <CalendarTaskEventContent arg={arg} />;
}
