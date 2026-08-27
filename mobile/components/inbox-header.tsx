import { useRouter } from "expo-router";

import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import { TabStackHeaderPlusButton } from "../lib/tab-stack-options";
import { SectionListHeader } from "./section-list-header";

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
    <SectionListHeader
      title="Inbox"
      plusControl={<InboxHeaderPlus chrome="glass" />}
      trailingControl={
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
