import { useNavigation } from "@react-navigation/native";
import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";

import { FinanceCashflowPane } from "../../../components/finance/finance-cashflow-pane";
import { isPadDevice } from "../../../lib/device";
import { financePadSectionHeaderOptions } from "../../../lib/pad-aware-detail-header";
import { rememberFinanceSection } from "../../../lib/finance-section-memory";

export default function FinanceCashflowScreen() {
  const isPad = isPadDevice();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    if (!isPad) return;
    navigation.setOptions(
      financePadSectionHeaderOptions({ title: "Cash Flow" }),
    );
  }, [isPad, navigation]);

  if (!isPad) {
    rememberFinanceSection("cashflow");
    return <Redirect href="/finance" />;
  }

  return <FinanceCashflowPane />;
}
