import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/theme";

type Props = {
  onPrev: () => void;
  onNext: () => void;
  prevAccessibilityLabel: string;
  nextAccessibilityLabel: string;
};

/** ‹ › stepper that sits beside the Calendar title. */
export function CalendarRangeArrows({
  onPrev,
  onNext,
  prevAccessibilityLabel,
  nextAccessibilityLabel,
}: Props) {
  return (
    <View style={styles.row} accessibilityRole="adjustable">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={prevAccessibilityLabel}
        hitSlop={8}
        onPress={onPrev}
        style={({ pressed }) => [styles.chevron, pressed ? styles.pressed : null]}
      >
        <Text style={styles.glyph}>‹</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextAccessibilityLabel}
        hitSlop={8}
        onPress={onNext}
        style={({ pressed }) => [styles.chevron, pressed ? styles.pressed : null]}
      >
        <Text style={styles.glyph}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  chevron: {
    width: 28,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.45,
  },
  glyph: {
    color: colors.muted,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "400",
  },
});
