import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import { SectionListHeader } from "./section-list-header";

export function SocialHeader({
  onToggleCollapse,
}: {
  onToggleCollapse?: () => void;
} = {}) {
  return (
    <SectionListHeader
      title="Network"
      trailingControl={
        onToggleCollapse ? (
          <PadSidePanelCollapseButton
            onCollapse={onToggleCollapse}
            accessibilityLabel="Hide Network list"
          />
        ) : null
      }
    />
  );
}
