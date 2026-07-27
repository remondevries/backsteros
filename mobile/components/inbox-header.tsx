import { useRouter } from "expo-router";

import {
  TabStackHeader,
  TabStackHeaderPlusButton,
} from "../lib/tab-stack-options";

/** Native stack `headerRight` — plain so iOS liquid glass wraps once. */
export function InboxHeaderPlus({
  chrome = "plain",
}: {
  chrome?: "glass" | "plain";
}) {
  const router = useRouter();

  return (
    <TabStackHeaderPlusButton
      chrome={chrome}
      onPress={() => router.push("/(app)/inbox/new")}
      accessibilityLabel="Create inbox task"
    />
  );
}

/** iPad list-pane header (outside the detail stack). */
export function InboxHeader() {
  return (
    <TabStackHeader
      title="Inbox"
      leadingActions={<InboxHeaderPlus chrome="glass" />}
    />
  );
}
