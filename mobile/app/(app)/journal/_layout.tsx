import { Stack } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { JournalHeader } from "../../../components/journal-header";
import { JournalListPane } from "../../../components/journal-list-pane";
import { isPadDevice } from "../../../lib/device";
import {
  tabDetailScreenOptions,
  tabRootScreenOptions,
} from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

const LIST_PANE_WIDTH = 320;

export default function JournalLayout() {
  const [createTodayError, setCreateTodayError] = useState<string | null>(null);

  if (!isPadDevice()) {
    return (
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="index" options={tabRootScreenOptions("Journal")} />
        <Stack.Screen name="[dateSlug]" options={tabDetailScreenOptions()} />
      </Stack>
    );
  }

  // iPad: desktop-style list | detail — list stays mounted; Stack shows
  // index (empty) or [dateSlug] (entry) in the detail pane.
  return (
    <View style={styles.split}>
      <View style={styles.listPane}>
        <JournalHeader onCreateTodayError={setCreateTodayError} />
        <View style={styles.listBody}>
          <JournalListPane
            autoSelectFirst
            rowLayout="sidePanel"
            createTodayError={createTodayError}
          />
        </View>
      </View>
      <View style={styles.detailPane}>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.background },
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="[dateSlug]"
            options={{
              ...tabDetailScreenOptions(),
              headerBackVisible: false,
              animation: "fade",
              animationDuration: 220,
            }}
          />
        </Stack>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    backgroundColor: colors.background,
  },
  listPane: {
    width: LIST_PANE_WIDTH,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    minHeight: 0,
  },
  listBody: {
    flex: 1,
    minHeight: 0,
  },
  detailPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
});
