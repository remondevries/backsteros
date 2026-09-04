import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  calendarChangeToMeetingPatch,
  calendarChangeToTaskPatch,
  calendarSelectionToMeetingRange,
} from "../../lib/calendar/calendar-events";
import { CALENDAR_VIEW_MODE_OPTIONS } from "../../lib/calendar/calendar-view-modes";
import { useCalendarGridEvents } from "../../lib/calendar/use-calendar-grid-events";
import { contactDetailHref } from "../../lib/detail-href";
import { isPadDevice } from "../../lib/device";
import { patchEntityViaPowerSyncOrApi } from "../../lib/entity-mutations";
import { createMeetingViaPowerSyncOrApi } from "../../lib/meeting-create";
import { patchMeetingViaPowerSyncOrApi } from "../../lib/meeting-mutations";
import { useMobilePowerSync } from "../../lib/powersync-context";
import { floatingComposeOverlayInsets } from "../../lib/tab-bar-inset";
import { colors } from "../../lib/theme";
import { useCalendarPageMode } from "../../lib/use-calendar-page-mode";
import { useCalendarViewMode } from "../../lib/use-calendar-view-mode";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { SegmentedPillToggle } from "../segmented-pill-toggle";
import { CalendarAvailabilityPane } from "./calendar-availability-pane";
import { CalendarDayContextPane } from "./calendar-day-context-pane";
import { CalendarRangeArrows } from "./calendar-range-arrows";
import { CalendarScreenHeader } from "./calendar-screen-header";
import { CalendarWeekStrip } from "./calendar-week-strip";
import {
  CalendarGridWebView,
  type CalendarGridHostMessage,
} from "./calendar-grid-webview";
import { CalendarTimetrackingPane } from "./calendar-timetracking-pane";
import type { UpdateMeetingInput } from "@backsteros/contracts";

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function shiftCalendarDay(
  date: Date,
  viewMode: "month" | "day",
  direction: -1 | 1,
): Date {
  if (viewMode === "month") {
    return startOfLocalDay(
      new Date(date.getFullYear(), date.getMonth() + direction, 1),
    );
  }
  return startOfLocalDay(
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + direction * 7,
    ),
  );
}

export function CalendarScreen() {
  const router = useRouter();
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const { mode } = useCalendarPageMode();
  const { viewMode, setViewMode } = useCalendarViewMode();
  const { events } = useCalendarGridEvents();
  const [selectedDay, setSelectedDay] = useState(() => startOfLocalDay(new Date()));
  const isPad = isPadDevice();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const viewModeDockInsets = floatingComposeOverlayInsets(
    windowWidth,
    insets.bottom,
  );

  const handleGridMessage = useCallback(
    async (message: CalendarGridHostMessage) => {
      if (message.type === "eventClick") {
        if (message.meetingId) {
          router.push(`/meeting/${message.meetingId}`);
          return;
        }
        if (message.contactId) {
          router.push(contactDetailHref(message.contactId));
          return;
        }
        if (message.taskId) {
          router.push(`/task/${message.taskId}`);
        }
        return;
      }
      if (message.type === "eventChange") {
        const change = {
          start: message.start ? new Date(message.start) : null,
          end: message.end ? new Date(message.end) : null,
          allDay: message.allDay,
        };
        if (message.entityType === "task") {
          const patch = calendarChangeToTaskPatch(change);
          if (!patch) return;
          await patchEntityViaPowerSyncOrApi(
            client,
            powerSync,
            "tasks",
            message.entityId,
            {
              dueDate: patch.dueDate,
              dueEndDate: patch.dueEndDate,
            },
            {
              due_date: patch.dueDate,
              due_end_date: patch.dueEndDate,
            },
          );
          return;
        }
        const patch = calendarChangeToMeetingPatch(change);
        if (!patch) return;
        await patchMeetingViaPowerSyncOrApi(
          client,
          powerSync,
          message.entityId,
          {
            startAt: patch.startAt,
            endAt: patch.endAt,
            status: patch.status,
          } as UpdateMeetingInput,
        );
        return;
      }
      if (message.type === "select") {
        const range = calendarSelectionToMeetingRange({
          start: new Date(message.start),
          end: new Date(message.end),
          allDay: message.allDay,
        });
        if (!range) return;
        const meeting = await createMeetingViaPowerSyncOrApi(client, powerSync, {
          title: "New meeting",
          startAt: range.startAt,
          endAt: range.endAt,
          status: "triage" as const,
        });
        router.push(`/meeting/${meeting.id}`);
      }
    },
    [client, powerSync, router],
  );

  const shiftSelectedDay = useCallback(
    (direction: -1 | 1) => {
      setSelectedDay((current) => shiftCalendarDay(current, viewMode, direction));
    },
    [viewMode],
  );

  const screenHeader = (
    <CalendarScreenHeader
      mode={mode}
      onCreateMeeting={() => router.push("/create/meeting")}
      titleAccessory={
        mode === "calendar" ? (
          <CalendarRangeArrows
            onPrev={() => shiftSelectedDay(-1)}
            onNext={() => shiftSelectedDay(1)}
            prevAccessibilityLabel={
              viewMode === "month" ? "Previous month" : "Previous week"
            }
            nextAccessibilityLabel={
              viewMode === "month" ? "Next month" : "Next week"
            }
          />
        ) : null
      }
    />
  );

  const viewModeDock = (
    <View
      pointerEvents="box-none"
      style={[styles.viewModeDock, viewModeDockInsets]}
    >
      <View style={styles.viewModeDockInner}>
        <SegmentedPillToggle
          value={viewMode}
          options={CALENDAR_VIEW_MODE_OPTIONS}
          onChange={setViewMode}
          accessibilityLabel="Calendar view"
        />
      </View>
    </View>
  );

  if (mode === "timetracking") {
    return (
      <View style={styles.root}>
        {screenHeader}
        <CalendarTimetrackingPane selectedDay={selectedDay} />
      </View>
    );
  }

  if (mode === "availability") {
    return (
      <View style={styles.root}>
        {screenHeader}
        <CalendarAvailabilityPane selectedDay={selectedDay} />
      </View>
    );
  }

  if (isPad) {
    return (
      <View style={styles.root}>
        {screenHeader}
        <View style={styles.padSplit}>
          <View style={styles.gridPane}>
            <CalendarGridWebView
              events={events}
              viewMode={viewMode}
              selectedDate={selectedDay}
              onMessage={(message) => {
                void handleGridMessage(message);
              }}
            />
          </View>
          <View style={styles.contextPane}>
            <CalendarDayContextPane
              selectedDay={selectedDay}
              style={styles.contextFill}
            />
          </View>
        </View>
        {viewModeDock}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {screenHeader}
      {viewMode === "day" ? (
        <CalendarWeekStrip
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      ) : null}
      <View style={styles.phoneGrid}>
        <CalendarGridWebView
          events={events}
          viewMode={viewMode}
          selectedDate={selectedDay}
          onMessage={(message) => {
            void handleGridMessage(message);
          }}
        />
      </View>
      {viewModeDock}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  padSplit: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  gridPane: {
    flex: 1.4,
    minWidth: 0,
    minHeight: 0,
  },
  contextPane: {
    width: 320,
    flexShrink: 0,
    minHeight: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  contextFill: {
    flex: 1,
    borderTopWidth: 0,
  },
  phoneGrid: {
    flex: 1,
    minHeight: 0,
  },
  viewModeDock: {
    position: "absolute",
    zIndex: 10,
  },
  viewModeDockInner: {
    padding: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
