import { StyleSheet, Text, View } from "react-native";

import { InboxListPane } from "../../../components/inbox-list-pane";
import { isPadDevice } from "../../../lib/device";
import { PadContentFrame } from "../../../lib/pad-side-panel-collapse";
import { ui } from "../../../lib/ui";

/**
 * Phone: full-screen inbox list.
 * iPad: detail pane placeholder — list lives in the layout; selection
 * auto-opens the first task (desktop inbox parity).
 */
export default function InboxScreen() {
  if (isPadDevice()) {
    return (
      <PadContentFrame>
        <View style={styles.empty}>
          <Text style={ui.empty}>Inbox is empty.</Text>
        </View>
      </PadContentFrame>
    );
  }

  return <InboxListPane />;
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    paddingHorizontal: 24,
  },
});
