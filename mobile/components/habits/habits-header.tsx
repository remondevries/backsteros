import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PadSidePanelCollapseButton } from "../../lib/pad-side-panel-collapse";
import {
  TabStackHeader,
  TabStackHeaderBackButton,
  TabStackHeaderPlusButton,
} from "../../lib/tab-stack-options";
import { colors, spacing } from "../../lib/theme";
import { YearNavigator } from "../finance/year-navigator";

export function HabitsHeaderPlus({
  onPress,
  chrome = "plain",
  disabled = false,
}: {
  onPress?: () => void;
  chrome?: "glass" | "plain";
  disabled?: boolean;
}) {
  return (
    <TabStackHeaderPlusButton
      chrome={chrome}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel="Add habit"
    />
  );
}

/** Phone stack header / iPad list-pane header — plus top-right like Inbox. */
export function HabitsHeader({
  onAdd,
  onToggleCollapse,
  includeSafeArea = true,
  backgroundColor,
}: {
  onAdd?: () => void;
  onToggleCollapse?: () => void;
  includeSafeArea?: boolean;
  backgroundColor?: string;
} = {}) {
  return (
    <TabStackHeader
      title="Habit Tracker"
      includeSafeArea={includeSafeArea}
      backgroundColor={backgroundColor}
      leadingActions={
        onAdd ? (
          <HabitsHeaderPlus chrome="glass" onPress={onAdd} />
        ) : null
      }
      trailingActions={
        onToggleCollapse ? (
          <PadSidePanelCollapseButton
            onCollapse={onToggleCollapse}
            accessibilityLabel="Hide Habit Tracker list"
          />
        ) : null
      }
    />
  );
}

/**
 * Phone habit detail chrome — back | sort (center) | year.
 * Custom `header` so trailing controls are not wrapped in liquid-glass.
 */
export function HabitDetailNavHeader({
  year,
  maxYear,
  onYearChange,
  onBack,
  sortControl,
}: {
  year: number;
  maxYear: number;
  onYearChange: (year: number) => void;
  onBack: () => void;
  /** Centered sort control (chip). */
  sortControl?: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.detailNav,
        {
          paddingTop: insets.top,
          backgroundColor: colors.background,
        },
      ]}
    >
      <View style={styles.detailNavRow}>
        <View style={styles.detailNavSide}>
          <TabStackHeaderBackButton onPress={onBack} />
        </View>
        {sortControl ? (
          <View style={styles.detailNavCenter} pointerEvents="box-none">
            {sortControl}
          </View>
        ) : null}
        <View style={[styles.detailNavSide, styles.detailNavSideEnd]}>
          <YearNavigator
            year={year}
            onChange={onYearChange}
            maxYear={maxYear}
            chrome="plain"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  detailNav: {
    borderBottomWidth: 0,
  },
  detailNavRow: {
    height: 44,
    paddingHorizontal: spacing.screenX,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailNavSide: {
    zIndex: 1,
    minWidth: 72,
    flexDirection: "row",
    alignItems: "center",
  },
  detailNavSideEnd: {
    justifyContent: "flex-end",
  },
  detailNavCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
