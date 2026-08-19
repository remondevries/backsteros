import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { listAgentSurfaceQuickOpenOptions } from "../../../lib/agent/agent-surface-quick-open";
import type {
  AgentSurfaceTab,
  AgentSurfaceTabKind,
} from "../../../lib/agent/agent-surface-tabs";
import { colors } from "../../../lib/theme";
import { ProjectsSidePanelIcon } from "../../projects-side-panel-icon";

type Props = {
  tabs: AgentSurfaceTab[];
  activeId: string | null;
  isCodebaseProject?: boolean;
  diffAvailable?: boolean;
  cwdAvailable?: boolean;
  chatAvailable?: boolean;
  onActivateTab: (id: string) => void;
  onOpenKind: (kind: AgentSurfaceTabKind) => void;
  onExpand: () => void;
};

/**
 * iPad collapsed agent strip — desktop parity: expand control + vertical tab
 * chips for open surfaces (or dashed ghosts when empty).
 */
export function AgentSurfaceCollapsedStrip({
  tabs,
  activeId,
  isCodebaseProject = false,
  diffAvailable = false,
  cwdAvailable = true,
  chatAvailable = true,
  onActivateTab,
  onOpenKind,
  onExpand,
}: Props) {
  const hasOpenTabs = tabs.length > 0;
  const ghostOptions = listAgentSurfaceQuickOpenOptions({
    isCodebaseProject,
    diffAvailable,
  }).filter((option) => {
    if (option.kind === "chat") return chatAvailable;
    if (option.needsCwd) return cwdAvailable;
    return true;
  });

  return (
    <View
      style={styles.root}
      accessibilityLabel="Collapsed agent surfaces"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show surfaces"
        hitSlop={8}
        onPress={onExpand}
        style={({ pressed }) => [
          styles.expandHit,
          pressed ? { opacity: 0.55 } : null,
        ]}
      >
        <ProjectsSidePanelIcon
          size={16}
          collapsed
          rail="end"
          color={colors.foreground}
        />
      </Pressable>

      <ScrollView
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
        showsVerticalScrollIndicator={false}
      >
        {hasOpenTabs
          ? tabs.map((tab) => {
              const active = tab.id === activeId;
              return (
                <Pressable
                  key={tab.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show ${tab.title}`}
                  onPress={() => {
                    onExpand();
                    onActivateTab(tab.id);
                  }}
                  style={({ pressed }) => [
                    styles.tab,
                    active ? styles.tabActive : null,
                    pressed ? { opacity: 0.75 } : null,
                  ]}
                >
                  <View style={styles.tabRotate}>
                    <Text style={styles.tabLabel} numberOfLines={1}>
                      {tab.title}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          : ghostOptions.map((option) => (
              <Pressable
                key={option.kind}
                accessibilityRole="button"
                accessibilityLabel={`Open ${option.label}`}
                onPress={() => {
                  onExpand();
                  onOpenKind(option.kind);
                }}
                style={({ pressed }) => [
                  styles.tab,
                  styles.tabGhost,
                  pressed ? { opacity: 0.75 } : null,
                ]}
              >
                <View style={styles.tabRotate}>
                  <Text style={styles.tabLabelGhost} numberOfLines={1}>
                    {option.label}
                  </Text>
                </View>
              </Pressable>
            ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 8,
    gap: 4,
  },
  expandHit: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  tabsScroll: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  tabs: {
    alignItems: "center",
    gap: 4,
    paddingBottom: 8,
  },
  tab: {
    width: 28,
    height: 88,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  tabActive: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  tabGhost: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  tabRotate: {
    width: 80,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "90deg" }],
  },
  tabLabel: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: "600",
  },
  tabLabelGhost: {
    color: "rgba(255, 255, 255, 0.38)",
    fontSize: 12,
    fontWeight: "600",
  },
});
