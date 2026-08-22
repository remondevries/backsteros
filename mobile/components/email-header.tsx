import { useRouter } from "expo-router";

import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import {
  TabStackHeader,
  TabStackHeaderPlusButton,
} from "../lib/tab-stack-options";

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

/** iPad list-pane header (outside the detail stack). */
export function EmailHeader({
  onToggleCollapse,
}: {
  onToggleCollapse?: () => void;
} = {}) {
  return (
    <TabStackHeader
      title="Email"
      leadingActions={<EmailHeaderPlus chrome="glass" />}
      trailingActions={
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
