import { Stack } from "expo-router";

import { colors } from "../../../lib/theme";

export default function ContactsLayout() {
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
          title: "Contacts",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}
