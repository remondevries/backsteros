import { Text, View } from "react-native";

import { InboxListPane } from "../../../components/inbox-list-pane";
import { isPadDevice } from "../../../lib/device";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";

/**
 * Phone: full-screen inbox list.
 * iPad: detail pane placeholder — list lives in the layout; selection
 * auto-opens the first task (desktop inbox parity).
 */
export default function InboxScreen() {
  if (isPadDevice()) {
    return (
      <View style={styles.empty}>
        <Text style={ui.empty}>Select a task from the inbox.</Text>
      </View>
    );
  }

  return <InboxListPane />;
}

const styles = {
  empty: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
};
