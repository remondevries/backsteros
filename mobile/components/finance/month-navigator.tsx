import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatMonthLabel, shiftMonthKey } from "../../lib/finance-format";
import { colors } from "../../lib/theme";

type Props = {
  monthKey: string;
  onChange: (monthKey: string) => void;
  /** Highest month the user can navigate to (default: no limit). */
  maxMonthKey?: string;
};

/** ‹ August 2026 › month stepper for spend widgets. */
export function MonthNavigator({ monthKey, onChange, maxMonthKey }: Props) {
  const nextKey = shiftMonthKey(monthKey, 1);
  const nextDisabled = maxMonthKey != null && nextKey > maxMonthKey;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        hitSlop={10}
        onPress={() => onChange(shiftMonthKey(monthKey, -1))}
        style={({ pressed }) => [styles.chevron, pressed ? styles.pressed : null]}
      >
        <Text style={styles.chevronGlyph}>‹</Text>
      </Pressable>
      <Text style={styles.label}>{formatMonthLabel(monthKey)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        hitSlop={10}
        disabled={nextDisabled}
        onPress={() => onChange(nextKey)}
        style={({ pressed }) => [
          styles.chevron,
          nextDisabled ? styles.disabled : null,
          pressed && !nextDisabled ? styles.pressed : null,
        ]}
      >
        <Text style={styles.chevronGlyph}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chevron: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pressed: {
    backgroundColor: colors.rowPressed,
  },
  disabled: {
    opacity: 0.3,
  },
  chevronGlyph: {
    color: colors.foreground,
    fontSize: 20,
    lineHeight: 22,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    minWidth: 118,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
});
