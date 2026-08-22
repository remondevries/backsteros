import { Stack } from "expo-router";

import { iosStackGestureOptions } from "../../../lib/tab-stack-options";

import { colors } from "../../../lib/theme";

export default function AreasLayout() {
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
          title: "Areas",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}
