import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "../lib/theme";

export type PillNavItem<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  items: readonly PillNavItem<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  /** Horizontal alignment of the pill row. Default start (left). */
  align?: "start" | "center";
  /**
   * `content` — body chrome under the page title.
   * `header` — compact strip for native stack `headerTitle` (between back + actions).
   */
  density?: "content" | "header";
};

/** Mobile PillNav — same role as desktop `.app-pill-nav`, larger tap targets. */
export function PillNav<T extends string>({
  items,
  value,
  onChange,
  accessibilityLabel,
  align = "start",
  density = "content",
}: Props<T>) {
  const isHeader = density === "header";

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={isHeader ? styles.headerHost : undefined}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          isHeader ? styles.rowHeader : styles.row,
          align === "center" ? styles.rowCentered : null,
        ]}
      >
        {items.map((item) => {
          const active = item.value === value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(item.value)}
              style={({ pressed }) => [
                isHeader ? styles.pillHeader : styles.pill,
                active ? styles.pillActive : null,
                pressed && !active ? styles.pillPressed : null,
              ]}
            >
              <Text
                style={[
                  isHeader ? styles.labelHeader : styles.label,
                  active ? styles.labelActive : null,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerHost: {
    maxWidth: 520,
    alignSelf: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.screenX,
    paddingBottom: 10,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  rowCentered: {
    flexGrow: 1,
    justifyContent: "center",
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: "transparent",
  },
  pillHeader: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: "transparent",
  },
  pillActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  pillPressed: {
    backgroundColor: colors.rowPressed,
  },
  label: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 20,
  },
  labelHeader: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
  },
  labelActive: {
    color: colors.foreground,
  },
});
