import { useRouter } from "expo-router";

import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import { TabStackHeaderPlusButton } from "../lib/tab-stack-options";
import { SectionListHeader } from "./section-list-header";

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
    <SectionListHeader
      title="Contacts"
      plusControl={<ContactsHeaderPlus chrome="glass" />}
      trailingControl={
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
