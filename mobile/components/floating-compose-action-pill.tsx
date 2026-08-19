import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Matches floating tab bar compose pill (legacy big action). */
export const FLOATING_COMPOSE_PILL_SIZE = 56;
/** Desktop-parity PDF dock row height (file chips + compact +). */
export const FLOATING_PDF_DOCK_ROW_HEIGHT = 36;
const SIDE_INSET = 16;
const GAP_ABOVE_COMPOSE = 10;
const ROW_GAP = 8;

/** Extra list padding so content clears the PDF dock above the compose (+). */
export const FLOATING_PDF_DOCK_CLEARANCE =
  FLOATING_PDF_DOCK_ROW_HEIGHT + GAP_ABOVE_COMPOSE;

/** Muted compact plus — matches desktop `.letter-pdf-tab--upload-icon`. */
export const LETTER_PDF_UPLOAD_ICON_COLOR = "rgba(237, 237, 237, 0.55)";

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  /** File chips / labels shown to the left of the action. */
  left?: ReactNode;
  /**
   * Desktop letter dock parity: small + sits next to the PDF tabs instead of
   * a large trailing pill on the far right.
   */
  compact?: boolean;
};

/**
 * Floating row above the main-nav create (+) — optional left content + action.
 * `compact` matches desktop letter PDF tabs (chips + small upload icon).
 */
export function FloatingComposeActionPill({
  onPress,
  accessibilityLabel,
  children,
  disabled = false,
  left,
  compact = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottom =
    Math.max(insets.bottom, 10) +
    FLOATING_COMPOSE_PILL_SIZE +
    GAP_ABOVE_COMPOSE;

  if (compact) {
    return (
      <View
        pointerEvents="box-none"
        style={[styles.host, { bottom, left: SIDE_INSET, right: SIDE_INSET }]}
      >
        <View style={styles.compactRow} pointerEvents="box-none">
          {left ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.compactScroll}
              contentContainerStyle={styles.compactContent}
              keyboardShouldPersistTaps="handled"
            >
              {left}
              <Pressable
                onPress={onPress}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.compactHit,
                  pressed || disabled ? { opacity: 0.55 } : null,
                ]}
              >
                {children}
              </Pressable>
            </ScrollView>
          ) : (
            <Pressable
              onPress={onPress}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              hitSlop={8}
              style={({ pressed }) => [
                styles.compactHit,
                pressed || disabled ? { opacity: 0.55 } : null,
              ]}
            >
              {children}
            </Pressable>
          )}
        </View>
      </View>
    );
  }

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
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  compactScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: "100%",
  },
  compactContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: ROW_GAP,
  },
  compactHit: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
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
