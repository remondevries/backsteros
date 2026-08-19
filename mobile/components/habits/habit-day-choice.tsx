import { useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const HABIT_GREEN = "#3d9a5b";
const HABIT_RED = "#c44a4a";
export const HABIT_CHOICE_SLIDE_MS = 420;
const EXPAND_MS = 280;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Green slides in from the left, red from the right; dismissing reverses that.
 * Picking one expands across the square before the status commits.
 */
export function HabitDayChoice({
  size,
  ymd,
  open,
  onPick,
  onClosed,
}: {
  size: number;
  ymd: string;
  /** When false, halves slide back out then `onClosed` fires. */
  open: boolean;
  onPick: (status: "completed" | "canceled") => void;
  onClosed?: () => void;
}) {
  const slide = useSharedValue(0);
  const expand = useSharedValue(0.5);
  /** 0 idle · 1 completed · 2 canceled */
  const side = useSharedValue(0);
  const locked = useRef(false);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const notifyClosed = useCallback(() => {
    onClosedRef.current?.();
  }, []);

  useEffect(() => {
    if (open) {
      locked.current = false;
      side.value = 0;
      expand.value = 0.5;
      slide.value = 0;
      slide.value = withTiming(1, {
        duration: HABIT_CHOICE_SLIDE_MS,
        easing: EASE,
      });
      return;
    }
    // Skip reverse slide when a color is expanding to fill the square.
    if (locked.current) {
      notifyClosed();
      return;
    }
    slide.value = withTiming(
      0,
      { duration: HABIT_CHOICE_SLIDE_MS, easing: EASE },
      (finished) => {
        if (finished) {
          runOnJS(notifyClosed)();
        }
      },
    );
  }, [expand, notifyClosed, open, side, slide]);

  const commit = (status: "completed" | "canceled") => {
    onPick(status);
  };

  const select = (status: "completed" | "canceled") => {
    if (locked.current || size <= 0 || !open) return;
    locked.current = true;
    side.value = status === "completed" ? 1 : 2;
    expand.value = 0.5;
    expand.value = withTiming(
      1,
      { duration: EXPAND_MS, easing: EASE },
      (finished) => {
        if (finished) {
          runOnJS(commit)(status);
        }
      },
    );
  };

  const half = size / 2;

  const greenStyle = useAnimatedStyle(() => {
    if (side.value === 1) {
      return {
        position: "absolute" as const,
        left: 0,
        top: 0,
        width: expand.value * size,
        height: size,
        opacity: 1,
        zIndex: 2,
        transform: [{ translateX: 0 }],
      };
    }
    if (side.value === 2) {
      return {
        position: "absolute" as const,
        left: 0,
        top: 0,
        width: half,
        height: size,
        opacity: 0,
        zIndex: 1,
        transform: [{ translateX: 0 }],
      };
    }
    return {
      position: "absolute" as const,
      left: 0,
      top: 0,
      width: half,
      height: size,
      opacity: 1,
      zIndex: 1,
      transform: [{ translateX: (1 - slide.value) * -half }],
    };
  });

  const redStyle = useAnimatedStyle(() => {
    if (side.value === 2) {
      return {
        position: "absolute" as const,
        right: 0,
        top: 0,
        width: expand.value * size,
        height: size,
        opacity: 1,
        zIndex: 2,
        transform: [{ translateX: 0 }],
      };
    }
    if (side.value === 1) {
      return {
        position: "absolute" as const,
        left: half,
        top: 0,
        width: half,
        height: size,
        opacity: 0,
        zIndex: 1,
        transform: [{ translateX: 0 }],
      };
    }
    return {
      position: "absolute" as const,
      left: half,
      top: 0,
      width: half,
      height: size,
      opacity: 1,
      zIndex: 1,
      transform: [{ translateX: (1 - slide.value) * half }],
    };
  });

  return (
    <View
      pointerEvents={open ? "box-none" : "none"}
      style={[styles.root, { width: size, height: size }]}
    >
      <Animated.View style={[styles.swatch, styles.complete, greenStyle]}>
        <Pressable
          accessibilityLabel={`Mark ${ymd} completed`}
          style={StyleSheet.absoluteFill}
          onPress={() => select("completed")}
        />
      </Animated.View>
      <Animated.View style={[styles.swatch, styles.skip, redStyle]}>
        <Pressable
          accessibilityLabel={`Mark ${ymd} skipped`}
          style={StyleSheet.absoluteFill}
          onPress={() => select("canceled")}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    borderRadius: 4,
  },
  swatch: {
    overflow: "hidden",
  },
  complete: {
    backgroundColor: HABIT_GREEN,
  },
  skip: {
    backgroundColor: HABIT_RED,
  },
});
