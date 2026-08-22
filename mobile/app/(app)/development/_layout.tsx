import { Stack } from "expo-router";

import { iosStackGestureOptions } from "../../../lib/tab-stack-options";

import { colors } from "../../../lib/theme";

export default function DevelopmentLayout() {
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
          title: "Development",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}
