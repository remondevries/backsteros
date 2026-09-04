import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../lib/theme";
import { useHideTabBar } from "../lib/tab-bar-visibility";
import { TextInput } from "./app-text-input";

export type AttendeeOption = {
  id: string;
  label: string;
  icon?: ReactNode;
};

type Props = {
  visible: boolean;
  title?: string;
  searchPlaceholder?: string;
  options: readonly AttendeeOption[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
};

export function AttendeesPropertySheet({
  visible,
  title = "Attendees",
  searchPlaceholder = "Search…",
  options,
  selectedIds,
  onChange,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<string[]>([...selectedIds]);
  const [query, setQuery] = useState("");

  useHideTabBar(visible);

  useEffect(() => {
    if (!visible) return;
    setDraft([...selectedIds]);
    setQuery("");
  }, [selectedIds, visible]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(needle),
    );
  }, [options, query]);

  const toggle = useCallback((id: string) => {
    setDraft((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  }, []);

  const commit = useCallback(() => {
    onChange(draft);
    onClose();
  }, [draft, onClose, onChange]);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { paddingBottom: Math.max(16, insets.bottom + 8) },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.headerAction}>Cancel</Text>
            </Pressable>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={commit} hitSlop={10}>
              <Text style={[styles.headerAction, styles.done]}>Done</Text>
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            style={styles.search}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {filtered.map((option) => {
              const selected = draft.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggle(option.id)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed ? styles.rowPressed : null,
                  ]}
                >
                  {option.icon ? (
                    <View style={styles.rowIcon}>{option.icon}</View>
                  ) : null}
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  <Text style={styles.check}>{selected ? "✓" : ""}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
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
    maxHeight: "70%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  headerAction: {
    color: colors.muted,
    fontSize: 15,
    minWidth: 64,
  },
  done: {
    color: colors.foreground,
    textAlign: "right",
    fontWeight: "600",
  },
  search: {
    marginHorizontal: 16,
    marginVertical: 10,
    color: colors.foreground,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    marginRight: 10,
  },
  rowLabel: {
    color: colors.foreground,
    fontSize: 15,
    flex: 1,
  },
  check: {
    color: colors.foreground,
    fontSize: 16,
    width: 24,
    textAlign: "right",
  },
});
