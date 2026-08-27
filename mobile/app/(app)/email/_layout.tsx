import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import { EmailHeader } from "../../../components/email-header";
import { EmailListPane } from "../../../components/email-list-pane";
import { isPadDevice } from "../../../lib/device";
import {
  PadContentFrame,
  PadSidePanelCollapsedRail,
  usePadSidePanelCollapsed,
} from "../../../lib/pad-side-panel-collapse";
import {tabDetailScreenOptions, iosStackGestureOptions} from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

const LIST_PANE_WIDTH = 360;

function padDetailOptions() {
  return {
    ...tabDetailScreenOptions({ embedded: true }),
    headerBackVisible: false,
  };
}

/**
 * Email section — phone: full-screen stack; iPad: master-detail split with
 * the message list on the left (desktop email side-panel parity).
 */
export default function EmailLayout() {
  const { collapsed, setCollapsed } = usePadSidePanelCollapsed("email");

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
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen name="compose" options={tabDetailScreenOptions()} />
        <Stack.Screen
          name="[inboxId]/[messageId]"
          options={tabDetailScreenOptions()}
        />
      </Stack>
    );
  }

  return (
    <View style={styles.split}>
      {collapsed ? (
        <PadSidePanelCollapsedRail
          onExpand={() => setCollapsed(false)}
          accessibilityLabel="Show Email list"
        />
      ) : (
        <View style={styles.listPane}>
          <EmailHeader onToggleCollapse={() => setCollapsed(true)} />
          <View style={styles.listBody}>
            <EmailListPane autoSelectFirst />
          </View>
        </View>
      )}
      <PadContentFrame>
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
          <Stack.Screen name="compose" options={padDetailOptions()} />
          <Stack.Screen
            name="[inboxId]/[messageId]"
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
