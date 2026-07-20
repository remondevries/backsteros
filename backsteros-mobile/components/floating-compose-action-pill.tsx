import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Matches floating tab bar compose pill. */
export const FLOATING_COMPOSE_PILL_SIZE = 56;
const SIDE_INSET = 16;
const GAP_ABOVE_COMPOSE = 10;
const ROW_GAP = 10;

/** Extra list padding so content clears the PDF dock above the compose (+). */
export const FLOATING_PDF_DOCK_CLEARANCE =
  FLOATING_COMPOSE_PILL_SIZE + GAP_ABOVE_COMPOSE;

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  /** File chips / labels shown to the left of the action pill. */
  left?: ReactNode;
};

/**
 * Floating row above the main-nav create (+) — optional left content + action pill.
 */
export function FloatingComposeActionPill({
  onPress,
  accessibilityLabel,
  children,
  disabled = false,
  left,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottom =
    Math.max(insets.bottom, 10) +
    FLOATING_COMPOSE_PILL_SIZE +
    GAP_ABOVE_COMPOSE;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom, left: SIDE_INSET, right: SIDE_INSET }]}
    >
      <View style={styles.row} pointerEvents="box-none">
        {left ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.leftScroll}
            contentContainerStyle={styles.leftContent}
            keyboardShouldPersistTaps="handled"
          >
            {left}
          </ScrollView>
        ) : (
          <View style={styles.leftSpacer} />
        )}
        <View style={styles.pill}>
          <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.pillFill} />
          <View style={styles.pillBorder} />
          <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={({ pressed }) => [
              styles.hit,
              pressed || disabled ? { opacity: 0.55 } : null,
            ]}
          >
            {children}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    zIndex: 5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: ROW_GAP,
    width: "100%",
  },
  leftScroll: {
    flex: 1,
    minWidth: 0,
  },
  leftContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 4,
  },
  leftSpacer: {
    flex: 1,
  },
  pill: {
    width: FLOATING_COMPOSE_PILL_SIZE,
    height: FLOATING_COMPOSE_PILL_SIZE,
    borderRadius: FLOATING_COMPOSE_PILL_SIZE / 2,
    overflow: "hidden",
    flexShrink: 0,
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
