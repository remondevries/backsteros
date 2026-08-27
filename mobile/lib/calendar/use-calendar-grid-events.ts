import { useMemo } from "react";

import {
  mergeCalendarGridEvents,
  type CalendarTaskLike,
  type MeetingCalendarLike,
  type TaskCalendarEvent,
} from "../calendar/calendar-events";
import { useLocalQuery } from "../use-local-query";

type CalendarTaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  due_date: string | null;
  due_end_date: string | null;
  habit_id: string | null;
  project_name: string | null;
};

type CalendarMeetingRow = {
  id: string;
  title: string | null;
  status: string | null;
  start_at: string | null;
  end_at: string | null;
  project_name: string | null;
};

const CALENDAR_TASKS_SQL = `
SELECT
  t.id,
  t.title,
  t.status,
  t.due_date,
  t.due_end_date,
  t.habit_id,
  p.name AS project_name
FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
WHERE t.deleted_at IS NULL
  AND t.due_date IS NOT NULL
  AND t.due_date != ''
ORDER BY t.due_date ASC`;

const CALENDAR_MEETINGS_SQL = `
SELECT
  m.id,
  m.title,
  m.status,
  m.start_at,
  m.end_at,
  p.name AS project_name
FROM meetings m
LEFT JOIN projects p ON p.id = m.project_id AND p.deleted_at IS NULL
WHERE m.deleted_at IS NULL
  AND m.start_at IS NOT NULL
  AND m.end_at IS NOT NULL
ORDER BY m.start_at ASC`;

function rowToCalendarTask(row: CalendarTaskRow): CalendarTaskLike {
  return {
    id: row.id,
    title: row.title?.trim() || "Untitled task",
    status: row.status ?? "backlog",
    dueDate: row.due_date,
    dueEndDate: row.due_end_date,
    habitId: row.habit_id,
    projectName: row.project_name,
  };
}

function rowToCalendarMeeting(row: CalendarMeetingRow): MeetingCalendarLike | null {
  if (!row.start_at || !row.end_at) return null;
  return {
    id: row.id,
    title: row.title?.trim() || "Untitled meeting",
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    projectName: row.project_name,
  };
}

export function useCalendarGridEvents(): {
  events: TaskCalendarEvent[];
  loading: boolean;
} {
  const { data: taskRows, isLoading: tasksLoading } =
    useLocalQuery<CalendarTaskRow>(CALENDAR_TASKS_SQL);
  const { data: meetingRows, isLoading: meetingsLoading } =
    useLocalQuery<CalendarMeetingRow>(CALENDAR_MEETINGS_SQL);

  const events = useMemo(() => {
    const tasks = taskRows.map(rowToCalendarTask);
    const meetings = meetingRows
      .map(rowToCalendarMeeting)
      .filter((row): row is MeetingCalendarLike => row != null);
    return mergeCalendarGridEvents(tasks, meetings);
  }, [meetingRows, taskRows]);

  return {
    events,
    loading: tasksLoading || meetingsLoading,
  };
}
