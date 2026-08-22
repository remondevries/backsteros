import { Stack } from "expo-router";

import { tabDetailScreenOptions, iosStackGestureOptions } from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

export default function TasksLayout() {
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
          title: "Tasks",
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
