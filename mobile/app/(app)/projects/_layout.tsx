import { Stack } from "expo-router";

import {tabDetailScreenOptions, iosStackGestureOptions} from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

export default function ProjectsLayout() {
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
          title: "Projects",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen name="new" options={tabDetailScreenOptions()} />
      <Stack.Screen name="[id]" options={tabDetailScreenOptions()} />
    </Stack>
  );
}
