import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "../lib/theme";

export type ProjectMetaField = {
  key: string;
  label: string;
  icon?: ReactNode;
  /** When false, field is display-only (e.g. progress). */
  editable?: boolean;
};

type Props = {
  properties: readonly ProjectMetaField[];
  areas: readonly ProjectMetaField[];
  onPressField: (key: string) => void;
};

/**
 * Project overview meta — desktop Properties / Areas rows (phone + iPad).
 * Same bordered chip card chrome on both layouts so Type and other fields
 * stay visible and tappable.
 */
export function ProjectOverviewMetaRows({
  properties,
  areas,
  onPressField,
}: Props) {
  return (
    <View style={styles.cardWrap} accessibilityLabel="Project metadata">
      <View style={styles.surface}>
        <MetaRow label="Properties">
          {properties.map((field) => (
            <MetaChip
              key={field.key}
              field={field}
              onPress={() => onPressField(field.key)}
            />
          ))}
        </MetaRow>
        {areas.length > 0 ? (
          <MetaRow label="Areas">
            {areas.map((field, index) => (
              <View key={field.key} style={styles.areaItem}>
                {index > 0 ? (
                  <Text style={styles.areaSep} accessibilityElementsHidden>
                    /
                  </Text>
                ) : null}
                <MetaChip
                  field={field}
                  onPress={() => onPressField(field.key)}
                />
              </View>
            ))}
          </MetaRow>
        ) : null}
      </View>
    </View>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.fields}>{children}</View>
    </View>
  );
}

function MetaChip({
  field,
  onPress,
}: {
  field: ProjectMetaField;
  onPress: () => void;
}) {
  const interactive = field.editable !== false;
  const content = (
    <>
      {field.icon ? <View style={styles.chipIcon}>{field.icon}</View> : null}
      <Text style={styles.chipLabel} numberOfLines={1}>
        {field.label}
      </Text>
    </>
  );

  if (!interactive) {
    return <View style={styles.chip}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${field.key}`}
      style={({ pressed }) => [
        styles.chip,
        pressed ? styles.chipPressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    width: "100%",
    paddingHorizontal: spacing.screenX,
    paddingTop: 20,
  },
  /** Match phone `DetailPropertiesInlineShell` card chrome. */
  surface: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  rowLabel: {
    width: 72,
    flexShrink: 0,
    paddingTop: 6,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 16,
  },
  fields: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  areaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  areaSep: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 2,
  },
  /** Desktop `.property-dropdown-trigger--inline-chip` parity. */
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.faint,
  },
  chipPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  chipIcon: {
    width: 14,
    alignItems: "center",
  },
  chipLabel: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
    flexShrink: 1,
  },
});
