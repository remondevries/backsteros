import { Stack } from "expo-router";
import { useState } from "react";

import { JournalHeader } from "../../../components/journal-header";
import { JournalListPane } from "../../../components/journal-list-pane";
import { isPadDevice } from "../../../lib/device";
import { PadSplitLayout } from "../../../lib/layout/index";
import {
  tabDetailScreenOptions,
  tabRootScreenOptions,
  iosStackGestureOptions,
} from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

const LIST_PANE_WIDTH = 256;

function padDetailOptions() {
  return {
    ...tabDetailScreenOptions({ embedded: true }),
    headerShown: false,
    headerBackVisible: false,
  };
}

export default function JournalLayout() {
  const [createTodayError, setCreateTodayError] = useState<string | null>(null);

  if (!isPadDevice()) {
    return (
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          ...iosStackGestureOptions,
        }}
      >
        <Stack.Screen name="index" options={tabRootScreenOptions("Journal")} />
        <Stack.Screen name="[dateSlug]" options={tabDetailScreenOptions()} />
      </Stack>
    );
  }

  return (
    <PadSplitLayout
      panelKey="journal"
      listPaneWidth={LIST_PANE_WIDTH}
      expandAccessibilityLabel="Show Journal list"
      listHeader={({ onToggleCollapse }) => (
        <JournalHeader
          onCreateTodayError={setCreateTodayError}
          onToggleCollapse={onToggleCollapse}
        />
      )}
      listBody={
        <JournalListPane autoSelectFirst createTodayError={createTodayError} />
      }
    >
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.surface },
          headerStyle: { backgroundColor: colors.surface },
          ...iosStackGestureOptions,
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
    </PadSplitLayout>
  );
}
