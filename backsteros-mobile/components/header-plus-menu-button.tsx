import { BlurView } from "expo-blur";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from "react-native";

import { TabStackHeaderPlusButton } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";

export type HeaderPlusMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onPress: () => void;
};

type Props = {
  items: readonly HeaderPlusMenuItem[];
  accessibilityLabel?: string;
};

/**
 * Glass “+” that opens a compact menu below the button (Knowledge folder/document).
 */
export function HeaderPlusMenuButton({
  items,
  accessibilityLabel = "Add",
}: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
  const wrapRef = useRef<View>(null);

  useEffect(() => {
    if (!open) return;
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }, [open]);

  return (
    <>
      <View ref={wrapRef} collapsable={false}>
        <TabStackHeaderPlusButton
          accessibilityLabel={accessibilityLabel}
          onPress={() => setOpen((value) => !value)}
        />
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.scrim}
          onPress={() => setOpen(false)}
          accessibilityLabel="Dismiss menu"
        >
          {anchor ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.menuHost,
                {
                  top: anchor.y + anchor.height + 8,
                  right: Math.max(
                    12,
                    Dimensions.get("window").width - (anchor.x + anchor.width),
                  ),
                },
              ]}
            >
              <Pressable onPress={(event) => event.stopPropagation()}>
                <View style={styles.menuShell}>
                  <BlurView
                    intensity={55}
                    tint="systemChromeMaterialDark"
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.menuFill} />
                  <View style={styles.menuBorder} />
                  <View style={styles.menuList}>
                    {items.map((item) => (
                      <Pressable
                        key={item.key}
                        accessibilityRole="menuitem"
                        accessibilityLabel={item.label}
                        onPress={() => {
                          setOpen(false);
                          item.onPress();
                        }}
                        style={({ pressed }) => [
                          styles.menuItem,
                          pressed ? styles.menuItemPressed : null,
                        ]}
                      >
                        {item.icon ? (
                          <View style={styles.menuIcon}>{item.icon}</View>
                        ) : null}
                        <Text style={styles.menuLabel}>{item.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
  },
  menuHost: {
    position: "absolute",
    minWidth: 200,
  },
  menuShell: {
    borderRadius: 14,
    overflow: "hidden",
    minWidth: 200,
  },
  menuFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(28, 28, 30, 0.55)",
  },
  menuBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  menuList: {
    padding: 6,
    gap: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  menuItemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  menuIcon: {
    width: 20,
    alignItems: "center",
  },
  menuLabel: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
});
