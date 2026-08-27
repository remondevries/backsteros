import { useRouter } from "expo-router";

import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import { TabStackHeaderPlusButton } from "../lib/tab-stack-options";
import { SectionListHeader } from "./section-list-header";

/** Native stack `headerRight` — plain so iOS liquid glass wraps once. */
export function EmailHeaderPlus({
  chrome = "plain",
}: {
  chrome?: "glass" | "plain";
}) {
  const router = useRouter();

  return (
    <TabStackHeaderPlusButton
      chrome={chrome}
      onPress={() => router.push("/(app)/email/compose")}
      accessibilityLabel="Compose email"
    />
  );
}

/** List header — phone stack or iPad list pane. */
export function EmailHeader({
  onToggleCollapse,
}: {
  onToggleCollapse?: () => void;
} = {}) {
  return (
    <SectionListHeader
      title="Email"
      plusControl={<EmailHeaderPlus chrome="glass" />}
      trailingControl={
        onToggleCollapse ? (
          <PadSidePanelCollapseButton
            onCollapse={onToggleCollapse}
            accessibilityLabel="Hide Email list"
          />
        ) : null
      }
    />
  );
}
