import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { AgentSurfaceTab } from "../../../lib/agent/agent-surface-tabs";
import { colors } from "../../../lib/theme";

type Props = {
  tabs: AgentSurfaceTab[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
};

/**
 * Centered tab strip for the iPhone surfaces nav header.
 * Add (+) lives on the trailing edge of {@link PhoneSurfacesNavHeader}.
 */
export function PhoneSurfaceHeaderTabs({
  tabs,
  activeId,
  onActivate,
  onClose,
}: Props) {
  if (tabs.length === 0) return null;

  const maxWidth = Math.min(Dimensions.get("window").width - 96, 280);

  return (
    <View
      style={[styles.root, { maxWidth }]}
      accessibilityRole="tablist"
    >
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
                hitSlop={6}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  tabsScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 110,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  tabActive: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  tabHit: {
    flexShrink: 1,
    paddingLeft: 8,
    paddingVertical: 5,
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: colors.foreground,
  },
  closeHit: {
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  closeGlyph: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
  },
});
