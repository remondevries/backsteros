import { Stack } from "expo-router";

import { colors } from "../../../lib/theme";

export default function AreasLayout() {
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
          title: "Areas",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}
