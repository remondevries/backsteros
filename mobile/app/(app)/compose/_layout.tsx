import { Stack } from "expo-router";

import { colors } from "../../../lib/theme";

export default function ComposeLayout() {
  return (
    <Stack
      screenOptions={{
        title: "",
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerTitleAlign: "left",
        headerTitleStyle: {
          color: colors.foreground,
          fontWeight: "600",
          fontSize: 22,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
