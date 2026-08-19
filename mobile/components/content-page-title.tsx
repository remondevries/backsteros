import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "../lib/theme";

type Props = {
  title: string;
  /** Optional trailing control on the same row (rarely needed — prefer header actions). */
  trailing?: ReactNode;
  /** When the native header is hidden (e.g. Knowledge phone), pad for the status bar. */
  includeTopSafeArea?: boolean;
};

/**
 * In-content page title — left-aligned, scrolls with the page (not sticky header).
 */
export function ContentPageTitle({
  title,
  trailing,
  includeTopSafeArea = false,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.row,
        includeTopSafeArea ? { paddingTop: insets.top + 8 } : null,
      ]}
    >
      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: spacing.screenX,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.02 * 22,
    lineHeight: 28,
    textAlign: "left",
  },
});
