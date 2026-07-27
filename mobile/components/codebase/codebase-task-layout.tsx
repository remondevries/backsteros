import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { colors } from "../../lib/theme";

export const CODEBASE_TASK_DETAIL_WIDTH = 360;

type Props = {
  detail: ReactNode;
  agent: ReactNode;
};

/**
 * iPad codebase task layout: narrow stacked detail | agent Chat/Terminal
 * (mirrors desktop `desktop-codebase-task-layout`).
 * Sits under the native stack header (back + task id).
 */
export function CodebaseTaskLayout({ detail, agent }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.detail} accessibilityLabel="Task detail">
        {detail}
      </View>
      <View style={styles.agent} accessibilityLabel="Task agent">
        {agent}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    backgroundColor: colors.background,
  },
  detail: {
    width: CODEBASE_TASK_DETAIL_WIDTH,
    flexShrink: 0,
    minHeight: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  agent: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
});
