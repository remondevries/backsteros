import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/theme";

type Props = {
  title: string;
  /** Right-aligned control next to the title (e.g. range pills). */
  trailing?: ReactNode;
  children: ReactNode;
};

/** Dashboard widget card on the pure-black canvas. */
export function FinanceCard({ title, trailing, children }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
