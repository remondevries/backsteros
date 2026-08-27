import type { MoneybirdSalesInvoiceSummary } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { BacksterFlashList } from "./lists/index";
import { buildMoneybirdContactInvoicesFilter } from "../lib/finance-api";
import { formatCalendarDate } from "../lib/finance-format";
import { colors, spacing } from "../lib/theme";
import { ui } from "../lib/ui";
import { useFinanceInvoices } from "../lib/use-finance-invoices";

type Props = {
  moneybirdContactId: string;
};

function contactLabel(invoice: MoneybirdSalesInvoiceSummary): string {
  return (
    invoice.contactName?.trim() ||
    invoice.reference?.trim() ||
    invoice.invoiceId ||
    "Invoice"
  );
}

export function OrganizationInvoicesPanel({ moneybirdContactId }: Props) {
  const router = useRouter();
  const filter = useMemo(
    () => buildMoneybirdContactInvoicesFilter(moneybirdContactId),
    [moneybirdContactId],
  );
  const list = useFinanceInvoices(filter);

  if (list.loading && list.invoices.length === 0 && !list.settings) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (list.settings && !list.connected) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>Moneybird not connected</Text>
        <Text style={styles.emptyBody}>
          Connect Moneybird in Settings to see sales invoices here.
        </Text>
      </View>
    );
  }

  return (
    <View style={ui.screen}>
      {list.error && list.invoices.length === 0 ? (
        <Text style={ui.error}>{list.error}</Text>
      ) : null}
      <BacksterFlashList
        estimatedItemSize={56}
        data={list.invoices}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="on-drag"
        alwaysBounceVertical
        onEndReached={() => void list.loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={() => {
              void list.refresh();
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        ListEmptyComponent={
          list.loading ? null : (
            <Text style={ui.empty}>No invoices for this organization.</Text>
          )
        }
        ListFooterComponent={
          list.loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.muted} size="small" />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={contactLabel(item)}
            onPress={() => {
              router.push(`/finance/invoice/${item.id}`);
            }}
            style={({ pressed }) => [
              styles.row,
              pressed ? { backgroundColor: colors.rowPressed } : null,
            ]}
          >
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {contactLabel(item)}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {[
                  item.invoiceId,
                  item.invoiceDate
                    ? formatCalendarDate(item.invoiceDate)
                    : null,
                  item.state,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <Text style={styles.amount} numberOfLines={1}>
              {item.totalPriceInclTax ?? "—"}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  emptyWrap: {
    flex: 1,
    padding: spacing.screenX,
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  amount: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 0,
  },
  footer: {
    paddingVertical: 16,
    alignItems: "center",
  },
});
