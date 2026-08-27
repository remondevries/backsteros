import type { ReactNode } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../lib/theme";
import { ChevronRightIcon } from "./chevron-right-icon";
import { MoreHorizontalIcon } from "./more-horizontal-icon";
import { PlusIcon } from "./plus-icon";

type Props = {
  title: string;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Optional + on the right — desktop `.project-type-subgroup__add` */
  onAdd?: () => void;
  addActionLabel?: string;
  /** Nested custom area — rename via ⋯ menu. */
  onRename?: () => void;
  /** Nested custom area — delete via ⋯ menu. */
  onDelete?: () => void;
  /** Optional trailing control when `onAdd` / area menu are not enough. */
  trailing?: ReactNode;
  /**
   * Extra top gap when headers are not sticky. Keep false for sticky headers.
   */
  spaced?: boolean;
};

/**
 * Nested type / attention group header — chevron, label, and hairline rule.
 * Desktop parity: `.project-type-subgroup__header` (also used for Inbox groups).
 */
export function ProjectTypeGroupHeader({
  title,
  collapsed = false,
  onToggle,
  onAdd,
  addActionLabel = "item",
  onRename,
  onDelete,
  trailing,
  spaced = false,
}: Props) {
  const showAreaMenu = Boolean(onRename || onDelete);

  function openAreaMenu() {
    const buttons: Array<{
      text: string;
      style?: "cancel" | "destructive" | "default";
      onPress?: () => void;
    }> = [];
    if (onRename) {
      buttons.push({ text: "Rename", onPress: onRename });
    }
    if (onDelete) {
      buttons.push({
        text: "Delete",
        style: "destructive",
        onPress: onDelete,
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert(title, undefined, buttons);
  }

  const mainContent = (
    <>
      <View
        style={[
          styles.toggle,
          { transform: [{ rotate: collapsed ? "0deg" : "90deg" }] },
        ]}
        accessibilityElementsHidden
      >
        <ChevronRightIcon size={12} color="rgba(255, 255, 255, 0.4)" />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.rule} accessibilityElementsHidden />
    </>
  );

  const addControl = onAdd ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${addActionLabel} to ${title}`}
      hitSlop={8}
      onPress={onAdd}
      style={({ pressed }) => [
        styles.addButton,
        pressed ? styles.addButtonPressed : null,
      ]}
    >
      <PlusIcon size={12} color={colors.muted} />
    </Pressable>
  ) : showAreaMenu ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Area actions for ${title}`}
      hitSlop={8}
      onPress={openAreaMenu}
      style={({ pressed }) => [
        styles.addButton,
        pressed ? styles.addButtonPressed : null,
      ]}
    >
      <MoreHorizontalIcon size={14} color={colors.muted} />
    </Pressable>
  ) : (
    trailing
  );

  return (
    <View style={[styles.row, spaced ? styles.rowSpaced : null]}>
      {onToggle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={`${title}, ${collapsed ? "collapsed" : "expanded"}`}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.main,
            pressed ? styles.mainPressed : null,
          ]}
        >
          {mainContent}
        </Pressable>
      ) : (
        <View style={styles.main}>{mainContent}</View>
      )}
      {addControl}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    // Transparent so left lists (black) and iPad content cards (surface) show through.
    backgroundColor: "transparent",
  },
  rowSpaced: {
    marginTop: 10,
  },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  mainPressed: {
    opacity: 0.72,
  },
  toggle: {
    width: 14,
    height: 14,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flexShrink: 0,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  rule: {
    flex: 1,
    minWidth: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  addButton: {
    width: 24,
    height: 24,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  addButtonPressed: {
    opacity: 0.7,
  },
});
