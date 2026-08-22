import { Text, View } from "react-native";

import { EmailHeaderPlus } from "../../../components/email-header";
import { EmailListPane } from "../../../components/email-list-pane";
import { isPadDevice } from "../../../lib/device";
import { ui } from "../../../lib/ui";

/**
 * Phone: full-screen email list.
 * iPad: detail pane placeholder — list lives in the layout; selection
 * auto-opens the first email (desktop side-panel parity).
 */
export default function EmailScreen() {
  if (isPadDevice()) {
    return (
      <View style={styles.empty}>
        <Text style={ui.empty}>Select an email from the list.</Text>
      </View>
    );
  }

  return (
    <EmailListPane
      pageTitle="Email"
      pageTitleSafeArea
      pageTitleTrailing={<EmailHeaderPlus chrome="glass" />}
    />
  );
}

const styles = {
  empty: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "transparent",
    paddingHorizontal: 24,
  },
};
