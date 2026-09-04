import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabStackHeaderBackButton } from "../lib/tab-stack-options";
import { colors, spacing } from "../lib/theme";
import { PillNav, type PillNavItem } from "./pill-nav";

type Props<T extends string> = {
  title: string;
  /** Optional glyph before the title (e.g. project octicon). */
  titleLeading?: ReactNode;
  tab: T;
  onTabChange: (next: T) => void;
  tabItems: readonly PillNavItem<T>[];
  tabsAccessibilityLabel: string;
  onBack: () => void;
  /** Pad split panes hide back — keep a spacer so the title stays centered. */
  showBack?: boolean;
  headerRight?: ReactNode;
  /** Loading shell — back only, no title or tabs. */
  minimal?: boolean;
};

/**
 * Detail chrome — name centered between back and trailing actions;
 * section tabs on the row below (visible on every tab).
 */
export function SectionedDetailHeader<T extends string>({
  title,
  titleLeading,
  tab,
  onTabChange,
  tabItems,
  tabsAccessibilityLabel,
  onBack,
  showBack = true,
  headerRight,
  minimal = false,
}: Props<T>) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: Math.max(insets.top, 8),
          backgroundColor: colors.background,
        },
      ]}
    >
      <View style={styles.topRow}>
        {showBack ? (
          <TabStackHeaderBackButton onPress={onBack} />
        ) : (
          <View style={styles.sideSpacer} />
        )}
        {minimal ? (
          <View style={styles.titleSlot} />
        ) : (
          <View style={styles.titleSlot} pointerEvents="none">
            {titleLeading}
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={styles.title}
            >
              {title.trim() || "Untitled"}
            </Text>
          </View>
        )}
        {headerRight ? (
          <View style={styles.rightActions}>{headerRight}</View>
        ) : (
          <View style={styles.sideSpacer} />
        )}
      </View>
      {!minimal ? (
        <View style={styles.tabsRow}>
          <PillNav
            accessibilityLabel={tabsAccessibilityLabel}
            value={tab}
            onChange={onTabChange}
            align="start"
            items={tabItems}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderBottomWidth: 0,
  },
  topRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 4,
  },
  titleSlot: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.02 * 17,
    textAlign: "center",
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 2,
  },
  sideSpacer: {
    width: 36,
    flexShrink: 0,
  },
  tabsRow: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 2,
    paddingBottom: 10,
  },
});
