import type { FinancialTransaction } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";

import {
  TransactionMonthHeader,
  TransactionWeekHeader,
} from "./transaction-group-headers";
import { TransactionListRow } from "./transaction-list-row";
import { ListSearchField } from "../list-search-field";
import { ContentPageTitle } from "../content-page-title";
import { isPadDevice } from "../../lib/device";
import type { TransactionFilters } from "../../lib/finance-api";
import type { FinanceCategoryRow } from "../../lib/finance-categories";
import {
  flattenTransactionGroups,
  groupTransactionsByMonthWeek,
  type TransactionListEntry,
} from "../../lib/group-transactions-by-month-week";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { colors } from "../../lib/theme";
import { ui } from "../../lib/ui";
import {
  useFinanceAccountAvatarSrcMap,
  useFinanceAccounts,
} from "../../lib/use-finance-accounts";
import { useFinanceTransactions } from "../../lib/use-finance-transactions";
import { useListJkNavigation } from "../../lib/use-list-jk-navigation";
import { useOrganizationNameMap } from "../../lib/use-organization-name-map";
import { usePullToRevealSearch } from "../../lib/use-pull-to-reveal-search";

const SEARCH_DEBOUNCE_MS = 300;

type Props = {
  /** Fixed scope (account / category / uncategorized); search is added on top. */
  baseFilters: Omit<TransactionFilters, "q" | "cursor" | "includeTotal">;
  categories: FinanceCategoryRow[];
  searchPlaceholder?: string;
  emptyText?: string;
  /** Scrolls with the list (not sticky). */
  pageTitle?: string;
  /** Same row as `pageTitle` (filter / add / edit). */
  pageTitleTrailing?: ReactNode;
  /** Extra header content below the title (e.g. account cashflow chart). */
  listHeaderExtra?: ReactNode;
  /** Invoked together with list refresh (pull-to-refresh). */
  onRefreshExtra?: () => void | Promise<void>;
};

type ListEntry = TransactionListEntry<FinancialTransaction>;

/**
 * Cursor-paginated transaction list with pull-to-reveal search and a
 * details/category bottom sheet.
 * - iPhone: month groups only
 * - iPad: month + week subgroups (desktop parity) + multi-column rows
 */
export function TransactionList({
  baseFilters,
  categories,
  searchPlaceholder = "Search transactions",
  emptyText = "No transactions.",
  pageTitle,
  pageTitleTrailing,
  listHeaderExtra,
  onRefreshExtra,
}: Props) {
  const router = useRouter();
  const isPad = isPadDevice();
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const filters = useMemo(
    () => ({ ...baseFilters, q: debouncedQuery || undefined }),
    [baseFilters, debouncedQuery],
  );
  const list = useFinanceTransactions(filters);
  const search = usePullToRevealSearch({ suppress: list.refreshing });
  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedQuery(search.query.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(handle);
  }, [search.query]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const accounts = useFinanceAccounts();
  const accountById = useMemo(
    () => new Map(accounts.rows.map((account) => [account.id, account])),
    [accounts.rows],
  );
  const accountAvatarSrcById = useFinanceAccountAvatarSrcMap(accounts.rows);
  const organizationNameById = useOrganizationNameMap();

  const openTransaction = useCallback(
    (transactionId: string) => {
      router.push(`/finance/transaction/${transactionId}`);
    },
    [router],
  );

  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleMonth = useCallback((monthKey: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }, []);
  const toggleWeek = useCallback((weekKey: string) => {
    setCollapsedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekKey)) next.delete(weekKey);
      else next.add(weekKey);
      return next;
    });
  }, []);

  const listEntries = useMemo(
    () =>
      flattenTransactionGroups(
        groupTransactionsByMonthWeek(list.transactions),
        {
          includeWeeks: isPad,
          collapsedMonths,
          collapsedWeeks: isPad ? collapsedWeeks : undefined,
        },
      ),
    [collapsedMonths, collapsedWeeks, isPad, list.transactions],
  );

  const listRef = useRef<FlatList<ListEntry>>(null);
  const itemIds = useMemo(
    () =>
      listEntries
        .filter(
          (entry): entry is Extract<ListEntry, { kind: "transaction" }> =>
            entry.kind === "transaction",
        )
        .map((entry) => entry.transaction.id),
    [listEntries],
  );
  const entryIndexByTransactionId = useMemo(() => {
    const map = new Map<string, number>();
    listEntries.forEach((entry, index) => {
      if (entry.kind === "transaction") map.set(entry.transaction.id, index);
    });
    return map;
  }, [listEntries]);

  const { highlightedId } = useListJkNavigation({
    itemIds,
    enabled: true,
    onActivate: openTransaction,
    onHighlightChange: (id) => {
      if (!id || !listRef.current) return;
      const index = entryIndexByTransactionId.get(id);
      if (index == null) return;
      try {
        listRef.current.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {
        // Ignore before layout.
      }
    },
  });

  const renderItem = ({ item }: ListRenderItemInfo<ListEntry>) => {
    if (item.kind === "month") {
      return (
        <TransactionMonthHeader
          label={item.label}
          totals={item.totals}
          showTotals={isPad}
          collapsed={collapsedMonths.has(item.monthKey)}
          onToggle={() => toggleMonth(item.monthKey)}
        />
      );
    }
    if (item.kind === "week") {
      return (
        <TransactionWeekHeader
          label={item.label}
          collapsed={collapsedWeeks.has(item.key)}
          onToggle={() => toggleWeek(item.key)}
        />
      );
    }

    const transaction = item.transaction;
    const category = transaction.categoryId
      ? (categoryById.get(transaction.categoryId) ?? null)
      : null;
    const account = accountById.get(transaction.bankAccountId) ?? null;
    return (
      <TransactionListRow
        transaction={transaction}
        density={isPad ? "pad" : "phone"}
        highlighted={highlightedId === transaction.id}
        category={category}
        accountName={account?.name ?? null}
        accountAvatarSrc={
          accountAvatarSrcById[transaction.bankAccountId] ?? null
        }
        organizationName={
          transaction.organizationId
            ? (organizationNameById[transaction.organizationId] ?? null)
            : null
        }
        onPress={() => openTransaction(transaction.id)}
      />
    );
  };

  if (list.loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (list.error && list.transactions.length === 0) {
    return <Text style={ui.error}>{list.error}</Text>;
  }

  return (
    <View style={ui.screen}>
      {search.visible ? (
        <ListSearchField
          ref={search.inputRef}
          value={search.query}
          onChangeText={search.setQuery}
          onBlur={search.closeIfEmpty}
          autoFocus
          placeholder={searchPlaceholder}
        />
      ) : null}
      <FlatList
        ref={listRef}
        style={ui.screen}
        data={listEntries}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        alwaysBounceVertical
        onScroll={search.onScroll}
        onScrollEndDrag={search.onScrollEndDrag}
        scrollEventThrottle={16}
        onEndReached={() => void list.loadMore()}
        onEndReachedThreshold={0.4}
        onScrollToIndexFailed={() => {}}
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={() => {
              void list.refresh();
              void onRefreshExtra?.();
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
        ListHeaderComponent={
          pageTitle || listHeaderExtra ? (
            <View>
              {pageTitle ? (
                <ContentPageTitle
                  title={pageTitle}
                  trailing={pageTitleTrailing}
                />
              ) : null}
              {listHeaderExtra}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={ui.empty}>
            {debouncedQuery ? "No matching transactions." : emptyText}
          </Text>
        }
        ListFooterComponent={
          list.loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.muted} size="small" />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingVertical: 16,
    alignItems: "center",
  },
});
