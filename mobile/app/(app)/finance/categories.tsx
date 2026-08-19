import { useNavigation } from "@react-navigation/native";
import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";

import { FinanceCategoriesPane } from "../../../components/finance/finance-categories-pane";
import { isPadDevice } from "../../../lib/device";
import { rememberFinanceSection } from "../../../lib/finance-section-memory";
import { financePadSectionHeaderOptions } from "../../../lib/pad-aware-detail-header";

/**
 * iPad stack route for Categories. On phone, redirect into the Finance home shell.
 */
export default function FinanceCategoriesScreen() {
  const isPad = isPadDevice();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    if (!isPad) return;
    navigation.setOptions(financePadSectionHeaderOptions());
  }, [isPad, navigation]);

  if (!isPad) {
    rememberFinanceSection("categories");
    return <Redirect href="/finance" />;
  }

  return <FinanceCategoriesPane />;
}
