import { useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  buildCategoryTree,
  type FinanceCategoryRow,
} from "../../lib/finance-categories";
import type { FinanceAccountRow } from "../../lib/use-finance-accounts";
import { colors, spacing } from "../../lib/theme";

export type TransactionsFilterValue = {
  accountId?: string;
  categoryId?: string;
  uncategorized?: boolean;
};

export function transactionsFilterActive(
  value: TransactionsFilterValue,
): boolean {
  return Boolean(value.accountId || value.categoryId || value.uncategorized);
}

type Props = {
  visible: boolean;
  onClose: () => void;
  accounts: FinanceAccountRow[];
  categories: FinanceCategoryRow[];
  value: TransactionsFilterValue;
  onChange: (value: TransactionsFilterValue) => void;
};

function RadioRow({
  label,
  selected,
  onPress,
  indent = 0,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  indent?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected ? { selected: true } : {}}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        { paddingLeft: spacing.screenX + indent * 18 },
        pressed ? { backgroundColor: colors.rowPressed } : null,
      ]}
    >
      <Text style={styles.optionLabel} numberOfLines={1}>
        {label}
      </Text>
      {selected ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  );
}

/** Phone filter bottom sheet — mobile stand-in for the desktop filter bar. */
export function TransactionsFilterSheet({
  visible,
  onClose,
  accounts,
  categories,
  value,
  onChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>Filters</Text>
            {transactionsFilterActive(value) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear filters"
                hitSlop={8}
                onPress={() => onChange({})}
              >
                <Text style={styles.clearLabel}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView bounces={false}>
            <View style={styles.switchRow}>
              <Text style={styles.optionLabel}>Only uncategorized</Text>
              <Switch
                value={Boolean(value.uncategorized)}
                onValueChange={(next) =>
                  onChange({
                    ...value,
                    uncategorized: next || undefined,
                    // Uncategorized and a category filter are mutually exclusive.
                    categoryId: next ? undefined : value.categoryId,
                  })
                }
                trackColor={{ true: colors.accent }}
              />
            </View>

            <Text style={styles.sectionLabel}>Account</Text>
            <RadioRow
              label="All accounts"
              selected={!value.accountId}
              onPress={() => onChange({ ...value, accountId: undefined })}
            />
            {accounts.map((account) => (
              <RadioRow
                key={account.id}
                label={account.name}
                selected={value.accountId === account.id}
                onPress={() => onChange({ ...value, accountId: account.id })}
              />
            ))}

            <Text style={styles.sectionLabel}>Category</Text>
            <RadioRow
              label="Any category"
              selected={!value.categoryId && !value.uncategorized}
              onPress={() =>
                onChange({
                  ...value,
                  categoryId: undefined,
                  uncategorized: undefined,
                })
              }
            />
            {tree.map((root) => (
              <View key={root.id}>
                <RadioRow
                  label={root.name}
                  selected={value.categoryId === root.id}
                  onPress={() =>
                    onChange({
                      ...value,
                      categoryId: root.id,
                      uncategorized: undefined,
                    })
                  }
                />
                {root.children.map((child) => (
                  <RadioRow
                    key={child.id}
                    label={child.name}
                    selected={value.categoryId === child.id}
                    indent={1}
                    onPress={() =>
                      onChange({
                        ...value,
                        categoryId: child.id,
                        uncategorized: undefined,
                      })
                    }
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxHeight: "78%",
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    marginTop: 8,
    marginBottom: 10,
  },
  header: {
    paddingHorizontal: spacing.screenX,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
  clearLabel: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  switchRow: {
    paddingHorizontal: spacing.screenX,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionLabel: {
    paddingHorizontal: spacing.screenX,
    marginTop: 14,
    marginBottom: 4,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingRight: spacing.screenX,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  optionLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 15,
  },
  check: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "700",
  },
});
