import { useNavigation } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLayoutEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { TransactionList } from "../../../../components/finance/transaction-list";
import { rememberFinanceSection } from "../../../../lib/finance-section-memory";
import { padAwareDetailHeaderOptions } from "../../../../lib/pad-aware-detail-header";
import { useFinanceDetailBack } from "../../../../lib/use-finance-detail-back";
import { colors } from "../../../../lib/theme";
import { useFinanceCategories } from "../../../../lib/use-finance-categories";
import { useFinanceRecurrings } from "../../../../lib/use-finance-recurrings";

export default function FinanceRecurringScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const onBack = useFinanceDetailBack("recurrings");

  const recurrings = useFinanceRecurrings();
  const categories = useFinanceCategories();
  const recurring = recurrings.rows.find((row) => row.id === id) ?? null;

  useLayoutEffect(() => {
    rememberFinanceSection("recurrings");
    navigation.setOptions(
      padAwareDetailHeaderOptions({
        onBack,
      }),
    );
  }, [navigation, onBack]);

  const baseFilters = useMemo(() => ({ recurringId: id }), [id]);

  return (
    <TransactionList
      baseFilters={baseFilters}
      categories={categories.rows}
      emptyText="No transactions linked to this recurring."
      pageTitle={recurring?.name ?? "Recurring"}
      pageTitleTrailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit recurring"
          hitSlop={10}
          onPress={() =>
            router.push({
              pathname: "/finance/recurring-form",
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
