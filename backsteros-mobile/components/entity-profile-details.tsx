import { useRouter, type Href } from "expo-router";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";

import { colors, spacing } from "../lib/theme";
import { ChevronRightIcon } from "./chevron-right-icon";

export type ProfileDetailField = {
  key: string;
  label: string;
  value: string;
  empty?: boolean;
  icon?: ReactNode;
  onPress?: () => void;
  navigateHref?: string | null;
  navigateLabel?: string;
  /** When set with editing, renders an inline text field. */
  onChangeText?: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
};

type Props = {
  fields: readonly ProfileDetailField[];
  /** Section heading — omit to hide (org/contact profile cards). */
  title?: string | null;
  editing?: boolean;
};

/**
 * Profile-style detail fields — label above value, full-width rows.
 * Used on contact / organization overview instead of property chips.
 */
export function EntityProfileDetails({
  fields,
  title = null,
  editing = false,
}: Props) {
  const router = useRouter();
  const visible = editing
    ? fields
    : fields.filter((field) => !field.empty || field.onPress);

  if (visible.length === 0) {
    return (
      <View style={styles.section}>
        {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
        <Text style={styles.empty}>No details yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.card}>
        {visible.map((field, index) => {
          const navigateHref =
            !editing && field.navigateHref?.trim()
              ? field.navigateHref.trim()
              : null;
          const valueColor = field.empty ? colors.muted : colors.foreground;
          const canEditInline = editing && Boolean(field.onChangeText);
          const canPress =
            Boolean(field.onPress) && (!editing || !canEditInline);

          const body = (
            <>
              <Text style={styles.label}>{field.label}</Text>
              {canEditInline ? (
                <TextInput
                  value={field.value}
                  onChangeText={field.onChangeText}
                  placeholder={field.placeholder ?? field.label}
                  placeholderTextColor={colors.muted}
                  multiline={field.multiline}
                  keyboardType={field.keyboardType}
                  autoCapitalize={field.autoCapitalize}
                  style={[
                    styles.valueInput,
                    field.multiline ? styles.valueInputMultiline : null,
                  ]}
                />
              ) : (
                <View style={styles.valueRow}>
                  {field.icon}
                  <Text
                    style={[styles.value, { color: valueColor }]}
                    numberOfLines={field.multiline ? 6 : 3}
                  >
                    {field.value}
                  </Text>
                </View>
              )}
            </>
          );

          return (
            <View
              key={field.key}
              style={[
                styles.row,
                index < visible.length - 1 ? styles.rowBorder : null,
              ]}
            >
              {canPress ? (
                <Pressable
                  onPress={field.onPress}
                  style={({ pressed }) => [
                    styles.rowMain,
                    pressed ? styles.rowPressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${field.label}`}
                >
                  {body}
                </Pressable>
              ) : (
                <View style={styles.rowMain}>{body}</View>
              )}
              {navigateHref ? (
                <Pressable
                  onPress={() => router.push(navigateHref as Href)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={
                    field.navigateLabel ?? `Open ${field.label}`
                  }
                  style={({ pressed }) => [
                    styles.navigateHit,
                    pressed ? { opacity: 0.55 } : null,
                  ]}
                >
                  <ChevronRightIcon size={14} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.screenX,
    gap: 10,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  rowPressed: {
    backgroundColor: colors.rowPressed,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  value: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 21,
  },
  valueInput: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 21,
    padding: 0,
    margin: 0,
  },
  valueInputMultiline: {
    minHeight: 44,
    textAlignVertical: "top",
  },
  navigateHit: {
    width: 40,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    paddingVertical: 8,
  },
});
