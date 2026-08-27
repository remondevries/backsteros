import { BlurView } from "expo-blur";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HEADER_ACTION_SIZE } from "../../lib/tab-stack-options";
import { colors } from "../../lib/theme";
import { PrimerOcticon } from "../primer-octicon";

/** Oldest year offered in the habit year filter. */
export const HABIT_YEAR_FILTER_EARLIEST = 1970;

const ROW_HEIGHT = 44;
const MENU_CLOSE_MS = 180;
const MENU_SPRING = { damping: 20, stiffness: 320, mass: 0.7 };
const CLOSE_EASING = Easing.out(Easing.cubic);
/** Same horizontal bounds as the floating tab-bar pill. */
const NAV_SIDE_INSET = 16;
const NAV_MAX_WIDTH = 480;

export function listHabitFilterYears(maxYear: number): number[] {
  const latest = Math.min(maxYear, new Date().getFullYear());
  const years: number[] = [];
  for (let year = latest; year >= HABIT_YEAR_FILTER_EARLIEST; year -= 1) {
    years.push(year);
  }
  return years;
}

type Props = {
  visible: boolean;
  year: number;
  maxYear: number;
  onSelect: (year: number) => void;
  onClose: () => void;
};

/**
 * Year picker that drops down from the habit header — same blur-pill language
 * as the main-nav More menu, not the desktop ‹ year › stepper.
 */
export function HabitYearFilterMenu({
  visible,
  year,
  maxYear,
  onSelect,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);
  const years = useMemo(() => listHabitFilterYears(maxYear), [maxYear]);
  const selectedIndex = Math.max(0, years.indexOf(year));
  const listRef = useRef<FlatList<number>>(null);
  const maxMenuHeight = Math.min(360, Math.round(windowHeight * 0.45));
  const menuTop = Math.max(insets.top, 8) + HEADER_ACTION_SIZE + 6;
  const menuWidth = Math.min(windowWidth - NAV_SIDE_INSET * 2, NAV_MAX_WIDTH);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withSpring(1, MENU_SPRING);
      return;
    }
    progress.value = withTiming(
      0,
      { duration: MENU_CLOSE_MS, easing: CLOSE_EASING },
      (finished) => {
        if (finished) runOnJS(setMounted)(false);
      },
    );
  }, [progress, visible]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const menuStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -12 }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.host} pointerEvents="box-none">
        <Animated.View
          pointerEvents={visible ? "auto" : "none"}
          style={[styles.scrim, scrimStyle]}
        >
          <Pressable
            accessibilityLabel="Dismiss year filter"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          pointerEvents={visible ? "box-none" : "none"}
          style={[styles.menuHost, { top: menuTop }, menuStyle]}
        >
          <View style={[styles.pill, { width: menuWidth }]}>
            <View style={styles.backdrop} pointerEvents="none">
              <BlurView
                intensity={55}
                tint="systemChromeMaterialDark"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.pillFill} />
              <View style={styles.pillBorder} />
            </View>
            <FlatList
              ref={listRef}
              data={years}
              keyExtractor={(item) => String(item)}
              initialScrollIndex={selectedIndex}
              getItemLayout={(_, index) => ({
                length: ROW_HEIGHT,
                offset: ROW_HEIGHT * index,
                index,
              })}
              onScrollToIndexFailed={({ index }) => {
                requestAnimationFrame(() => {
                  listRef.current?.scrollToIndex({
                    index,
                    animated: false,
                    viewPosition: 0.35,
                  });
                });
              }}
              style={{ maxHeight: maxMenuHeight }}
              showsVerticalScrollIndicator={false}
              accessibilityLabel="Habit years"
              renderItem={({ item }) => {
                const selected = item === year;
                return (
                  <Pressable
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Year ${item}`}
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      selected ? styles.rowSelected : null,
                      pressed ? styles.rowPressed : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.yearLabel,
                        selected ? styles.yearLabelSelected : null,
                      ]}
                    >
                      {item}
                    </Text>
                    {selected ? (
                      <PrimerOcticon
                        name="check"
                        size={16}
                        color={colors.foreground}
                      />
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  menuHost: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 3,
    alignItems: "center",
  },
  pill: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  pillFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 20, 22, 0.45)",
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    height: ROW_HEIGHT,
    paddingHorizontal: 14,
  },
  rowSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  rowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  yearLabel: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  yearLabelSelected: {
    fontWeight: "600",
  },
});
