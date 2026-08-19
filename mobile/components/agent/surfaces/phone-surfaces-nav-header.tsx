import { useMemo, useState } from "react";
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { listAgentSurfaceQuickOpenOptions } from "../../../lib/agent/agent-surface-quick-open";
import {
  TabStackHeaderBackButton,
  TabStackHeaderPlusButton,
} from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";
import { PhoneSurfaceHeaderTabs } from "./phone-surface-header-tabs";
import type { SurfaceTabsController } from "./task-agent-surfaces-host";

type Props = {
  onBack: () => void;
  controller: SurfaceTabsController | null;
};

/**
 * Full-width iPhone header while surfaces are open:
 * back → tabs centered → + add surface (menu below the plus).
 *
 * Menu is in-tree (not RN Modal) — this header lives inside FullWindowOverlay,
 * and nested Modals are unreliable there.
 */
export function PhoneSurfacesNavHeader({ onBack, controller }: Props) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const windowHeight = Dimensions.get("window").height;

  const tabs = controller?.state.tabs ?? [];
  const menuItems = useMemo(() => {
    if (!controller) return [];
    const hasChatTab = tabs.some((tab) => tab.kind === "chat");
    return listAgentSurfaceQuickOpenOptions({
      isCodebaseProject: controller.isCodebaseProject,
      diffAvailable: controller.diffAvailable,
    })
      .filter((option) => !(option.kind === "chat" && hasChatTab))
      .map((option) => {
        const available = option.needsCwd ? controller.cwdAvailable : true;
        return { ...option, available };
      });
  }, [controller, tabs]);

  const menuTop = insets.top + 44 + 6;
  const addDisabled = !controller || menuItems.length === 0;

  return (
    <View
      style={[styles.root, { paddingTop: insets.top }]}
      accessibilityRole="header"
    >
      <View style={styles.row}>
        <View style={styles.side}>
          <TabStackHeaderBackButton
            accessibilityLabel="Back to task"
            onPress={onBack}
          />
        </View>

        <View style={styles.center} pointerEvents="box-none">
          {controller ? (
            <PhoneSurfaceHeaderTabs
              tabs={controller.state.tabs}
              activeId={controller.state.activeId}
              onActivate={controller.activate}
              onClose={controller.close}
            />
          ) : null}
        </View>

        <View style={styles.side}>
          <TabStackHeaderPlusButton
            accessibilityLabel="Add surface"
            chrome="plain"
            disabled={addDisabled}
            onPress={() => setMenuOpen(true)}
          />
        </View>
      </View>

      {menuOpen ? (
        <>
          <Pressable
            style={[styles.dismiss, { height: windowHeight }]}
            onPress={() => setMenuOpen(false)}
            accessibilityLabel="Dismiss menu"
          />
          <View style={[styles.menu, { top: menuTop }]} accessibilityRole="menu">
            {menuItems.map((item) => (
              <Pressable
                key={item.kind}
                disabled={!item.available}
                accessibilityRole="menuitem"
                onPress={() => {
                  setMenuOpen(false);
                  if (!item.available || !controller) return;
                  controller.add(item.kind);
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
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    zIndex: 30,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  side: {
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  dismiss: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
  },
  menu: {
    position: "absolute",
    right: 8,
    minWidth: 168,
    zIndex: 50,
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
