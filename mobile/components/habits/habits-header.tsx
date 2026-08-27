import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PadSidePanelCollapseButton } from "../../lib/pad-side-panel-collapse";
import {
  HEADER_ACTION_SIZE,
  TabStackHeaderBackButton,
  TabStackHeaderIconButton,
  TabStackHeaderPlusButton,
} from "../../lib/tab-stack-options";
import { colors } from "../../lib/theme";
import { FilterIcon } from "../filter-icon";
import { ProjectOcticon } from "../project-octicon";
import { SectionListHeader } from "../section-list-header";
import { HabitYearFilterMenu } from "./habit-year-filter-menu";

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
    <SectionListHeader
      title="Habit Tracker"
      showGlobalSearch
      includeTopSafeArea={includeSafeArea}
      backgroundColor={backgroundColor}
      plusControl={
        onAdd ? (
          <HabitsHeaderPlus chrome="glass" onPress={onAdd} />
        ) : null
      }
      trailingControl={
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
 * Phone habit detail chrome — back | icon + name | year filter (same 36×36 as back).
 */
export function HabitDetailNavHeader({
  onBack,
  title,
  icon,
  year,
  maxYear,
  onYearChange,
}: {
  onBack: () => void;
  title?: string;
  icon?: string | null;
  year?: number;
  maxYear?: number;
  onYearChange?: (year: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const displayTitle = (title ?? "").trim() || "Habit";
  const showTitle = title != null;
  const showIcon = showTitle && title !== "All";
  const canFilterYear = year != null && onYearChange != null;
  const yearCap = maxYear ?? (year ?? new Date().getFullYear());

  return (
    <View
      style={[
        styles.detailNav,
        {
          paddingTop: Math.max(insets.top, 8),
          backgroundColor: colors.background,
        },
      ]}
    >
      <View style={styles.detailNavRow}>
        <TabStackHeaderBackButton onPress={onBack} />
        {showTitle ? (
          <View style={styles.detailNavTitle} pointerEvents="none">
            {showIcon ? (
              <ProjectOcticon
                icon={icon}
                size={14}
                color={colors.foreground}
              />
            ) : null}
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={styles.detailNavTitleText}
            >
              {displayTitle}
            </Text>
          </View>
        ) : (
          <View style={styles.detailNavTitle} />
        )}
        {canFilterYear ? (
          <TabStackHeaderIconButton
            chrome="plain"
            accessibilityLabel={`Filter year, ${year}`}
            onPress={() => setYearMenuOpen((open) => !open)}
          >
            <FilterIcon color={colors.foreground} size={20} />
          </TabStackHeaderIconButton>
        ) : (
          <View style={styles.detailNavRightSpacer} />
        )}
      </View>
      {canFilterYear ? (
        <HabitYearFilterMenu
          visible={yearMenuOpen}
          year={year}
          maxYear={yearCap}
          onSelect={onYearChange}
          onClose={() => setYearMenuOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  detailNav: {
    borderBottomWidth: 0,
  },
  detailNavRow: {
    minHeight: 44,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailNavTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  detailNavTitleText: {
    flexShrink: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.34,
    textAlign: "center",
  },
  detailNavRightSpacer: {
    width: HEADER_ACTION_SIZE,
    flexShrink: 0,
  },
});
