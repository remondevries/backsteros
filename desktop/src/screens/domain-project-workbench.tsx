import type { ReactNode } from "react";

import { CollapseLayoutIcon, PillNav } from "@backsteros/ui";

import { DesktopCollapsibleRightSidePanelLayout } from "../components/desktop-journal-day-layout";

const DOMAIN_PROJECT_SIDE_PANEL_WIDTH_KEY = "domain-project-side-panel-width";

export type DomainProjectWorkbenchTab = "tasks" | "timetracking";

const DOMAIN_WORKBENCH_TABS: readonly {
  value: DomainProjectWorkbenchTab;
  label: string;
}[] = [
  { value: "tasks", label: "Tasks" },
  { value: "timetracking", label: "Timetracking" },
];

export type DomainProjectWorkbenchProps = {
  /** Left column — project task list. */
  tasksPanel: ReactNode;
  /** Left column — project time report (Timetracking tab). */
  timetrackingPanel?: ReactNode;
  activeTab?: DomainProjectWorkbenchTab;
  onTabChange?: (tab: DomainProjectWorkbenchTab) => void;
  /** Right rail — domain details (`DomainDetailView`). */
  children: ReactNode;
  /**
   * When set (Catalog Domains More… workspace), show a collapse control that
   * returns to the domain list — same affordance as contacts/orgs.
   */
  onCollapse?: () => void;
};

/**
 * Domain project full-screen layout: Tasks / Timetracking (left) + domain
 * details (right).
 */
export function DomainProjectWorkbench({
  tasksPanel,
  timetrackingPanel,
  activeTab = "tasks",
  onTabChange,
  children,
  onCollapse,
}: DomainProjectWorkbenchProps) {
  const showTabs = Boolean(timetrackingPanel && onTabChange);

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
        <div className="domain-project-workbench__main">
          {showTabs ? (
            <div className="projects-overview__area-nav domain-project-workbench__tabs">
              <PillNav
                ariaLabel="Project contents"
                className="projects-overview__area-pills"
                items={DOMAIN_WORKBENCH_TABS}
                value={activeTab}
                onChange={onTabChange!}
              />
            </div>
          ) : null}
          <div
            className={
              activeTab === "timetracking"
                ? "domain-project-workbench__timetracking"
                : "domain-project-workbench__tasks"
            }
            data-list-board-view={
              activeTab === "tasks" ? "" : undefined
            }
          >
            {activeTab === "timetracking"
              ? (timetrackingPanel ?? null)
              : tasksPanel}
          </div>
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
