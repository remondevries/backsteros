import { useNavigation } from "expo-router/react-navigation";
import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";

import { FinanceRecurringsPane } from "../../../components/finance/finance-recurrings-pane";
import { isPadDevice } from "../../../lib/device";
import { rememberFinanceSection } from "../../../lib/finance-section-memory";
import { financePadSectionHeaderOptions } from "../../../lib/pad-aware-detail-header";

export default function FinanceRecurringsScreen() {
  const isPad = isPadDevice();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    if (!isPad) return;
    navigation.setOptions(financePadSectionHeaderOptions());
  }, [isPad, navigation]);

  if (!isPad) {
    rememberFinanceSection("recurrings");
    return <Redirect href="/finance" />;
  }

  return <FinanceRecurringsPane />;
}
