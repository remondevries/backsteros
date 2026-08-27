import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderPlusGlyph } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { FLOATING_COMPOSE_PILL_SIZE } from "./floating-compose-action-pill";

const SIDE_INSET = 16;

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  visible?: boolean;
};

/** Floating create (+) — bottom-right, for screens without the main tab bar. */
export function FloatingBottomRightPlusButton({
  onPress,
  accessibilityLabel,
  visible = true,
}: Props) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const bottom = Math.max(insets.bottom, 12) + SIDE_INSET;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom, right: SIDE_INSET }]}
    >
      <View style={styles.pill}>
        <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.pillFill} />
        <View style={styles.pillBorder} />
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={({ pressed }) => [styles.hit, pressed ? { opacity: 0.55 } : null]}
        >
          <HeaderPlusGlyph color={colors.foreground} size={20} />
        </Pressable>
      </View>
    </View>
  );
}

export const FLOATING_BOTTOM_RIGHT_PLUS_CLEARANCE =
  FLOATING_COMPOSE_PILL_SIZE + SIDE_INSET + 12;

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    zIndex: 8,
  },
  pill: {
    width: FLOATING_COMPOSE_PILL_SIZE,
    height: FLOATING_COMPOSE_PILL_SIZE,
    borderRadius: FLOATING_COMPOSE_PILL_SIZE / 2,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  pillFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 20, 22, 0.45)",
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FLOATING_COMPOSE_PILL_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  hit: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
