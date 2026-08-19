import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/theme";

type Props = {
  year: number;
  onChange: (year: number) => void;
  /** Highest year the next-arrow may reach (default: no limit). */
  maxYear?: number;
  /**
   * `default` — subtle pressed fill on chevrons.
   * `plain` — no chrome; floats over the nav bar (habit tracker phone header).
   */
  chrome?: "default" | "plain";
};

/** ‹ 2026 › year stepper (desktop FinanceYearNavigator parity). */
export function YearNavigator({
  year,
  onChange,
  maxYear,
  chrome = "default",
}: Props) {
  const nextDisabled = maxYear != null && year >= maxYear;
  const plain = chrome === "plain";

  return (
    <View style={styles.row} accessibilityRole="adjustable">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous year"
        hitSlop={10}
        onPress={() => onChange(year - 1)}
        style={({ pressed }) => [
          styles.chevron,
          plain ? styles.chevronPlain : null,
          pressed ? (plain ? styles.pressedPlain : styles.pressed) : null,
        ]}
      >
        <Text
          style={[styles.chevronGlyph, plain ? styles.chevronGlyphPlain : null]}
        >
          ‹
        </Text>
      </Pressable>
      <Text style={[styles.label, plain ? styles.labelPlain : null]}>{year}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next year"
        hitSlop={10}
        disabled={nextDisabled}
        onPress={() => onChange(year + 1)}
        style={({ pressed }) => [
          styles.chevron,
          plain ? styles.chevronPlain : null,
          nextDisabled ? styles.disabled : null,
          pressed && !nextDisabled
            ? plain
              ? styles.pressedPlain
              : styles.pressed
            : null,
        ]}
      >
        <Text
          style={[styles.chevronGlyph, plain ? styles.chevronGlyphPlain : null]}
        >
          ›
        </Text>
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
  chevronPlain: {
    width: 24,
    height: 32,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  pressed: {
    backgroundColor: colors.rowPressed,
  },
  pressedPlain: {
    opacity: 0.45,
  },
  disabled: {
    opacity: 0.3,
  },
  chevronGlyph: {
    color: colors.foreground,
    fontSize: 20,
    lineHeight: 22,
  },
  chevronGlyphPlain: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "400",
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    minWidth: 48,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  labelPlain: {
    fontSize: 17,
    fontWeight: "600",
    minWidth: 44,
  },
});
