import { useRouter } from "expo-router";

import {
  TabStackHeader,
  TabStackHeaderPlusButton,
} from "../lib/tab-stack-options";

/** Inbox list header — plus opens create-task. */
export function InboxHeader() {
  const router = useRouter();

  return (
    <TabStackHeader
      title="Inbox"
      leadingActions={
        <TabStackHeaderPlusButton
          onPress={() => router.push("/(app)/inbox/new")}
          accessibilityLabel="Create inbox task"
        />
      }
    />
  );
}
