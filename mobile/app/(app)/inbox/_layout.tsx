import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import { InboxHeader, InboxHeaderPlus } from "../../../components/inbox-header";
import { InboxListPane } from "../../../components/inbox-list-pane";
import { isPadDevice } from "../../../lib/device";
import { tabDetailScreenOptions } from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

const LIST_PANE_WIDTH = 360;

export default function InboxLayout() {
  if (!isPadDevice()) {
    return (
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
            // Native header so interactive pop keeps liquid-glass back chrome
            // (custom `header:` replacements drop the glass mid-swipe).
            title: "Inbox",
            headerRight: () => <InboxHeaderPlus />,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen name="new" options={tabDetailScreenOptions()} />
        <Stack.Screen name="[id]" options={tabDetailScreenOptions()} />
      </Stack>
    );
  }

  // iPad: desktop-style list | detail — list stays mounted; Stack shows
  // index (empty), [id] (task), or new (compose) in the detail pane.
  return (
    <View style={styles.split}>
      <View style={styles.listPane}>
        <InboxHeader />
        <View style={styles.listBody}>
          <InboxListPane autoSelectFirst />
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
          <Stack.Screen name="new" options={tabDetailScreenOptions()} />
          <Stack.Screen
            name="[id]"
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
