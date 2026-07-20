import { Stack } from "expo-router";

import { InboxHeader } from "../../../components/inbox-header";
import {
  tabDetailScreenOptions,
} from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

export default function InboxLayout() {
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
          title: "Inbox",
          header: () => <InboxHeader />,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen name="new" options={tabDetailScreenOptions()} />
      <Stack.Screen name="[id]" options={tabDetailScreenOptions()} />
    </Stack>
  );
}
