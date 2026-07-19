"use client";

import { useState, type ComponentType, type ReactNode } from "react";

import {
  SETTINGS_NAV_TABS,
  SETTINGS_TAB_GROUP_ORDER,
  getSettingsSectionLabel,
  getSettingsTabFromPath,
  type SettingsTabGroup,
} from "../settings.js";
import { SidebarChevronIcon } from "./sidebar-nav-icons.js";

export type SettingsSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
  onClick?: () => void;
}>;

export type SettingsSidePanelNavViewProps = {
  pathname: string;
  Link: SettingsSidePanelLinkComponent;
  onBack?: () => void;
  onNavigate?: () => void;
  historyToolbar?: ReactNode;
};

export function SettingsSidePanelNavView({
  pathname,
  Link,
  onBack,
  onNavigate,
  historyToolbar,
}: SettingsSidePanelNavViewProps) {
  const activeTab = getSettingsTabFromPath(pathname);
  const [expandedSections, setExpandedSections] = useState<
    Record<SettingsTabGroup, boolean>
  >({
    general: true,
    integration: true,
  });

  const tabsBySection = SETTINGS_NAV_TABS.reduce(
    (acc, tab) => {
      acc[tab.group].push(tab);
      return acc;
    },
    { general: [], integration: [] } as Record<
      SettingsTabGroup,
      typeof SETTINGS_NAV_TABS
    >,
  );

  return (
    <nav
      aria-label="Settings"
      className="app-side-panel app-side-panel-settings"
    >
      {historyToolbar ? (
        <div className="app-side-panel-chrome">{historyToolbar}</div>
      ) : null}
      <div className="app-side-panel-scroll">
        <div className="app-side-panel-inner">
          <header className="app-side-panel-settings-header">
            {onBack ? (
              <button
                type="button"
                className="app-side-panel-settings-back"
                aria-label="Back to app"
                onClick={onBack}
              >
                <SidebarChevronIcon pointing="left" />
              </button>
            ) : (
              <Link
                to="/inbox"
                className="app-side-panel-settings-back"
                aria-current={undefined}
                onClick={onNavigate}
              >
                <SidebarChevronIcon pointing="left" />
              </Link>
            )}
            <h2 className="app-side-panel-settings-title">Settings</h2>
          </header>

          <div className="app-side-panel-list">
            {SETTINGS_TAB_GROUP_ORDER.map((sectionId) => {
              const tabs = tabsBySection[sectionId];
              if (tabs.length === 0) return null;
              const expanded = expandedSections[sectionId];

              return (
                <div key={sectionId} className="app-side-panel-section">
                  <button
                    type="button"
                    className="app-side-panel-section-toggle"
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedSections((current) => ({
                        ...current,
                        [sectionId]: !current[sectionId],
                      }))
                    }
                  >
                    <span className="app-side-panel-section-label">
                      {getSettingsSectionLabel(sectionId)}
                    </span>
                    <SidebarChevronIcon
                      className="app-side-panel-section-chevron"
                      expanded={expanded}
                    />
                  </button>
                  {expanded ? (
                    <div className="app-side-panel-section-items">
                      {tabs.map((tab) => {
                        const active = activeTab === tab.id;
                        return (
                          <Link
                            key={tab.id}
                            to={tab.href}
                            className={[
                              "app-side-panel-item",
                              "app-side-panel-item-settings",
                              active ? "app-side-panel-item-active" : null,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            aria-current={active ? "page" : undefined}
                            onClick={onNavigate}
                          >
                            <span className="app-side-panel-item-label">
                              {tab.label}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
