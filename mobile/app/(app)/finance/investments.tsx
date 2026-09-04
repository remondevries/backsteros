import { useNavigation } from "expo-router/react-navigation";
import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";

import { FinanceInvestmentsPane } from "../../../components/finance/finance-investments-pane";
import { isPadDevice } from "../../../lib/device";
import { financePadSectionHeaderOptions } from "../../../lib/pad-aware-detail-header";
import { rememberFinanceSection } from "../../../lib/finance-section-memory";

export default function FinanceInvestmentsScreen() {
  const isPad = isPadDevice();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    if (!isPad) return;
    navigation.setOptions(
      financePadSectionHeaderOptions({ title: "Investments" }),
    );
  }, [isPad, navigation]);

  if (!isPad) {
    rememberFinanceSection("investments");
    return <Redirect href="/finance" />;
  }

  return <FinanceInvestmentsPane />;
}
