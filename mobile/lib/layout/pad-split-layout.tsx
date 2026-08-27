import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import {
  PadContentFrame,
  PadSidePanelCollapsedRail,
  usePadSidePanelCollapsed,
} from "../pad-side-panel-collapse";
import { colors } from "../theme";
import { isPadDevice } from "../device";

export type PadSplitLayoutProps = {
  panelKey: string;
  listPaneWidth: number;
  listHeader: ReactNode | ((api: { onToggleCollapse: () => void }) => ReactNode);
  listBody: ReactNode;
  children: ReactNode;
  /** When false, detail stack is full-bleed (inbox task canvas). Default: framed. */
  frameDetail?: boolean;
  expandAccessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Shared iPad master-detail shell: collapsible list column + detail stack.
 */
export function PadSplitLayout({
  panelKey,
  listPaneWidth,
  listHeader,
  listBody,
  children,
  frameDetail = true,
  expandAccessibilityLabel,
  style,
}: PadSplitLayoutProps) {
  const { collapsed, setCollapsed } = usePadSidePanelCollapsed(panelKey);

  const headerNode =
    typeof listHeader === "function"
      ? listHeader({ onToggleCollapse: () => setCollapsed(true) })
      : listHeader;

  if (!isPadDevice()) {
    return <>{children}</>;
  }

  const detail = frameDetail ? (
    <PadContentFrame>{children}</PadContentFrame>
  ) : (
    <View style={styles.canvas}>{children}</View>
  );

  return (
    <View style={[styles.split, style]}>
      {collapsed ? (
        <PadSidePanelCollapsedRail
          onExpand={() => setCollapsed(false)}
          accessibilityLabel={expandAccessibilityLabel}
        />
      ) : (
        <View style={[styles.listPane, { width: listPaneWidth }]}>
          {headerNode}
          <View style={styles.listBody}>{listBody}</View>
        </View>
      )}
      {detail}
    </View>
  );
}

const styles = StyleSheet.create({
  split: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    backgroundColor: colors.background,
  },
  listPane: {
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  listBody: {
    flex: 1,
    minHeight: 0,
  },
  canvas: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: colors.background,
  },
});
