import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import { InboxHeader } from "../../../components/inbox-header";
import { InboxListPane } from "../../../components/inbox-list-pane";
import { isPadDevice } from "../../../lib/device";
import {
  PadSidePanelCollapsedRail,
  usePadSidePanelCollapsed,
} from "../../../lib/pad-side-panel-collapse";
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
  const { collapsed, setCollapsed } = usePadSidePanelCollapsed("inbox");

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
    <View style={styles.split}>
      {collapsed ? (
        <PadSidePanelCollapsedRail
          onExpand={() => setCollapsed(false)}
          accessibilityLabel="Show Inbox list"
        />
      ) : (
        <View style={styles.listPane}>
          <InboxHeader onToggleCollapse={() => setCollapsed(true)} />
          <View style={styles.listBody}>
            <InboxListPane autoSelectFirst />
          </View>
        </View>
      )}
      {/*
        Canvas column (not PadContentFrame): task screens own their own detail
        card + floating agent. Empty index / new still wrap in PadContentFrame.
      */}
      <View style={styles.canvas}>
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
    minHeight: 0,
    backgroundColor: colors.background,
  },
  listBody: {
    flex: 1,
    minHeight: 0,
  },
  canvas: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: colors.background,
  },
});
