import { formatContactDisplayName } from "@backsteros/contracts";
import { useMemo } from "react";

import {
  mergeCalendarGridEvents,
  type BirthdayCalendarLike,
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

type CalendarBirthdayRow = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  birthday: string | null;
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

const CALENDAR_BIRTHDAYS_SQL = `
SELECT id, name, first_name, last_name, birthday
FROM contacts
WHERE deleted_at IS NULL
  AND birthday IS NOT NULL
  AND birthday != ''`;

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

function rowToCalendarMeeting(
  row: CalendarMeetingRow,
): MeetingCalendarLike | null {
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

function rowToBirthday(row: CalendarBirthdayRow): BirthdayCalendarLike | null {
  if (!row.birthday?.trim()) return null;
  const name =
    formatContactDisplayName(row.first_name ?? "", row.last_name ?? "") ||
    row.name?.trim() ||
    "Contact";
  return {
    id: row.id,
    name,
    birthday: row.birthday,
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
  const { data: birthdayRows, isLoading: birthdaysLoading } =
    useLocalQuery<CalendarBirthdayRow>(CALENDAR_BIRTHDAYS_SQL);

  const events = useMemo(() => {
    const tasks = taskRows.map(rowToCalendarTask);
    const meetings = meetingRows
      .map(rowToCalendarMeeting)
      .filter((row): row is MeetingCalendarLike => row != null);
    const birthdays = birthdayRows
      .map(rowToBirthday)
      .filter((row): row is BirthdayCalendarLike => row != null);
    return mergeCalendarGridEvents(tasks, meetings, new Date(), birthdays);
  }, [birthdayRows, meetingRows, taskRows]);

  return {
    events,
    loading: tasksLoading || meetingsLoading || birthdaysLoading,
  };
}
