import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabStackHeaderPlusButton } from "../lib/tab-stack-options";
import { colors, spacing } from "../lib/theme";

type Props = {
  title: string;
  /** Primary action — glass “+”. Prefer `plusMenu` when the plus opens choices. */
  onPressPlus?: () => void;
  plusAccessibilityLabel?: string;
  /** Custom plus control (e.g. HeaderPlusMenuButton). */
  plusControl?: ReactNode;
  /** Optional content under the title row (pills, etc.). */
  below?: ReactNode;
};

/** List root header — title left, optional glass + on the right. */
export function SectionListHeader({
  title,
  onPressPlus,
  plusAccessibilityLabel = "Add",
  plusControl,
  below,
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
        paddingTop: insets.top + 8,
        backgroundColor: colors.background,
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
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            color: colors.foreground,
            fontWeight: "600",
            fontSize: 22,
          }}
        >
          {title}
        </Text>
        {rightControl}
      </View>
      {below}
    </View>
  );
}
