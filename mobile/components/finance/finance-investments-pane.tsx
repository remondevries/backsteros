import { StyleSheet, Text, View } from "react-native";

import { ContentPageTitle } from "../content-page-title";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";

/**
 * Desktop parity for `/finance/investments` — dedicated product surface is
 * not built yet. Investment bank accounts still appear under Accounts.
 */
export function FinanceInvestmentsPane() {
  return (
    <View style={styles.wrap}>
      <ContentPageTitle title="Investments" />
      <Text style={styles.body}>Investments are coming soon.</Text>
      <Text style={styles.hint}>
        Investment accounts are available under Accounts and in the side nav
        Investments group.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...ui.screen,
    paddingBottom: spacing.screenX,
    gap: 10,
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: spacing.screenX,
  },
  hint: {
    color: colors.faint,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    paddingHorizontal: spacing.screenX,
  },
});
