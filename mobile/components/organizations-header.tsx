import { useRouter } from "expo-router";

import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import {
  TabStackHeader,
  TabStackHeaderPlusButton,
} from "../lib/tab-stack-options";

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
    <TabStackHeader
      title="Organizations"
      leadingActions={<OrganizationsHeaderPlus chrome="glass" />}
      trailingActions={
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
