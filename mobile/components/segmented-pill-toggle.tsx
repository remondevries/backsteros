import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../lib/theme";

export type SegmentedPillToggleOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: readonly SegmentedPillToggleOption<T>[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  /** Equal-width segments that fill the parent. */
  fullWidth?: boolean;
};

/** Compact Task / Document style toggle for headers. */
export function SegmentedPillToggle<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
  disabled = false,
  fullWidth = false,
}: Props<T>) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.shell,
        fullWidth ? styles.shellFullWidth : null,
        disabled ? styles.shellDisabled : null,
      ]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              fullWidth ? styles.segmentFullWidth : null,
              active ? styles.segmentActive : null,
              pressed && !active && !disabled ? styles.segmentPressed : null,
            ]}
          >
            <Text
              style={[
                styles.label,
                fullWidth ? styles.labelFullWidth : null,
                active ? styles.labelActive : null,
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  shellFullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  shellDisabled: {
    opacity: 0.4,
  },
  segment: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  segmentFullWidth: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  segmentPressed: {
    opacity: 0.55,
  },
  label: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 20,
  },
  labelFullWidth: {
    textAlign: "center",
  },
  labelActive: {
    color: colors.foreground,
    fontWeight: "600",
  },
});
