import type { ReactNode, RefObject } from "react";
import {
  EMAIL_PROPERTIES_PANEL_WIDTH_KEY,
  ResizableSidePanel,
  SegmentedPillToggle,
  type EmailThreadBodyViewMode,
} from "@backsteros/ui";

export type EmailDetailPropertiesRailProps = {
  panelRef?: RefObject<HTMLElement | null>;
  bodyViewMode: EmailThreadBodyViewMode;
  onBodyViewModeChange: (mode: EmailThreadBodyViewMode) => void;
  children: ReactNode;
};

export function EmailDetailPropertiesRail({
  panelRef,
  bodyViewMode,
  onBodyViewModeChange,
  children,
}: EmailDetailPropertiesRailProps) {
  return (
    <ResizableSidePanel
      storageKey={EMAIL_PROPERTIES_PANEL_WIDTH_KEY}
      className="detail-properties-panel email-detail-properties-rail"
      edge="start"
      panelRef={panelRef}
    >
      <div className="detail-properties-panel__inner">
        <div className="email-detail-view-toggle">
          <SegmentedPillToggle
            value={bodyViewMode}
            options={[
              { value: "plain", label: "Plain text" },
              { value: "rendered", label: "Rendered" },
              { value: "source", label: "Source" },
            ]}
            onChange={onBodyViewModeChange}
            ariaLabel="Email body view mode"
          />
        </div>
        {children}
      </div>
    </ResizableSidePanel>
  );
}
