import { useMemo, useRef } from "react";
import type { ExternalCalendarEvent } from "@backsteros/contracts";
import {
  buildCalendarDayHabitsByDate,
  meetingCalendarEventClassNames,
  mergeCalendarGridEvents,
} from "@backsteros/ui";

import type { DesktopWorkspaceData } from "../../lib/workspace/workspace-data-types";

export type CalendarMeetingDraft = {
  key: number;
  startAt: string;
  endAt: string;
};

/**
 * Grid events + day habit icons for the calendar. While the keep-alive route
 * is frozen the last computed model is reused so hidden tabs skip rebuilds.
 */
export function useCalendarGridModel({
  frozen,
  allTasks,
  habits,
  meetings,
  contacts,
  nowMs,
  externalCalendarEvents,
  meetingDraft,
}: {
  frozen: boolean;
  allTasks: DesktopWorkspaceData["allTasks"];
  habits: DesktopWorkspaceData["habits"];
  meetings: DesktopWorkspaceData["meetings"];
  contacts: DesktopWorkspaceData["contacts"];
  nowMs: number;
  externalCalendarEvents: ExternalCalendarEvent[];
  meetingDraft: CalendarMeetingDraft | null;
}) {
  const frozenEventsRef = useRef<ReturnType<
    typeof mergeCalendarGridEvents
  > | null>(null);
  const frozenDayHabitsRef = useRef<ReturnType<
    typeof buildCalendarDayHabitsByDate
  > | null>(null);

  const events = useMemo(() => {
    if (frozen && frozenEventsRef.current) {
      return frozenEventsRef.current;
    }
    const habitIconById = new Map(
      habits.map((habit) => [habit.id, habit.icon ?? null] as const),
    );
    const tasksWithHabitIcons = allTasks.map((task) => {
      const habitId = task.habitId?.trim() || null;
      if (!habitId) return task;
      return {
        ...task,
        habitIcon: habitIconById.get(habitId) ?? null,
      };
    });
    const next = mergeCalendarGridEvents(
      tasksWithHabitIcons,
      meetings,
      new Date(nowMs),
      contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        birthday: contact.birthday ?? null,
      })),
      undefined,
      externalCalendarEvents,
    );
    frozenEventsRef.current = next;
    return next;
  }, [allTasks, contacts, externalCalendarEvents, frozen, habits, meetings, nowMs]);

  const calendarEvents = useMemo(() => {
    if (!meetingDraft) return events;
    return [
      ...events,
      {
        id: `meeting-draft:${meetingDraft.key}`,
        title: "Name of meeting",
        start: meetingDraft.startAt,
        end: meetingDraft.endAt,
        allDay: false,
        editable: false,
        startEditable: false,
        durationEditable: false,
        classNames: [
          ...meetingCalendarEventClassNames(),
          "meeting-calendar-event--draft",
        ],
        extendedProps: {
          entityType: "meeting" as const,
          meetingId: `draft:${meetingDraft.key}`,
          status: "triage",
          endAt: meetingDraft.endAt,
          finished: false,
          draft: true,
          externalCalendarEventId: null,
          providerEventId: null,
        },
      },
    ];
  }, [events, meetingDraft]);

  const dayHabitsByDate = useMemo(() => {
    if (frozen && frozenDayHabitsRef.current) {
      return frozenDayHabitsRef.current;
    }
    const next = buildCalendarDayHabitsByDate(habits, allTasks);
    frozenDayHabitsRef.current = next;
    return next;
  }, [allTasks, frozen, habits]);

  return { events, calendarEvents, dayHabitsByDate };
}
