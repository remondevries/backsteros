import type { FinancialTransaction } from "@backsteros/contracts";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FinanceAccountAvatar } from "./finance-account-avatar";
import {
  categoryIconDisplay,
  type FinanceCategoryRow,
} from "../../lib/finance-categories";
import {
  formatCalendarDate,
  formatSignedCents,
  formatTxDateShort,
  transactionDisplayTitle,
} from "../../lib/finance-format";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";

export type TransactionListRowDensity = "phone" | "pad";

type Props = {
  transaction: FinancialTransaction;
  density: TransactionListRowDensity;
  highlighted?: boolean;
  category?: FinanceCategoryRow | null;
  accountName?: string | null;
  accountAvatarSrc?: string | null;
  organizationName?: string | null;
  onPress: () => void;
};

/**
 * Phone: stacked title / meta / amount.
 * iPad: desktop finance row columns — date | category | account | merchant | payee | amount.
 */
export function TransactionListRow({
  transaction,
  density,
  highlighted = false,
  category = null,
  accountName = null,
  accountAvatarSrc = null,
  organizationName = null,
  onPress,
}: Props) {
  const title = transactionDisplayTitle(transaction);
  const amountStyle = [
    density === "pad" ? styles.padAmount : styles.phoneAmount,
    transaction.amountCents > 0
      ? styles.amountPositive
      : transaction.amountCents < 0
        ? styles.amountNegative
        : null,
  ];
  const amountLabel = formatSignedCents(
    transaction.amountCents,
    transaction.currency,
  );

  if (density === "pad") {
    const icon = categoryIconDisplay(category?.icon);
    const categoryLabel = category?.name ?? "Uncategorized";
    const uncategorized = category == null;
    const merchantLabel = organizationName?.trim() || "No Merchant";
    const merchantEmpty = !organizationName?.trim();

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onPress}
        style={({ pressed }) => [
          styles.padRow,
          highlighted ? ui.keyboardNavHighlight : null,
          pressed ? { backgroundColor: colors.rowPressed } : null,
        ]}
      >
        {({ pressed }) => (
          <>
            <Text style={styles.padDate} numberOfLines={1}>
              {formatTxDateShort(transaction.bookedOn)}
            </Text>

            <View style={styles.padCategoryCell}>
              <View
                style={[
                  styles.padCategoryChip,
                  uncategorized ? styles.padCategoryUncategorized : null,
                ]}
              >
                {icon.emoji ? (
                  <Text style={styles.padCategoryEmoji}>{icon.emoji}</Text>
                ) : (
                  <View
                    style={[
                      styles.padCategoryDot,
                      {
                        backgroundColor: uncategorized
                          ? colors.accent
                          : (icon.color ?? colors.faint),
                      },
                    ]}
                  />
                )}
                <Text
                  style={[
                    styles.padCategoryLabel,
                    uncategorized
                      ? styles.padCategoryLabelUncategorized
                      : null,
                  ]}
                  numberOfLines={1}
                >
                  {categoryLabel}
                </Text>
              </View>
            </View>

            <FinanceAccountAvatar
              src={accountAvatarSrc}
              name={accountName ?? "?"}
              size={18}
            />

            <View
              style={[
                styles.padMerchantChip,
                merchantEmpty
                  ? styles.padMerchantEmpty
                  : styles.padMerchantFilled,
                pressed
                  ? merchantEmpty
                    ? styles.padMerchantEmptyPressed
                    : styles.padMerchantFilledPressed
                  : null,
              ]}
            >
              <Text
                style={[
                  styles.padMerchantLabel,
                  merchantEmpty ? styles.padMerchantLabelEmpty : null,
                ]}
                numberOfLines={1}
              >
                {merchantLabel}
              </Text>
            </View>

            <Text style={styles.padPayee} numberOfLines={1}>
              {title}
            </Text>

            <Text style={amountStyle}>{amountLabel}</Text>
          </>
        )}
      </Pressable>
    );
  }

  const categoryName = category?.name ?? null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.phoneRow,
        highlighted ? ui.keyboardNavHighlight : null,
        pressed ? { backgroundColor: colors.rowPressed } : null,
      ]}
    >
      <View style={styles.phoneBody}>
        <Text style={styles.phoneTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.phoneMetaLine}>
          <Text style={styles.phoneMeta}>
            {formatCalendarDate(transaction.bookedOn)}
          </Text>
          {categoryName ? (
            <View style={styles.phoneCategoryPill}>
              <Text style={styles.phoneCategoryPillLabel} numberOfLines={1}>
                {categoryName}
              </Text>
            </View>
          ) : (
            <View
              style={[styles.phoneCategoryPill, styles.phoneUncategorizedPill]}
            >
              <Text
                style={[
                  styles.phoneCategoryPillLabel,
                  styles.phoneUncategorizedLabel,
                ]}
              >
                Uncategorized
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text style={amountStyle}>{amountLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: "transparent",
  },
  phoneBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  phoneTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 20,
  },
  phoneMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  phoneMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  phoneCategoryPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxWidth: 160,
  },
  phoneCategoryPillLabel: {
    color: colors.muted,
    fontSize: 11,
  },
  phoneUncategorizedPill: {
    borderColor: "rgba(238, 122, 71, 0.45)",
  },
  phoneUncategorizedLabel: {
    color: colors.accent,
  },
  phoneAmount: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },

  padRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: "transparent",
  },
  padDate: {
    width: 56,
    flexGrow: 0,
    flexShrink: 0,
    color: colors.muted,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  /** Fixed column so account avatars / merchant / payee align across rows. */
  padCategoryCell: {
    width: 120,
    flexGrow: 0,
    flexShrink: 0,
    overflow: "hidden",
    justifyContent: "center",
  },
  padCategoryChip: {
    // Shrink-wrap inside the fixed column (desktop `w-fit` trigger).
    alignSelf: "flex-start",
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    overflow: "hidden",
  },
  padCategoryUncategorized: {
    borderColor: "rgba(238, 122, 71, 0.45)",
  },
  padCategoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  padCategoryEmoji: {
    fontSize: 11,
    width: 14,
    textAlign: "center",
    flexShrink: 0,
  },
  padCategoryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    flexGrow: 0,
    flexShrink: 1,
  },
  padCategoryLabelUncategorized: {
    color: colors.accent,
  },
  padMerchantChip: {
    alignSelf: "center",
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "auto",
    maxWidth: 140,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  /** Filled merchant: plain text until pressed (desktop org trigger). */
  padMerchantFilled: {
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  padMerchantFilledPressed: {
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  /** Empty merchant: dashed ghost chip. */
  padMerchantEmpty: {
    borderStyle: "dashed",
    borderColor: "rgba(255, 255, 255, 0.24)",
    backgroundColor: "transparent",
  },
  padMerchantEmptyPressed: {
    borderColor: "rgba(255, 255, 255, 0.36)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  padMerchantLabel: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: "500",
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: 124,
  },
  padMerchantLabelEmpty: {
    color: "rgba(255, 255, 255, 0.45)",
    fontWeight: "500",
  },
  padPayee: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 48,
    marginLeft: 4,
    color: colors.muted,
    fontSize: 13,
  },
  padAmount: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 80,
    textAlign: "right",
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  amountPositive: {
    color: "#3f9d6e",
  },
  amountNegative: {
    color: "#c45b5b",
  },
});
