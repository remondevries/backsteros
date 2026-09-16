import type { ReactNode } from "react";

import { CollapseLayoutIcon } from "@backsteros/ui";

import { DesktopCollapsibleRightSidePanelLayout } from "../components/desktop-journal-day-layout";

const DOMAIN_PROJECT_SIDE_PANEL_WIDTH_KEY = "domain-project-side-panel-width";

export type DomainProjectWorkbenchProps = {
  /** Left column — project task list. */
  tasksPanel: ReactNode;
  /** Right rail — domain details (`DomainDetailView`). */
  children: ReactNode;
  /**
   * When set (Catalog Domains More… workspace), show a collapse control that
   * returns to the domain list — same affordance as contacts/orgs.
   */
  onCollapse?: () => void;
};

/**
 * Domain project full-screen layout: task list (left) + domain details (right).
 */
export function DomainProjectWorkbench({
  tasksPanel,
  children,
  onCollapse,
}: DomainProjectWorkbenchProps) {
  return (
    <DesktopCollapsibleRightSidePanelLayout
      storageKey={DOMAIN_PROJECT_SIDE_PANEL_WIDTH_KEY}
      panelAriaLabel="Domain details"
      showPanelLabel="Show domain details"
      hidePanelLabel="Hide domain details"
      defaultWidth={360}
      minWidth={280}
      maxWidth={560}
      chromeStart={
        onCollapse ? (
          <button
            type="button"
            className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
            onClick={onCollapse}
            aria-label="Collapse domain workspace"
            title="Collapse"
          >
            <CollapseLayoutIcon size={14} />
          </button>
        ) : null
      }
      main={
        <div className="domain-project-workbench__tasks" data-list-board-view>
          {tasksPanel}
        </div>
      }
      sidePanel={
        <div className="contact-detail-panel__body catalog-domains-side-panel__body">
          {children}
        </div>
      }
    />
  );
}
