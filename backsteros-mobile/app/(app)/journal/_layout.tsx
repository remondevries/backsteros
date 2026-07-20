import { Stack } from "expo-router";

import {
  tabDetailScreenOptions,
  tabRootScreenOptions,
} from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

export default function JournalLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="index" options={tabRootScreenOptions("Journal")} />
      <Stack.Screen name="[dateSlug]" options={tabDetailScreenOptions()} />
    </Stack>
  );
}
