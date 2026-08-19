import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChevronRightIcon } from "../chevron-right-icon";
import { formatCents } from "../../lib/finance-format";
import type { MonthAmountTotals } from "../../lib/group-transactions-by-month-week";
import { colors, spacing } from "../../lib/theme";

type MonthProps = {
  label: string;
  totals: MonthAmountTotals;
  collapsed?: boolean;
  onToggle?: () => void;
  /** iPad shows income / spend / balance like desktop month headers. */
  showTotals?: boolean;
};

/**
 * Month sticky-style header for the transaction FlatList.
 * Chevron + label (inbox / desktop collapse affordance); iPad also shows totals.
 */
export function TransactionMonthHeader({
  label,
  totals,
  collapsed = false,
  onToggle,
  showTotals = false,
}: MonthProps) {
  const chevron = (
    <View
      style={[
        styles.toggle,
        { transform: [{ rotate: collapsed ? "0deg" : "90deg" }] },
      ]}
      accessibilityElementsHidden
    >
      <ChevronRightIcon size={12} color="rgba(255, 255, 255, 0.4)" />
    </View>
  );

  const labelStyle = showTotals ? styles.padTitle : styles.phoneLabel;
  const body = (
    <>
      {chevron}
      <Text style={labelStyle} numberOfLines={1}>
        {label}
      </Text>
      {showTotals ? null : (
        <View style={styles.rule} accessibilityElementsHidden />
      )}
    </>
  );

  const main = onToggle ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityLabel={`${label}, ${collapsed ? "collapsed" : "expanded"}`}
      onPress={onToggle}
      hitSlop={6}
      style={({ pressed }) => [
        styles.main,
        pressed ? styles.pressed : null,
      ]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.main}>{body}</View>
  );

  return (
    <View style={[styles.row, showTotals ? styles.padRow : styles.phoneRow]}>
      {main}
      {showTotals ? (
        <View style={styles.totals} accessibilityLabel={`${label} totals`}>
          <Text style={styles.income}>
            {formatCents(totals.incomeCents, totals.currency)}
          </Text>
          <Text style={styles.spend}>
            {formatCents(totals.spendCents, totals.currency)}
          </Text>
          <Text style={styles.balance}>
            {formatCents(totals.balanceCents, totals.currency)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type WeekProps = {
  label: string;
  collapsed?: boolean;
  onToggle?: () => void;
};

/**
 * Week subgroup header — iPad only (desktop `ProjectTypeGroupSection` parity).
 */
export function TransactionWeekHeader({
  label,
  collapsed = false,
  onToggle,
}: WeekProps) {
  const body = (
    <>
      <View
        style={[
          styles.toggle,
          { transform: [{ rotate: collapsed ? "0deg" : "90deg" }] },
        ]}
        accessibilityElementsHidden
      >
        <ChevronRightIcon size={12} color="rgba(255, 255, 255, 0.4)" />
      </View>
      <Text style={styles.weekLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.rule} accessibilityElementsHidden />
    </>
  );

  if (!onToggle) {
    return <View style={styles.weekRow}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityLabel={`${label}, ${collapsed ? "collapsed" : "expanded"}`}
      onPress={onToggle}
      hitSlop={6}
      style={({ pressed }) => [
        styles.weekRow,
        pressed ? styles.pressed : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  phoneRow: {
    gap: 0,
    marginTop: 4,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 8,
  },
  padRow: {
    gap: 12,
    paddingHorizontal: spacing.screenX,
    paddingTop: 14,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  phoneLabel: {
    flexShrink: 0,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  padTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  toggle: {
    width: 14,
    height: 14,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  rule: {
    flex: 1,
    minWidth: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  pressed: {
    opacity: 0.72,
  },
  totals: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    flexShrink: 0,
  },
  income: {
    color: "#3f9d6e",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  spend: {
    color: "#c45b5b",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  balance: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 6,
    backgroundColor: "transparent",
  },
  weekLabel: {
    flexShrink: 0,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
});
