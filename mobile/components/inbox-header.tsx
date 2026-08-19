import { useRouter } from "expo-router";

import {
  TabStackHeader,
  TabStackHeaderPlusButton,
} from "../lib/tab-stack-options";
import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";

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
export function InboxHeader({
  onToggleCollapse,
}: {
  onToggleCollapse?: () => void;
} = {}) {
  return (
    <TabStackHeader
      title="Inbox"
      leadingActions={<InboxHeaderPlus chrome="glass" />}
      trailingActions={
        onToggleCollapse ? (
          <PadSidePanelCollapseButton
            onCollapse={onToggleCollapse}
            accessibilityLabel="Hide Inbox list"
          />
        ) : null
      }
    />
  );
}
