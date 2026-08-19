import { useCallback, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProjectsSidePanelIcon } from "../components/projects-side-panel-icon";
import { colors } from "./theme";

export const PAD_SIDE_PANEL_RAIL_WIDTH = 52;
/** Inset around the floating content card on iPad. */
export const PAD_CONTENT_INSET = 10;

const collapsedByPanel = new Map<string, boolean>();

/** Persist side-panel collapse for the current app session (iPad). */
export function usePadSidePanelCollapsed(panelId: string) {
  const [collapsed, setCollapsedState] = useState(
    () => collapsedByPanel.get(panelId) ?? false,
  );

  const setCollapsed = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setCollapsedState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        collapsedByPanel.set(panelId, value);
        return value;
      });
    },
    [panelId],
  );

  const toggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, [setCollapsed]);

  return { collapsed, setCollapsed, toggle };
}

/** Header control that collapses an expanded iPad side panel. */
export function PadSidePanelCollapseButton({
  onCollapse,
  accessibilityLabel = "Hide side panel",
}: {
  onCollapse: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: true }}
      hitSlop={8}
      onPress={onCollapse}
      style={({ pressed }) => [
        styles.toggle,
        pressed ? { opacity: 0.55 } : null,
      ]}
    >
      <ProjectsSidePanelIcon size={18} color={colors.foreground} />
    </Pressable>
  );
}

/** Compact rail when the left side panel is collapsed (sits on the black canvas). */
export function PadSidePanelCollapsedRail({
  onExpand,
  accessibilityLabel = "Show side panel",
}: {
  onExpand: () => void;
  accessibilityLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.rail, { paddingTop: insets.top + 10 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: false }}
        hitSlop={8}
        onPress={onExpand}
        style={({ pressed }) => [
          styles.toggle,
          pressed ? { opacity: 0.55 } : null,
        ]}
      >
        <ProjectsSidePanelIcon size={18} collapsed color={colors.foreground} />
      </Pressable>
    </View>
  );
}

type ContentFrameProps = {
  children: ReactNode;
};

/**
 * Floating iPad content pane — same surface / border / radius as the
 * properties card (`DetailPropertiesInlineShell`), inset from the canvas.
 */
export function PadContentFrame({ children }: ContentFrameProps) {
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, PAD_CONTENT_INSET);
  const bottom = Math.max(insets.bottom, PAD_CONTENT_INSET);

  return (
    <View
      style={[
        styles.contentColumn,
        {
          paddingTop: top,
          paddingBottom: bottom,
          paddingRight: PAD_CONTENT_INSET,
          paddingLeft: PAD_CONTENT_INSET,
        },
      ]}
    >
      <View style={styles.contentCard}>{children}</View>
    </View>
  );
}

type SidePanelFrameProps = {
  children: ReactNode;
  /** Inner card width (slot adds left inset). Default 256. */
  width?: number;
};

/**
 * Carded iPad side list — mirrors task detail chrome (`CodebaseTaskLayout`
 * left column): rounded surface on the black canvas. Pair with a plain
 * canvas column for floating content (no content card).
 */
export function PadSidePanelFrame({
  children,
  width = 256,
}: SidePanelFrameProps) {
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, PAD_CONTENT_INSET);
  const bottom = Math.max(insets.bottom, PAD_CONTENT_INSET);

  return (
    <View
      style={[
        styles.sidePanelSlot,
        {
          width: width + PAD_CONTENT_INSET,
          paddingTop: top,
          paddingBottom: bottom,
          paddingLeft: PAD_CONTENT_INSET,
        },
      ]}
    >
      <View style={[styles.sidePanelCard, { width }]}>{children}</View>
    </View>
  );
}

/**
 * Right-hand iPad column without a surface card — content floats on the
 * black canvas (task overview / agent pane pattern).
 */
export function PadContentCanvas({ children }: ContentFrameProps) {
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, PAD_CONTENT_INSET);
  const bottom = Math.max(insets.bottom, PAD_CONTENT_INSET);

  return (
    <View
      style={[
        styles.contentColumn,
        {
          paddingTop: top,
          paddingBottom: bottom,
          paddingRight: PAD_CONTENT_INSET,
          paddingLeft: PAD_CONTENT_INSET,
          backgroundColor: colors.background,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: PAD_SIDE_PANEL_RAIL_WIDTH,
    flexShrink: 0,
    alignItems: "center",
    backgroundColor: colors.background,
    minHeight: 0,
  },
  toggle: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  contentColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  contentCard: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  sidePanelSlot: {
    flexShrink: 0,
    minHeight: 0,
  },
  sidePanelCard: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
});
