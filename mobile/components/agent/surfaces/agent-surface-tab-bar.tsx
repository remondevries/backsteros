import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { listAgentSurfaceQuickOpenOptions } from "../../../lib/agent/agent-surface-quick-open";
import type {
  AgentSurfaceTab,
  AgentSurfaceTabKind,
} from "../../../lib/agent/agent-surface-tabs";
import { colors } from "../../../lib/theme";
import { ProjectsSidePanelIcon } from "../../projects-side-panel-icon";

/** Vertical padding around the 32px tab controls. */
export const AGENT_SURFACE_TAB_BAR_PADDING_Y = 6;
/** Hit target for hide / add controls in the agent tab strip. */
export const AGENT_SURFACE_TAB_BAR_CONTROL_SIZE = 32;
/** Full strip height — keep collapsed detail toggle in this band. */
export const AGENT_SURFACE_TAB_BAR_HEIGHT =
  AGENT_SURFACE_TAB_BAR_PADDING_Y * 2 + AGENT_SURFACE_TAB_BAR_CONTROL_SIZE;

type Props = {
  tabs: AgentSurfaceTab[];
  activeId: string | null;
  cwdAvailable?: boolean;
  isCodebaseProject?: boolean;
  diffAvailable?: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onAddSurface: (kind: AgentSurfaceTabKind) => void;
  /** Desktop-parity hide control for the right surfaces pane. */
  onHide?: () => void;
};

/**
 * Compact tab strip + “+” menu for open agent surfaces (desktop tab bar parity).
 * Always shows when `onHide` is set so the panel toggle stays available
 * even on the empty picker.
 */
export function AgentSurfaceTabBar({
  tabs,
  activeId,
  cwdAvailable = true,
  isCodebaseProject = false,
  diffAvailable = false,
  onActivate,
  onClose,
  onAddSurface,
  onHide,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems = useMemo(() => {
    const hasChatTab = tabs.some((tab) => tab.kind === "chat");
    return listAgentSurfaceQuickOpenOptions({
      isCodebaseProject,
      diffAvailable,
    })
      .filter((option) => !(option.kind === "chat" && hasChatTab))
      .map((option) => {
        const available = option.needsCwd ? cwdAvailable : true;
        return { ...option, available };
      });
  }, [cwdAvailable, diffAvailable, isCodebaseProject, tabs]);

  if (tabs.length === 0 && !onHide) return null;

  return (
    <View style={styles.bar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={styles.tabsScroll}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <View
              key={tab.id}
              style={[styles.tab, active ? styles.tabActive : null]}
            >
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => onActivate(tab.id)}
                style={styles.tabHit}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    active ? styles.tabLabelActive : null,
                  ]}
                  numberOfLines={1}
                >
                  {tab.title}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close ${tab.title}`}
                hitSlop={8}
                onPress={() => onClose(tab.id)}
                style={({ pressed }) => [
                  styles.closeHit,
                  pressed ? { opacity: 0.55 } : null,
                ]}
              >
                <Text style={styles.closeGlyph}>✕</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {tabs.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add surface"
          hitSlop={8}
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [
            styles.addHit,
            pressed ? { opacity: 0.55 } : null,
          ]}
        >
          <Text style={styles.addGlyph}>+</Text>
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}

      {onHide ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide surfaces"
          hitSlop={8}
          onPress={onHide}
          style={({ pressed }) => [
            styles.hideHit,
            pressed ? { opacity: 0.55 } : null,
          ]}
        >
          <ProjectsSidePanelIcon
            size={18}
            rail="end"
            collapsed={false}
            color={colors.foreground}
          />
        </Pressable>
      ) : null}

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.scrim}
          onPress={() => setMenuOpen(false)}
          accessibilityLabel="Dismiss menu"
        >
          <View style={styles.menu}>
            {menuItems.map((item) => (
              <Pressable
                key={item.kind}
                disabled={!item.available}
                accessibilityRole="button"
                onPress={() => {
                  setMenuOpen(false);
                  if (!item.available) return;
                  onAddSurface(item.kind);
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed ? styles.menuItemPressed : null,
                  !item.available ? { opacity: 0.4 } : null,
                ]}
              >
                <Text style={styles.menuItemLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: AGENT_SURFACE_TAB_BAR_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: AGENT_SURFACE_TAB_BAR_PADDING_Y,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabsScroll: {
    flex: 1,
    minWidth: 0,
  },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 4,
  },
  spacer: {
    flex: 1,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 140,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  tabActive: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  tabHit: {
    flexShrink: 1,
    paddingLeft: 10,
    paddingVertical: 7,
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: colors.foreground,
  },
  closeHit: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  closeGlyph: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  addHit: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  addGlyph: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "500",
    lineHeight: 20,
  },
  hideHit: {
    width: AGENT_SURFACE_TAB_BAR_CONTROL_SIZE,
    height: AGENT_SURFACE_TAB_BAR_CONTROL_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 56,
    paddingRight: 16,
  },
  menu: {
    minWidth: 168,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    paddingVertical: 4,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  menuItemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  menuItemLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
});
