import { Stack } from "expo-router";

import { colors } from "../../../lib/theme";

export default function KnowledgeLayout() {
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
          title: "Knowledge Base",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}
