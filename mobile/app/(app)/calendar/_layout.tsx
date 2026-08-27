import { Stack } from "expo-router";

import { MeetingSchedulingSettingsProvider } from "../../../lib/use-meeting-scheduling-settings";

export default function CalendarLayout() {
  return (
    <MeetingSchedulingSettingsProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </MeetingSchedulingSettingsProvider>
  );
}
