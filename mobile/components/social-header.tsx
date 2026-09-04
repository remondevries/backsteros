import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import { SectionListHeader } from "./section-list-header";

export function SocialHeader({
  onToggleCollapse,
}: {
  onToggleCollapse?: () => void;
} = {}) {
  return (
    <SectionListHeader
      title="Social"
      trailingControl={
        onToggleCollapse ? (
          <PadSidePanelCollapseButton
            onCollapse={onToggleCollapse}
            accessibilityLabel="Hide Social list"
          />
        ) : null
      }
    />
  );
}
