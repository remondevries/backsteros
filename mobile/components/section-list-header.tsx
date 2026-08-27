import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabStackHeaderPlusButton } from "../lib/tab-stack-options";
import { colors, spacing } from "../lib/theme";
import { CommandPaletteSearchButton } from "./command-palette/command-palette-search-button";

type Props = {
  title: string;
  /** Sits immediately after the title (e.g. ‹ › range stepper). */
  titleAccessory?: ReactNode;
  /** Primary action — glass “+”. Prefer `plusMenu` when the plus opens choices. */
  onPressPlus?: () => void;
  plusAccessibilityLabel?: string;
  /** Custom plus control (e.g. HeaderPlusMenuButton). */
  plusControl?: ReactNode;
  /** Extra controls beside the plus button (e.g. board toggle). */
  trailingControl?: ReactNode;
  /** Show global command palette search beside header actions. */
  showGlobalSearch?: boolean;
  /** Optional content under the title row (pills, etc.). */
  below?: ReactNode;
  /** When false, skip top safe-area inset (nested side panel). */
  includeTopSafeArea?: boolean;
  backgroundColor?: string;
};

/** List root header — title left, optional glass + on the right. */
export function SectionListHeader({
  title,
  titleAccessory,
  onPressPlus,
  plusAccessibilityLabel = "Add",
  plusControl,
  trailingControl,
  showGlobalSearch = false,
  below,
  includeTopSafeArea = true,
  backgroundColor = colors.background,
}: Props) {
  const insets = useSafeAreaInsets();
  const rightControl =
    plusControl ??
    (onPressPlus ? (
      <TabStackHeaderPlusButton
        onPress={onPressPlus}
        accessibilityLabel={plusAccessibilityLabel}
      />
    ) : null);

  return (
    <View
      style={{
        paddingTop: includeTopSafeArea ? insets.top + 8 : 10,
        backgroundColor,
      }}
    >
      <View
        style={{
          paddingHorizontal: spacing.screenX,
          paddingBottom: below ? 10 : 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              color: colors.foreground,
              fontWeight: "600",
              fontSize: 22,
            }}
          >
            {title}
          </Text>
          {titleAccessory}
        </View>
        {showGlobalSearch ? (
          <CommandPaletteSearchButton accessibilityLabel="Search" />
        ) : null}
        {rightControl}
        {trailingControl}
      </View>
      {below}
    </View>
  );
}
