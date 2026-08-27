import { useRouter } from "expo-router";

import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import { TabStackHeaderPlusButton } from "../lib/tab-stack-options";
import { SectionListHeader } from "./section-list-header";

export function OrganizationsHeaderPlus({
  chrome = "plain",
}: {
  chrome?: "glass" | "plain";
}) {
  const router = useRouter();

  return (
    <TabStackHeaderPlusButton
      chrome={chrome}
      onPress={() => router.push("/create/organization")}
      accessibilityLabel="Create organization"
    />
  );
}

export function OrganizationsHeader({
  onToggleCollapse,
}: {
  onToggleCollapse?: () => void;
} = {}) {
  return (
    <SectionListHeader
      title="Organizations"
      plusControl={<OrganizationsHeaderPlus chrome="glass" />}
      trailingControl={
        onToggleCollapse ? (
          <PadSidePanelCollapseButton
            onCollapse={onToggleCollapse}
            accessibilityLabel="Hide Organizations list"
          />
        ) : null
      }
    />
  );
}
