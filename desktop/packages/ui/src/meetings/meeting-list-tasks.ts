import type { TaskItemRowTask } from "../components/tasks/task-item-row.js";
import { formatCalendarTaskScheduleLabel } from "../calendar/calendar-events.js";
import {
  formatMeetingDisplayId,
  getCalendarMeetingHref,
  type MeetingListItem,
} from "./meetings.js";
import { resolveMeetingEffectiveStatus } from "./meeting-status.js";

function toEpoch(
  value: number | Date | string | null | undefined,
): number | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

/** Map a meeting into a Tasks / project list row (not a Postgres task). */
export function buildTaskListMeetingItem(
  meeting: MeetingListItem,
  now = new Date(),
): TaskItemRowTask {
  return {
    id: meeting.id,
    number: meeting.number,
    title: meeting.title,
    status: resolveMeetingEffectiveStatus(meeting, now),
    priority: meeting.priority ?? 0,
    dueDate: toEpoch(meeting.startAt),
    dueEndDate: toEpoch(meeting.endAt),
    projectId: meeting.projectId ?? null,
    projectName: meeting.projectName ?? null,
    projectKey: meeting.projectKey ?? null,
    listKind: "meeting",
    meetingDisplayId: formatMeetingDisplayId(meeting.number),
    meetingScheduleLabel: formatCalendarTaskScheduleLabel(
      meeting.startAt,
      meeting.endAt,
    ),
    inboxUpdatedAt: meeting.inboxUpdatedAt ?? null,
  };
}

export function isMeetingTaskListItem(
  task: Pick<TaskItemRowTask, "listKind">,
): boolean {
  return task.listKind === "meeting";
}

export function getMeetingTaskListHref(
  task: Pick<TaskItemRowTask, "listKind" | "id">,
): string | null {
  if (task.listKind !== "meeting") return null;
  return getCalendarMeetingHref(task.id);
}

export function filterMeetingTaskRowsForProject<
  T extends Pick<TaskItemRowTask, "projectId" | "projectKey">,
>(meetings: readonly T[], project: { id: string; key: string }): T[] {
  const key = project.key.trim().toLowerCase();
  return meetings.filter((meeting) => {
    if (meeting.projectId && meeting.projectId === project.id) return true;
    if (meeting.projectKey?.trim().toLowerCase() === key) return true;
    return false;
  });
}
