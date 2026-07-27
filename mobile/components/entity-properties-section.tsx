import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "../lib/theme";

type Props = {
  title: string;
  children: ReactNode;
};

/**
 * Bordered properties card — parity with desktop `.entity-properties-section`.
 */
export function EntityPropertiesSection({ title, children }: Props) {
  return (
    <View style={styles.section} accessibilityLabel={title}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.chevron} accessibilityElementsHidden>
          ▾
        </Text>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  title: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 15,
  },
  chevron: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
  },
  body: {
    paddingHorizontal: 2,
  },
});
