import { useRouter } from "expo-router";

import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import {
  TabStackHeader,
  TabStackHeaderPlusButton,
} from "../lib/tab-stack-options";

/** Native stack `headerRight` — plain so iOS liquid glass wraps once. */
export function LettersHeaderPlus({
  chrome = "plain",
}: {
  chrome?: "glass" | "plain";
}) {
  const router = useRouter();

  return (
    <TabStackHeaderPlusButton
      chrome={chrome}
      onPress={() => router.push("/create/letter")}
      accessibilityLabel="Create letter"
    />
  );
}

/** iPad list-pane header (outside the detail stack). */
export function LettersHeader({
  onToggleCollapse,
}: {
  onToggleCollapse?: () => void;
} = {}) {
  return (
    <TabStackHeader
      title="Letters"
      leadingActions={<LettersHeaderPlus chrome="glass" />}
      trailingActions={
        onToggleCollapse ? (
          <PadSidePanelCollapseButton
            onCollapse={onToggleCollapse}
            accessibilityLabel="Hide Letters list"
          />
        ) : null
      }
    />
  );
}
