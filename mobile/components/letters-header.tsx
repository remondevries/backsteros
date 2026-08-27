import { useRouter } from "expo-router";

import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import { TabStackHeaderPlusButton } from "../lib/tab-stack-options";
import { SectionListHeader } from "./section-list-header";

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
    <SectionListHeader
      title="Letters"
      plusControl={<LettersHeaderPlus chrome="glass" />}
      trailingControl={
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
