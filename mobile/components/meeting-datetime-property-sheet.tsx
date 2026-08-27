import { useCallback, useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../lib/theme";
import { useHideTabBar } from "../lib/tab-bar-visibility";

export type MeetingDateTimePropertySheetProps = {
  visible: boolean;
  title: string;
  value: string | null;
  onSelect: (iso: string) => void;
  onClose: () => void;
};

function parseIso(value: string | null): Date {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

/** Native date+time picker for meeting start/end editing. */
export function MeetingDateTimePropertySheet({
  visible,
  title,
  value,
  onSelect,
  onClose,
}: MeetingDateTimePropertySheetProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(() => parseIso(value));

  useHideTabBar(visible);

  useEffect(() => {
    if (!visible) return;
    setDraft(parseIso(value));
  }, [value, visible]);

  const commit = useCallback(() => {
    onSelect(draft.toISOString());
    onClose();
  }, [draft, onClose, onSelect]);

  const handleChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === "android") {
        if (event.type === "dismissed" || !date) {
          onClose();
          return;
        }
        onSelect(date.toISOString());
        onClose();
        return;
      }
      if (date) setDraft(date);
    },
    [onClose, onSelect],
  );

  if (!visible) return null;

  if (Platform.OS === "android") {
    return (
      <DateTimePicker
        value={draft}
        mode="datetime"
        display="default"
        onChange={handleChange}
      />
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { paddingBottom: Math.max(24, insets.bottom + 12) },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.sheetHeader}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.headerAction}>Cancel</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={commit} hitSlop={10}>
              <Text style={[styles.headerAction, styles.headerDone]}>Done</Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={draft}
            mode="datetime"
            display="spinner"
            onChange={handleChange}
            themeVariant="dark"
          />
        </Pressable>
      </Pressable>
    </Modal>
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
  headerDone: {
    color: colors.foreground,
    textAlign: "right",
    fontWeight: "600",
  },
});
