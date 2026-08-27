import { Stack, useLocalSearchParams } from "expo-router";

import { MeetingDetailScreen } from "../../components/meeting-detail-screen";
import { tabDetailScreenOptions } from "../../lib/tab-stack-options";

/** Root-stack meeting detail — deep links from notifications and calendar. */
export default function RootMeetingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const meetingId = typeof id === "string" ? id : id?.[0];

  return (
    <>
      <Stack.Screen options={tabDetailScreenOptions()} />
      <MeetingDetailScreen meetingId={meetingId} />
    </>
  );
}
