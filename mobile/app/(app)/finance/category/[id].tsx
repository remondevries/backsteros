import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLayoutEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { TransactionList } from "../../../../components/finance/transaction-list";
import { rememberFinanceSection } from "../../../../lib/finance-section-memory";
import { padAwareDetailHeaderOptions } from "../../../../lib/pad-aware-detail-header";
import { useFinanceDetailBack } from "../../../../lib/use-finance-detail-back";
import { colors } from "../../../../lib/theme";
import { useFinanceCategories } from "../../../../lib/use-finance-categories";

export default function FinanceCategoryScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const onBack = useFinanceDetailBack("categories");

  const categories = useFinanceCategories();
  const category = categories.rows.find((row) => row.id === id) ?? null;

  useLayoutEffect(() => {
    rememberFinanceSection("categories");
    navigation.setOptions(
      padAwareDetailHeaderOptions({
        onBack,
      }),
    );
  }, [navigation, onBack]);

  const baseFilters = useMemo(() => ({ categoryId: id }), [id]);

  return (
    <TransactionList
      baseFilters={baseFilters}
      categories={categories.rows}
      emptyText="No transactions in this category."
      pageTitle={category?.name ?? "Category"}
      pageTitleTrailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit category"
          hitSlop={10}
          onPress={() =>
            router.push({
              pathname: "/finance/category-form",
              params: { id },
            })
          }
        >
          <Text style={styles.editLabel}>Edit</Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  editLabel: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
});
