import { Stack } from "expo-router";

import { colors } from "../../../lib/theme";

export default function LettersLayout() {
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
          title: "Letters",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}
