import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { colors } from "../lib/theme";

const FADE_MS = 200;
const FADE_EASING = Easing.out(Easing.cubic);

/** Shared opacity for a stack header title that fades with section changes. */
export function useFadingHeaderTitleOpacity(visible: boolean): SharedValue<number> {
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, {
      duration: FADE_MS,
      easing: FADE_EASING,
    });
  }, [opacity, visible]);

  return opacity;
}

type Props = {
  title: string;
  opacity: SharedValue<number>;
};

/** Centered stack header title driven by a parent-owned fade opacity. */
export function FadingHeaderTitle({ title, opacity }: Props) {
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.wrap, style]}>
      <Text style={styles.text} numberOfLines={1}>
        {title}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    maxWidth: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
});
