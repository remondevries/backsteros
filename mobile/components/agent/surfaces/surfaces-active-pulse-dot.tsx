import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

import { colors } from "../../../lib/theme";

/**
 * Orange pulse — shows on the surfaces toggle when any surface tab is open
 * (chat / browser / …) so iPhone users know work is waiting behind the panel.
 */
export function SurfacesActivePulseDot({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0.4);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
    };
  }, [opacity, visible]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.dot, { opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.35)",
  },
});
