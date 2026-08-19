import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from "react-native";

import { MoreHorizontalIcon } from "../components/more-horizontal-icon";
import { ProjectsSidePanelIcon } from "../components/projects-side-panel-icon";
import { colors } from "./theme";

export type PadDetailChromeMenuItem = {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

type Props = {
  /** Collapse / hide the right detail panel (desktop `rail="end"` toggle). */
  onCollapse: () => void;
  collapseAccessibilityLabel?: string;
  menuItems?: readonly PadDetailChromeMenuItem[];
  menuAriaLabel?: string;
  /**
   * Render the ⋯ dropdown as an in-tree overlay (required inside
   * FullWindowOverlay / parent Modal — nested RN Modals are unreliable).
   */
  embedded?: boolean;
};

/**
 * Desktop-parity trailing chrome for iPad detail slide-overs:
 * optional ⋯ overflow menu + flipped side-panel toggle (`rail="end"`).
 */
export function PadDetailChromeActions({
  onCollapse,
  collapseAccessibilityLabel = "Hide details",
  menuItems = [],
  menuAriaLabel = "More actions",
  embedded = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
  const triggerRef = useRef<View>(null);

  useEffect(() => {
    if (!menuOpen || embedded) return;
    const id = requestAnimationFrame(() => {
      triggerRef.current?.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
      });
    });
    return () => cancelAnimationFrame(id);
  }, [embedded, menuOpen]);

  const window = Dimensions.get("window");
  const menuTop = anchor ? anchor.y + anchor.height + 6 : 0;
  const menuRight = anchor
    ? Math.max(12, window.width - (anchor.x + anchor.width))
    : 12;

  const menuItemsList = (
    <View style={styles.menuShell}>
      <BlurView
        intensity={55}
        tint="systemChromeMaterialDark"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.menuFill} />
      <View style={styles.menuBorder} />
      <View style={styles.menuList}>
        {menuItems.map((item) => (
          <Pressable
            key={item.key}
            disabled={item.disabled}
            accessibilityRole="button"
            onPress={() => {
              setMenuOpen(false);
              item.onPress();
            }}
            style={({ pressed }) => [
              styles.menuItem,
              pressed ? styles.menuItemPressed : null,
              item.disabled ? { opacity: 0.4 } : null,
            ]}
          >
            <Text
              style={[
                styles.menuItemLabel,
                item.danger ? styles.menuItemDanger : null,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {menuItems.length > 0 ? (
          <View ref={triggerRef} collapsable={false}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={menuAriaLabel}
              hitSlop={8}
              onPress={() => setMenuOpen(true)}
              style={({ pressed }) => [
                styles.hit,
                pressed ? styles.hitPressed : null,
              ]}
            >
              <MoreHorizontalIcon size={16} color={colors.foreground} />
            </Pressable>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapseAccessibilityLabel}
          accessibilityState={{ expanded: true }}
          hitSlop={8}
          onPress={onCollapse}
          style={({ pressed }) => [
            styles.hit,
            pressed ? styles.hitPressed : null,
          ]}
        >
          <ProjectsSidePanelIcon
            size={18}
            rail="end"
            color={colors.foreground}
          />
        </Pressable>
      </View>

      {embedded && menuOpen ? (
        <>
          <Pressable
            style={styles.embeddedDismiss}
            onPress={() => setMenuOpen(false)}
            accessibilityLabel="Dismiss menu"
          />
          <View style={styles.embeddedMenu}>{menuItemsList}</View>
        </>
      ) : null}

      {!embedded ? (
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
            {anchor ? (
              <View
                pointerEvents="box-none"
                style={[styles.menuHost, { top: menuTop, right: menuRight }]}
              >
                <Pressable onPress={(event) => event.stopPropagation()}>
                  {menuItemsList}
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    alignSelf: "flex-end",
    zIndex: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
  hit: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  hitPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.07)",
  },
  scrim: {
    flex: 1,
  },
  embeddedDismiss: {
    ...StyleSheet.absoluteFillObject,
    // Cover the whole slide-over via a large hit target around the chrome.
    top: -400,
    right: -40,
    bottom: -2000,
    left: -800,
    zIndex: 21,
  },
  embeddedMenu: {
    position: "absolute",
    top: 32,
    right: 0,
    minWidth: 168,
    zIndex: 22,
  },
  menuHost: {
    position: "absolute",
    minWidth: 168,
  },
  menuShell: {
    borderRadius: 10,
    overflow: "hidden",
  },
  menuFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(28, 28, 30, 0.72)",
  },
  menuBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  menuList: {
    paddingVertical: 4,
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuItemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  menuItemLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
  menuItemDanger: {
    color: colors.danger,
  },
});
