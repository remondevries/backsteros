import { useNavigation } from "@react-navigation/native";
import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";

import { FinanceGoalsPane } from "../../../components/finance/finance-goals-pane";
import { isPadDevice } from "../../../lib/device";
import { rememberFinanceSection } from "../../../lib/finance-section-memory";
import { financePadSectionHeaderOptions } from "../../../lib/pad-aware-detail-header";

export default function FinanceGoalsScreen() {
  const isPad = isPadDevice();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    if (!isPad) return;
    navigation.setOptions(financePadSectionHeaderOptions());
  }, [isPad, navigation]);

  if (!isPad) {
    rememberFinanceSection("goals");
    return <Redirect href="/finance" />;
  }

  return <FinanceGoalsPane />;
}
