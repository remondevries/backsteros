import { useCallback, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import {
  naturalLanguageDueDatePreview,
  parseNaturalLanguageDueDate,
} from "../lib/parse-natural-language-due-date";
import {
  endOfLocalDayIso,
  formatLocalYmd,
  formatTaskDueMetaLabel,
  parseYmdLocal,
} from "../lib/task-due-date";
import { colors } from "../lib/theme";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";
import { TaskDueDateIcon } from "./task-due-date-icon";

const PICK_DATE_VALUE = "__pick_due_date__";

function dueIsoForOffset(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return endOfLocalDayIso(date);
}

function parseSelectedToDate(selected: string | null): Date {
  if (selected) {
    const ymd = selected.slice(0, 10);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    const parsed = new Date(selected);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function toDueIsoFromDate(date: Date): string {
  return endOfLocalDayIso(date);
}

export type DueDatePropertySheetProps = {
  visible: boolean;
  title?: string;
  selected: string | null;
  onSelect: (value: string | null) => void;
  onClose: () => void;
  embedded?: boolean;
  /** Extra preset rows before Today (e.g. current custom date label). */
  includeCurrentSelection?: boolean;
  emptyLabel?: string;
};

/**
 * Due-date option sheet with presets + “Pick a date…” opening the native picker.
 */
export function DueDatePropertySheet({
  visible,
  title = "Due date",
  selected,
  onSelect,
  onClose,
  embedded = false,
  includeCurrentSelection = true,
  emptyLabel = "No due date",
}: DueDatePropertySheetProps) {
  const [nativeOpen, setNativeOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(() =>
    parseSelectedToDate(selected),
  );
  const suppressSheetCloseRef = useRef(false);

  const options = useMemo<PropertyOption<string | null>[]>(() => {
    const todayIso = dueIsoForOffset(0);
    const tomorrowIso = dueIsoForOffset(1);
    const weekIso = dueIsoForOffset(7);
    const presetValues = new Set([todayIso, tomorrowIso, weekIso, null]);

    const rows: PropertyOption<string | null>[] = [
      {
        value: null,
        label: emptyLabel,
        icon: <TaskDueDateIcon active={false} size={14} />,
      },
      {
        value: todayIso,
        label: "Today",
        icon: <TaskDueDateIcon active size={14} />,
      },
      {
        value: tomorrowIso,
        label: "Tomorrow",
        icon: <TaskDueDateIcon active size={14} />,
      },
      {
        value: weekIso,
        label: "In 7 days",
        icon: <TaskDueDateIcon active size={14} />,
      },
    ];

    if (
      includeCurrentSelection &&
      selected &&
      !presetValues.has(selected) &&
      !rows.some((row) => row.value === selected)
    ) {
      rows.splice(1, 0, {
        value: selected,
        label: formatTaskDueMetaLabel(selected) ?? selected.slice(0, 10),
        icon: <TaskDueDateIcon active size={14} />,
      });
    }

    rows.push({
      value: PICK_DATE_VALUE,
      label: "Pick a date…",
      icon: <TaskDueDateIcon active size={14} />,
    });

    return rows;
  }, [emptyLabel, includeCurrentSelection, selected]);

  const openNative = useCallback(() => {
    setDraftDate(parseSelectedToDate(selected));
    setNativeOpen(true);
  }, [selected]);

  const closeNative = useCallback(() => {
    setNativeOpen(false);
  }, []);

  const commitNative = useCallback(
    (date: Date) => {
      onSelect(toDueIsoFromDate(date));
      setNativeOpen(false);
      onClose();
    },
    [onClose, onSelect],
  );

  const handleNativeChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === "android") {
        setNativeOpen(false);
        if (event.type === "dismissed" || !date) {
          return;
        }
        commitNative(date);
        return;
      }
      if (date) {
        setDraftDate(date);
      }
    },
    [commitNative],
  );

  const handleSelect = useCallback(
    (value: string | null) => {
      if (value === PICK_DATE_VALUE) {
        // PropertyOptionSheet always calls onClose after onSelect — ignore that
        // so the host picker stays mounted while the native calendar is open.
        suppressSheetCloseRef.current = true;
        openNative();
        return;
      }
      onSelect(value);
    },
    [onSelect, openNative],
  );

  const handleSheetClose = useCallback(() => {
    if (suppressSheetCloseRef.current) {
      suppressSheetCloseRef.current = false;
      return;
    }
    onClose();
  }, [onClose]);

  const handleQuerySubmit = useCallback(
    (query: string) => {
      const result = parseNaturalLanguageDueDate(query);
      if (result.kind === "clear") {
        onSelect(null);
        return true;
      }
      if (result.kind === "date") {
        const date = parseYmdLocal(result.ymd);
        if (!date) return false;
        onSelect(endOfLocalDayIso(date));
        return true;
      }
      return false;
    },
    [onSelect],
  );

  const handleQueryPreview = useCallback(
    (query: string) => naturalLanguageDueDatePreview(query),
    [],
  );

  return (
    <>
      <PropertyOptionSheet
        embedded={embedded}
        visible={visible && !nativeOpen}
        title={title}
        options={options}
        selected={selected}
        onSelect={handleSelect}
        onClose={handleSheetClose}
        searchPlaceholder="tomorrow, yesterday, 2 weeks ago…"
        onQuerySubmit={handleQuerySubmit}
        queryPreviewLabel={handleQueryPreview}
      />

      {nativeOpen && Platform.OS === "android" ? (
        <DateTimePicker
          value={draftDate}
          mode="date"
          display="default"
          onChange={handleNativeChange}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal
          visible={nativeOpen}
          transparent
          animationType="fade"
          onRequestClose={closeNative}
        >
          <Pressable style={styles.backdrop} onPress={closeNative}>
            <Pressable
              style={styles.sheet}
              onPress={(event) => event.stopPropagation()}
            >
              <View style={styles.sheetHeader}>
                <Pressable
                  onPress={closeNative}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.headerAction}>Cancel</Text>
                </Pressable>
                <Text style={styles.sheetTitle}>Pick a date</Text>
                <Pressable
                  onPress={() => commitNative(draftDate)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                >
                  <Text
                    style={[styles.headerAction, styles.headerActionPrimary]}
                  >
                    Done
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={draftDate}
                mode="date"
                display="spinner"
                themeVariant="dark"
                onChange={handleNativeChange}
                style={styles.picker}
              />
              <Text style={styles.hint}>
                {formatTaskDueMetaLabel(formatLocalYmd(draftDate)) ??
                  formatLocalYmd(draftDate)}
              </Text>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.surface,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  headerAction: {
    color: colors.muted,
    fontSize: 15,
    minWidth: 64,
  },
  headerActionPrimary: {
    color: colors.foreground,
    fontWeight: "600",
    textAlign: "right",
  },
  picker: {
    alignSelf: "stretch",
    height: 216,
  },
  hint: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 13,
    paddingBottom: 8,
  },
});
