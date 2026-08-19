import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";

import { colors } from "../../lib/theme";
import { TextInput, type TextInputRef } from "../app-text-input";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  value: string | null | undefined;
  /** When true (iPhone), collapse long text to one line until tapped. */
  collapseToOneLine?: boolean;
  /** Center text (phone habit header). */
  centered?: boolean;
  onChange?: (description: string | null) => void | Promise<void>;
};

/**
 * Habit description under the counts row.
 * iPhone: one-line preview with ellipsis; tap expands the rest.
 * iPad / always-expanded: full editable field like task descriptions.
 */
export function HabitDescriptionField({
  value,
  collapseToOneLine = false,
  centered = false,
  onChange,
}: Props) {
  const [draft, setDraft] = useState(value ?? "");
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<TextInputRef>(null);

  useEffect(() => {
    setDraft(value ?? "");
    setExpanded(false);
    setEditing(false);
  }, [value]);

  const trimmed = draft.trim();
  const hasText = trimmed.length > 0;
  const collapsed = collapseToOneLine && hasText && !expanded && !editing;

  const commit = useCallback(() => {
    if (!onChange) return;
    const next = draft.trim() || null;
    const current = value?.trim() || null;
    if (next === current) {
      setDraft(value ?? "");
      return;
    }
    void onChange(next);
  }, [draft, onChange, value]);

  const textAlignStyle = centered ? styles.centered : null;

  const expand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(true);
  }, []);

  if (collapsed) {
    return (
      <Pressable
        onPress={expand}
        accessibilityRole="button"
        accessibilityLabel="Show full habit description"
        style={styles.wrap}
      >
        <Text
          style={[styles.body, textAlignStyle]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {trimmed}
        </Text>
      </Pressable>
    );
  }

  if (!onChange) {
    if (!hasText) return null;
    return (
      <View style={styles.wrap}>
        <Text style={[styles.body, textAlignStyle]}>{trimmed}</Text>
      </View>
    );
  }

  // Expanded read-only preview until the user focuses the field to edit.
  if (collapseToOneLine && hasText && expanded && !editing) {
    return (
      <Pressable
        onPress={() => {
          setEditing(true);
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        }}
        accessibilityRole="button"
        accessibilityLabel="Edit habit description"
        style={styles.wrap}
      >
        <Text style={[styles.body, textAlignStyle]}>{trimmed}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        ref={inputRef}
        value={draft}
        onChangeText={setDraft}
        placeholder="Add a description…"
        placeholderTextColor={colors.muted}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        textAlign={centered ? "center" : "left"}
        accessibilityLabel="Habit description"
        onFocus={() => {
          if (collapseToOneLine) {
            LayoutAnimation.configureNext(
              LayoutAnimation.Presets.easeInEaseOut,
            );
            setExpanded(true);
          }
          setEditing(true);
        }}
        onBlur={() => {
          commit();
          setEditing(false);
          if (collapseToOneLine) {
            LayoutAnimation.configureNext(
              LayoutAnimation.Presets.easeInEaseOut,
            );
            setExpanded(false);
          }
        }}
        style={[styles.input, textAlignStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: 2,
  },
  body: {
    color: colors.foreground,
    opacity: 0.78,
    fontSize: 15,
    lineHeight: 22,
  },
  centered: {
    textAlign: "center",
  },
  input: {
    color: colors.foreground,
    opacity: 0.9,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 22,
  },
});
