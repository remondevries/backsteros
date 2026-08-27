import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/theme";

export function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {description ? (
        <Text style={styles.cardDescription}>{description}</Text>
      ) : null}
      {children}
    </View>
  );
}

export function SettingsFieldRow({
  label,
  value,
  onPress,
  muted,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  muted?: boolean;
}) {
  const content = (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        style={[styles.fieldValue, muted ? styles.fieldValueMuted : null]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        pressed ? { backgroundColor: colors.rowPressed } : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
  cardDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 14,
    width: 100,
  },
  fieldValue: {
    flex: 1,
    color: colors.foreground,
    fontSize: 14,
    textAlign: "right",
  },
  fieldValueMuted: {
    color: colors.muted,
  },
});
