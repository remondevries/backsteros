import {
  parseCalendarMeetingOverlayId,
  sortMeetingsByStart,
  type MeetingListItem,
} from "../meetings/meetings.js";
import { meetingBelongsInInbox } from "../inbox/inbox-items.js";

export const CALENDAR_SIDE_PANEL_MEETING_PREFIX = "meeting:";
export const CALENDAR_SIDE_PANEL_TASK_PREFIX = "task:";
export const CALENDAR_SIDE_PANEL_HABIT_PREFIX = "habit:";

export function partitionCalendarSidePanelMeetings<T extends MeetingListItem>(
  meetings: readonly T[],
): { inboxMeetings: T[]; scheduledMeetings: T[] } {
  const inboxMeetings: T[] = [];
  const scheduledMeetings: T[] = [];
  for (const meeting of meetings) {
    if (meetingBelongsInInbox({ status: meeting.status })) {
      inboxMeetings.push(meeting);
    } else {
      scheduledMeetings.push(meeting);
    }
  }
  return {
    inboxMeetings: sortMeetingsByStart(inboxMeetings),
    scheduledMeetings: sortMeetingsByStart(scheduledMeetings),
  };
}

export function calendarSidePanelMeetingItemId(meetingId: string): string {
  return `${CALENDAR_SIDE_PANEL_MEETING_PREFIX}${meetingId}`;
}

export function calendarSidePanelTaskItemId(taskId: string): string {
  return `${CALENDAR_SIDE_PANEL_TASK_PREFIX}${taskId}`;
}

export function calendarSidePanelHabitItemId(habitId: string): string {
  return `${CALENDAR_SIDE_PANEL_HABIT_PREFIX}${habitId}`;
}

export function getSelectedCalendarSidePanelItemId(
  pathname: string,
  search: string,
): string | null {
  const taskMatch = pathname.match(/^\/calendar\/tasks\/([^/]+)/);
  if (taskMatch?.[1]) {
    return calendarSidePanelTaskItemId(decodeURIComponent(taskMatch[1]));
  }

  const meetingRouteMatch = pathname.match(/^\/calendar\/meetings\/([^/]+)/);
  if (meetingRouteMatch?.[1]) {
    return calendarSidePanelMeetingItemId(
      decodeURIComponent(meetingRouteMatch[1]),
    );
  }

  const meetingId = parseCalendarMeetingOverlayId(search);
  if (meetingId) {
    return calendarSidePanelMeetingItemId(meetingId);
  }

  return null;
}

export function buildCalendarSidePanelKeyboardItemIds(input: {
  meetings: readonly MeetingListItem[];
  tasks: readonly { id: string }[];
  habits?: readonly { id: string }[];
  inboxCollapsed?: boolean;
  meetingsCollapsed: boolean;
  habitsCollapsed?: boolean;
  tasksCollapsed: boolean;
}): string[] {
  const ids: string[] = [];
  const { inboxMeetings, scheduledMeetings } =
    partitionCalendarSidePanelMeetings(input.meetings);

  if (!input.inboxCollapsed) {
    for (const meeting of inboxMeetings) {
      ids.push(calendarSidePanelMeetingItemId(meeting.id));
    }
  }

  if (!input.meetingsCollapsed) {
    for (const meeting of scheduledMeetings) {
      ids.push(calendarSidePanelMeetingItemId(meeting.id));
    }
  }

  if (!input.habitsCollapsed) {
    for (const habit of input.habits ?? []) {
      ids.push(calendarSidePanelHabitItemId(habit.id));
    }
  }

  if (!input.tasksCollapsed) {
    for (const task of input.tasks) {
      ids.push(calendarSidePanelTaskItemId(task.id));
    }
  }

  return ids;
}

export function parseCalendarSidePanelKeyboardItemId(itemId: string): {
  kind: "meeting" | "task" | "habit";
  entityId: string;
} | null {
  if (itemId.startsWith(CALENDAR_SIDE_PANEL_MEETING_PREFIX)) {
    const entityId = itemId.slice(CALENDAR_SIDE_PANEL_MEETING_PREFIX.length);
    return entityId ? { kind: "meeting", entityId } : null;
  }
  if (itemId.startsWith(CALENDAR_SIDE_PANEL_HABIT_PREFIX)) {
    const entityId = itemId.slice(CALENDAR_SIDE_PANEL_HABIT_PREFIX.length);
    return entityId ? { kind: "habit", entityId } : null;
  }
  if (itemId.startsWith(CALENDAR_SIDE_PANEL_TASK_PREFIX)) {
    const entityId = itemId.slice(CALENDAR_SIDE_PANEL_TASK_PREFIX.length);
    return entityId ? { kind: "task", entityId } : null;
  }
  return null;
}
