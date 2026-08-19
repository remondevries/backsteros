import { Stack } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { JournalHeader } from "../../../components/journal-header";
import { JournalListPane } from "../../../components/journal-list-pane";
import { isPadDevice } from "../../../lib/device";
import {
  PadContentFrame,
  PadSidePanelCollapsedRail,
  usePadSidePanelCollapsed,
} from "../../../lib/pad-side-panel-collapse";
import {
  tabDetailScreenOptions,
  tabRootScreenOptions,
} from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

const LIST_PANE_WIDTH = 256;

function padDetailOptions() {
  return {
    ...tabDetailScreenOptions({ embedded: true }),
    // Title + Whoop live in scrolling content — no empty sticky header.
    headerShown: false,
    headerBackVisible: false,
  };
}

export default function JournalLayout() {
  const [createTodayError, setCreateTodayError] = useState<string | null>(null);
  const { collapsed, setCollapsed } = usePadSidePanelCollapsed("journal");

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

  return (
    <View style={styles.split}>
      {collapsed ? (
        <PadSidePanelCollapsedRail
          onExpand={() => setCollapsed(false)}
          accessibilityLabel="Show Journal list"
        />
      ) : (
        <View style={styles.listPane}>
          <JournalHeader
            onCreateTodayError={setCreateTodayError}
            onToggleCollapse={() => setCollapsed(true)}
          />
          <View style={styles.listBody}>
            <JournalListPane
              autoSelectFirst
              createTodayError={createTodayError}
            />
          </View>
        </View>
      )}
      <PadContentFrame>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.surface },
            headerStyle: { backgroundColor: colors.surface },
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.surface },
            }}
          />
          <Stack.Screen
            name="[dateSlug]"
            options={{
              ...padDetailOptions(),
              animation: "fade",
              animationDuration: 220,
            }}
          />
        </Stack>
      </PadContentFrame>
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
    minHeight: 0,
    backgroundColor: colors.background,
  },
  listBody: {
    flex: 1,
    minHeight: 0,
  },
});
