import { Stack } from "expo-router";

import { tabDetailScreenOptions } from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

export default function TasksLayout() {
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
          title: "Tasks",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen name="new" options={tabDetailScreenOptions()} />
      <Stack.Screen name="[id]" options={tabDetailScreenOptions()} />
    </Stack>
  );
}
