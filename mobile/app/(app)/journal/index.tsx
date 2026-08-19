import { Stack } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { JournalHeader } from "../../../components/journal-header";
import { JournalListPane } from "../../../components/journal-list-pane";
import { isPadDevice } from "../../../lib/device";
import { ui } from "../../../lib/ui";

/**
 * Phone: full-screen journal list.
 * iPad: detail pane placeholder — list lives in the layout; selection
 * auto-opens today (or the first entry).
 */
export default function JournalScreen() {
  const [createTodayError, setCreateTodayError] = useState<string | null>(null);

  if (isPadDevice()) {
    return (
      <View style={styles.empty}>
        <Text style={ui.empty}>Select a journal entry.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          header: () => (
            <JournalHeader onCreateTodayError={setCreateTodayError} />
          ),
        }}
      />
      <JournalListPane createTodayError={createTodayError} />
    </>
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
