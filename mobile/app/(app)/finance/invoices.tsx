import { useNavigation } from "expo-router/react-navigation";
import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";

import { FinanceInvoicesPane } from "../../../components/finance/finance-invoices-pane";
import { isPadDevice } from "../../../lib/device";
import { financePadSectionHeaderOptions } from "../../../lib/pad-aware-detail-header";
import { rememberFinanceSection } from "../../../lib/finance-section-memory";

export default function FinanceInvoicesScreen() {
  const isPad = isPadDevice();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    if (!isPad) return;
    navigation.setOptions(financePadSectionHeaderOptions({ title: "Invoices" }));
  }, [isPad, navigation]);

  if (!isPad) {
    rememberFinanceSection("invoices");
    return <Redirect href="/finance" />;
  }

  return <FinanceInvoicesPane />;
}
