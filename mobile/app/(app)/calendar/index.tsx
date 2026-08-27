import { Stack } from "expo-router";

import { CalendarScreen } from "../../../components/calendar/calendar-screen";

export default function CalendarIndexRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <CalendarScreen />
    </>
  );
}
