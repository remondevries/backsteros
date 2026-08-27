import { Stack } from "expo-router";

import { InboxHeader } from "../../../components/inbox-header";
import { InboxListPane } from "../../../components/inbox-list-pane";
import { isPadDevice } from "../../../lib/device";
import { PadSplitLayout } from "../../../lib/layout/index";
import {tabDetailScreenOptions, iosStackGestureOptions} from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

const LIST_PANE_WIDTH = 360;

/**
 * iPad task routes: black canvas (not transparent, not surface). Transparent
 * stack layers were revealing the empty-index PadContentFrame / a full-width
 * surface under Chat; only the left column should be carded.
 */
function padTaskSurfaceOptions() {
  return {
    ...tabDetailScreenOptions({ embedded: false }),
    headerShown: false,
    headerBackVisible: false,
    contentStyle: { backgroundColor: colors.background },
    headerStyle: { backgroundColor: colors.background },
  };
}

export default function InboxLayout() {
  if (!isPadDevice()) {
    return (
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          ...iosStackGestureOptions,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            header: () => <InboxHeader />,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen name="new" options={tabDetailScreenOptions()} />
        <Stack.Screen name="[id]" options={tabDetailScreenOptions()} />
        <Stack.Screen
          name="email/[inboxId]/[messageId]"
          options={tabDetailScreenOptions()}
        />
        <Stack.Screen name="email/compose" options={tabDetailScreenOptions()} />
      </Stack>
    );
  }

  return (
    <PadSplitLayout
      panelKey="inbox"
      listPaneWidth={LIST_PANE_WIDTH}
      frameDetail={false}
      expandAccessibilityLabel="Show Inbox list"
      listHeader={({ onToggleCollapse }) => (
        <InboxHeader onToggleCollapse={onToggleCollapse} />
      )}
      listBody={<InboxListPane autoSelectFirst />}
    >
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: colors.background },
          ...iosStackGestureOptions,
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
          name="new"
          options={{
            ...padTaskSurfaceOptions(),
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="[id]"
          options={{
            ...padTaskSurfaceOptions(),
            animation: "fade",
            animationDuration: 220,
          }}
        />
        <Stack.Screen
          name="email/[inboxId]/[messageId]"
          options={{
            ...padTaskSurfaceOptions(),
            animation: "fade",
            animationDuration: 220,
          }}
        />
        <Stack.Screen
          name="email/compose"
          options={padTaskSurfaceOptions()}
        />
      </Stack>
    </PadSplitLayout>
  );
}
