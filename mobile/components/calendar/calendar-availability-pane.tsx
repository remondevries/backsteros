import type { MeetingWeekdayHoursEntry } from "@backsteros/contracts";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import {
  addWeekdaySlot,
  formatSlotLabel,
  formatWeekdaySlotsLabel,
  patchWeekdayHoursEntry,
  removeWeekdaySlot,
  updateWeekdaySlot,
} from "../../lib/calendar/calendar-availability-slots";
import {
  weekdayHoursToCalendarEvents,
  weekdayLabel,
} from "../../lib/calendar/calendar-availability-events";
import { isPadDevice } from "../../lib/device";
import { useMeetingSchedulingSettings } from "../../lib/use-meeting-scheduling-settings";
import { colors } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { TextInput } from "../app-text-input";
import { CalendarGridWebView } from "./calendar-grid-webview";
import { useCalendarViewMode } from "../../lib/use-calendar-view-mode";

type Props = {
  selectedDay: Date;
};

export function CalendarAvailabilityPane({ selectedDay }: Props) {
  const { settings, loading, error, setWeekdayHours } =
    useMeetingSchedulingSettings();
  const { viewMode } = useCalendarViewMode(
    "circle:calendar-availability-view-mode",
  );
  const [editingWeekday, setEditingWeekday] = useState<number | null>(null);
  const isPad = isPadDevice();

  const weekdayHours = settings?.weekdayHours ?? [];
  const timezone = settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const range = useMemo(() => {
    const start = new Date(selectedDay);
    start.setDate(start.getDate() - 7);
    const end = new Date(selectedDay);
    end.setDate(end.getDate() + 35);
    return { start, end };
  }, [selectedDay]);

  const availabilityEvents = useMemo(() => {
    if (!weekdayHours.length) return [];
    return weekdayHoursToCalendarEvents({
      weekdayHours,
      timezone,
      rangeStart: range.start,
      rangeEnd: range.end,
      editable: false,
      presentation: viewMode === "month" ? "month" : "timed",
    });
  }, [range.end, range.start, timezone, viewMode, weekdayHours]);

  const patchDay = useCallback(
    (weekday: number, patch: Partial<Pick<MeetingWeekdayHoursEntry, "enabled" | "slots">>) => {
      setWeekdayHours(patchWeekdayHoursEntry(weekdayHours, weekday, patch));
    },
    [setWeekdayHours, weekdayHours],
  );

  const editor = (
    <ScrollView contentContainerStyle={styles.editorList}>
      {weekdayHours.map((entry) => (
        <View key={entry.weekday} style={styles.dayCard}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{weekdayLabel(entry.weekday)}</Text>
            <Switch
              value={entry.enabled}
              onValueChange={(enabled) => patchDay(entry.weekday, { enabled })}
            />
          </View>
          {entry.enabled ? (
            <>
              {entry.slots.map((slot, slotIndex) => (
                <View key={slotIndex} style={styles.slotRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setEditingWeekday(
                        editingWeekday === entry.weekday ? null : entry.weekday,
                      )
                    }
                    style={styles.slotLabel}
                  >
                    <Text style={styles.slotText}>{formatSlotLabel(slot)}</Text>
                  </Pressable>
                  {editingWeekday === entry.weekday ? (
                    <View style={styles.slotEditors}>
                      <TextInput
                        value={slot.start}
                        onChangeText={(start) =>
                          setWeekdayHours(
                            updateWeekdaySlot(weekdayHours, entry.weekday, slotIndex, {
                              start,
                            }),
                          )
                        }
                        placeholder="09:00"
                        style={styles.timeInput}
                      />
                      <Text style={styles.slotDash}>–</Text>
                      <TextInput
                        value={slot.end}
                        onChangeText={(end) =>
                          setWeekdayHours(
                            updateWeekdaySlot(weekdayHours, entry.weekday, slotIndex, {
                              end,
                            }),
                          )
                        }
                        placeholder="17:00"
                        style={styles.timeInput}
                      />
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          setWeekdayHours(
                            removeWeekdaySlot(weekdayHours, entry.weekday, slotIndex),
                          )
                        }
                      >
                        <Text style={styles.removeSlot}>Remove</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setWeekdayHours(addWeekdaySlot(weekdayHours, entry.weekday))
                }
              >
                <Text style={styles.addSlot}>Add slot</Text>
              </Pressable>
              <Text style={styles.summary}>{formatWeekdaySlotsLabel(entry)}</Text>
            </>
          ) : (
            <Text style={ui.body}>Unavailable</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );

  if (loading && !settings) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.root}>
        <Text style={ui.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {isPad ? (
        <View style={styles.padSplit}>
          <View style={styles.editorPane}>{editor}</View>
          <View style={styles.gridPane}>
            <CalendarGridWebView
              events={availabilityEvents}
              viewMode={viewMode}
              selectedDate={selectedDay}
              editable={false}
            />
          </View>
        </View>
      ) : (
        editor
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  padSplit: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  editorPane: {
    width: 320,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  gridPane: {
    flex: 1,
    minWidth: 0,
  },
  editorList: {
    padding: 16,
    gap: 12,
  },
  dayCard: {
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  slotRow: {
    gap: 8,
  },
  slotLabel: {
    paddingVertical: 4,
  },
  slotText: {
    color: colors.foreground,
    fontSize: 14,
  },
  slotEditors: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  timeInput: {
    minWidth: 72,
    color: colors.foreground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  slotDash: {
    color: colors.muted,
  },
  removeSlot: {
    color: "#da615d",
    fontSize: 13,
  },
  addSlot: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "500",
  },
  summary: {
    color: colors.muted,
    fontSize: 12,
  },
});
