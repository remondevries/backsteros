import type { MoneybirdSalesInvoiceSummary } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ListSearchField } from "../list-search-field";
import { ContentPageTitle } from "../content-page-title";
import { InvoiceRevenueChart } from "./invoice-revenue-chart";
import { buildMoneybirdInvoicesPeriodFilter } from "../../lib/finance-api";
import { buildInvoiceRevenueChartPoints } from "../../lib/finance-chart-series";
import { formatCalendarDate } from "../../lib/finance-format";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { usePullToRevealSearch } from "../../lib/use-pull-to-reveal-search";
import { useFinanceInvoices } from "../../lib/use-finance-invoices";
import { useFinanceInvoiceRevenue } from "../../lib/use-finance-invoice-revenue";

function YearStepper({
  year,
  onChange,
  latestYear = new Date().getFullYear(),
}: {
  year: number;
  onChange: (year: number) => void;
  latestYear?: number;
}) {
  const nextDisabled = year >= latestYear;

  return (
    <View style={styles.yearRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous year"
        hitSlop={10}
        onPress={() => onChange(year - 1)}
        style={({ pressed }) => [
          styles.yearChevron,
          pressed ? styles.yearPressed : null,
        ]}
      >
        <Text style={styles.yearChevronGlyph}>‹</Text>
      </Pressable>
      <Text style={styles.yearLabel}>{year}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next year"
        hitSlop={10}
        disabled={nextDisabled}
        onPress={() => onChange(year + 1)}
        style={({ pressed }) => [
          styles.yearChevron,
          nextDisabled ? styles.yearDisabled : null,
          pressed && !nextDisabled ? styles.yearPressed : null,
        ]}
      >
        <Text style={styles.yearChevronGlyph}>›</Text>
      </Pressable>
    </View>
  );
}

function matchesInvoiceQuery(
  invoice: MoneybirdSalesInvoiceSummary,
  query: string,
): boolean {
  if (!query) return true;
  const haystack = [
    invoice.contactName,
    invoice.reference,
    invoice.invoiceId,
    invoice.state,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/**
 * Moneybird sales invoices list + revenue chart.
 * Detail opens via `/finance/invoice/[id]` (iPad slide-over / phone stack).
 */
export function FinanceInvoicesPane() {
  const router = useRouter();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [debounced, setDebounced] = useState("");

  const periodFilter = useMemo(
    () => buildMoneybirdInvoicesPeriodFilter(year),
    [year],
  );

  const list = useFinanceInvoices(periodFilter);
  const revenue = useFinanceInvoiceRevenue(year);
  const search = usePullToRevealSearch({
    suppress: list.refreshing || revenue.refreshing,
  });

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(search.query.trim()), 300);
    return () => clearTimeout(handle);
  }, [search.query]);

  const chartPoints = useMemo(
    () =>
      buildInvoiceRevenueChartPoints({
        year,
        months: revenue.months,
      }),
    [revenue.months, year],
  );

  const visibleInvoices = useMemo(
    () =>
      list.invoices.filter((invoice) =>
        matchesInvoiceQuery(invoice, debounced),
      ),
    [debounced, list.invoices],
  );

  const refreshAll = async () => {
    await Promise.all([list.refresh(), revenue.refresh()]);
  };

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
          Connect Moneybird in Settings on desktop to see sales invoices here.
        </Text>
      </View>
    );
  }

  const contactLabel = (invoice: MoneybirdSalesInvoiceSummary) =>
    invoice.contactName?.trim() ||
    invoice.reference?.trim() ||
    invoice.invoiceId ||
    "Invoice";

  return (
    <View style={ui.screen}>
      {search.visible ? (
        <ListSearchField
          ref={search.inputRef}
          value={search.query}
          onChangeText={search.setQuery}
          onBlur={search.closeIfEmpty}
          autoFocus
          placeholder="Search invoices"
        />
      ) : null}

      {list.error && list.invoices.length === 0 ? (
        <Text style={ui.error}>{list.error}</Text>
      ) : null}

      <FlatList
        style={ui.screen}
        data={visibleInvoices}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        alwaysBounceVertical
        onScroll={search.onScroll}
        onScrollEndDrag={search.onScrollEndDrag}
        scrollEventThrottle={16}
        onEndReached={() => void list.loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing || revenue.refreshing}
            onRefresh={() => {
              void refreshAll();
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
        ListHeaderComponent={
          <View>
            <ContentPageTitle
              title="Invoices"
              trailing={<YearStepper year={year} onChange={setYear} />}
            />
            <View style={styles.chartHeader}>
              {revenue.error ? (
                <Text style={ui.error}>{revenue.error}</Text>
              ) : null}
              {revenue.loading && revenue.months.length === 0 ? (
                <View style={styles.chartLoading}>
                  <ActivityIndicator color={colors.muted} />
                </View>
              ) : (
                <InvoiceRevenueChart points={chartPoints} year={year} />
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          list.loading ? null : (
            <Text style={ui.empty}>
              {debounced ? "No matching invoices." : "No invoices."}
            </Text>
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
  chartHeader: {
    paddingHorizontal: spacing.screenX,
    paddingBottom: 8,
    gap: 12,
  },
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  yearChevron: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  yearPressed: {
    backgroundColor: colors.rowPressed,
  },
  yearDisabled: {
    opacity: 0.3,
  },
  yearChevronGlyph: {
    color: colors.foreground,
    fontSize: 20,
    lineHeight: 22,
  },
  yearLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    minWidth: 48,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  chartLoading: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
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
