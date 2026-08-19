import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AGENT_SURFACE_TAB_BAR_CONTROL_SIZE,
  AGENT_SURFACE_TAB_BAR_HEIGHT,
  AGENT_SURFACE_TAB_BAR_PADDING_Y,
} from "../agent/surfaces/agent-surface-tab-bar";
import { ProjectsSidePanelIcon } from "../projects-side-panel-icon";
import {
  PAD_CONTENT_INSET,
} from "../../lib/pad-side-panel-collapse";
import { FLOATING_TAB_BAR_HEIGHT } from "../../lib/tab-bar-inset";
import { colors } from "../../lib/theme";

export const TASK_SURFACES_DETAIL_WIDTH = 360;
/** @deprecated Use TASK_SURFACES_DETAIL_WIDTH */
export const CODEBASE_TASK_DETAIL_WIDTH = TASK_SURFACES_DETAIL_WIDTH;
/** Matches desktop collapsed agent strip (~46px). */
export const TASK_SURFACES_COLLAPSED_RAIL_WIDTH = 46;
/** Narrow rail when the left task details column is collapsed (⇧[ parity). */
export const TASK_DETAIL_COLLAPSED_RAIL_WIDTH = 46;

type Props = {
  detail: ReactNode;
  /** Right pane — agent surfaces host (renders its own collapsed strip). */
  agent: ReactNode;
  /** When true, narrow the agent column to the vertical tab strip. */
  surfacesCollapsed?: boolean;
  /** When true, hide the left task card so chat can go full width. */
  detailCollapsed?: boolean;
  /** Expand the left task details from the collapsed rail. */
  onExpandDetail?: () => void;
};

/**
 * iPad task layout: floating detail card | chat/surfaces on the canvas
 * (mirrors desktop `desktop-task-layout`). Only the left task column gets the
 * surface card chrome; the agent pane stays transparent against the black
 * shell so it can float into the background.
 *
 * Detail card uses the same short bottom inset as `PadContentFrame` so it
 * runs slightly behind the floating tab pill. The agent column keeps a taller
 * bottom inset so the composer parks just above the nav.
 */
export function CodebaseTaskLayout({
  detail,
  agent,
  surfacesCollapsed = false,
  detailCollapsed = false,
  onExpandDetail,
}: Props) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, PAD_CONTENT_INSET);
  // Match other iPad content cards — only a small canvas inset under the card.
  const detailBottomInset = Math.max(insets.bottom, PAD_CONTENT_INSET);
  // Composer sits `PAD_CONTENT_INSET` above the flush iPad tab pill.
  const agentBottomInset = FLOATING_TAB_BAR_HEIGHT + PAD_CONTENT_INSET;

  if (detailCollapsed) {
    return (
      <View style={[styles.root, { paddingRight: PAD_CONTENT_INSET }]}>
        <View
          style={[styles.detailCollapsedRail, { paddingTop: topInset }]}
          accessibilityLabel="Task detail collapsed"
        >
          {/*
            Same band as AgentSurfaceTabBar so the expand icon lines up with
            Chat / Diff / hide controls in the agent pane.
          */}
          <View style={styles.detailCollapsedTabBand}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show task details"
              accessibilityState={{ expanded: false }}
              hitSlop={8}
              onPress={onExpandDetail}
              style={({ pressed }) => [
                styles.detailCollapsedToggle,
                pressed ? { opacity: 0.55 } : null,
              ]}
            >
              <ProjectsSidePanelIcon
                size={18}
                collapsed
                color={colors.foreground}
              />
            </Pressable>
          </View>
        </View>
        <View
          style={[
            styles.agent,
            { paddingTop: topInset, paddingBottom: agentBottomInset },
          ]}
          accessibilityLabel="Task surfaces"
        >
          {agent}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingRight: PAD_CONTENT_INSET }]}>
      <View
        style={[
          styles.detailSlot,
          {
            paddingTop: topInset,
            paddingLeft: PAD_CONTENT_INSET,
            paddingBottom: detailBottomInset,
          },
          surfacesCollapsed ? styles.detailSlotExpanded : null,
        ]}
        accessibilityLabel="Task detail"
      >
        <View
          style={[
            styles.detailCard,
            surfacesCollapsed ? styles.detailCardExpanded : null,
          ]}
        >
          {detail}
        </View>
      </View>
      <View
        style={[
          styles.agent,
          // Keep tabs clear of the status bar without boxing the pane in a card.
          { paddingTop: topInset, paddingBottom: agentBottomInset },
          surfacesCollapsed ? styles.agentCollapsed : null,
        ]}
        accessibilityLabel="Task surfaces"
      >
        {agent}
      </View>
    </View>
  );
}

/** Alias for non-codebase callers. */
export const TaskSurfacesLayout = CodebaseTaskLayout;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    backgroundColor: colors.background,
  },
  detailSlot: {
    width: TASK_SURFACES_DETAIL_WIDTH + PAD_CONTENT_INSET,
    flexShrink: 0,
    minHeight: 0,
  },
  detailSlotExpanded: {
    flex: 1,
    width: undefined,
  },
  detailCard: {
    flex: 1,
    minHeight: 0,
    width: TASK_SURFACES_DETAIL_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  detailCardExpanded: {
    width: "100%",
  },
  detailCollapsedRail: {
    width: TASK_DETAIL_COLLAPSED_RAIL_WIDTH,
    flexShrink: 0,
    alignItems: "center",
    minHeight: 0,
  },
  detailCollapsedTabBand: {
    height: AGENT_SURFACE_TAB_BAR_HEIGHT,
    paddingVertical: AGENT_SURFACE_TAB_BAR_PADDING_Y,
    alignItems: "center",
    justifyContent: "center",
  },
  detailCollapsedToggle: {
    width: AGENT_SURFACE_TAB_BAR_CONTROL_SIZE,
    height: AGENT_SURFACE_TAB_BAR_CONTROL_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  agent: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: "transparent",
  },
  agentCollapsed: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    width: TASK_SURFACES_COLLAPSED_RAIL_WIDTH,
    minWidth: TASK_SURFACES_COLLAPSED_RAIL_WIDTH,
  },
});
