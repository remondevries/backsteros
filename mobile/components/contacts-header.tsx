import { useRouter } from "expo-router";

import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import {
  TabStackHeader,
  TabStackHeaderPlusButton,
} from "../lib/tab-stack-options";

export function ContactsHeaderPlus({
  chrome = "plain",
}: {
  chrome?: "glass" | "plain";
}) {
  const router = useRouter();

  return (
    <TabStackHeaderPlusButton
      chrome={chrome}
      onPress={() => router.push("/create/contact")}
      accessibilityLabel="Create contact"
    />
  );
}

export function ContactsHeader({
  onToggleCollapse,
}: {
  onToggleCollapse?: () => void;
} = {}) {
  return (
    <TabStackHeader
      title="Contacts"
      leadingActions={<ContactsHeaderPlus chrome="glass" />}
      trailingActions={
        onToggleCollapse ? (
          <PadSidePanelCollapseButton
            onCollapse={onToggleCollapse}
            accessibilityLabel="Hide Contacts list"
          />
        ) : null
      }
    />
  );
}
