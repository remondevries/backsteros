"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SidebarNavHistoryControls } from "@/components/shell/sidebar-nav-history-controls";
import { SidebarChevronIcon } from "@/components/shell/sidebar-nav-icons";
import {
  getSettingsSectionLabel,
  getSettingsTabFromPath,
  SETTINGS_NAV_TABS,
  SETTINGS_TAB_GROUP_ORDER,
  type SettingsTabGroup,
} from "@/lib/settings/tabs";

function SettingsNavItem({
  label,
  href,
  active,
  onNavigate,
}: {
  label: string;
  href: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      className={[
        "app-side-panel-item",
        "app-side-panel-item-settings",
        active ? "app-side-panel-item-active" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-current={active ? "page" : undefined}
      onClick={() => onNavigate?.()}
    >
      <span className="app-side-panel-item-label">{label}</span>
    </Link>
  );
}

function SettingsNavSection({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="app-side-panel-section">
      <button
        type="button"
        className="app-side-panel-section-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="app-side-panel-section-label">{label}</span>
        <SidebarChevronIcon
          className="app-side-panel-section-chevron"
          expanded={expanded}
        />
      </button>
      {expanded ? (
        <div className="app-side-panel-section-items">{children}</div>
      ) : null}
    </div>
  );
}

type SettingsSidePanelNavProps = {
  onNavigate?: () => void;
};

export function SettingsSidePanelNav({
  onNavigate,
}: SettingsSidePanelNavProps = {}) {
  const pathname = usePathname();
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
      className="app-side-panel app-side-panel-settings h-full w-full"
    >
      <div className="app-side-panel-chrome">
        <div className="app-side-panel-inner app-side-panel-inner-chrome">
          <SidebarNavHistoryControls />
        </div>
      </div>
      <div className="app-side-panel-scroll">
        <div className="app-side-panel-inner">
          <header className="app-side-panel-settings-header">
            <Link
              href="/"
              className="app-side-panel-settings-back"
              aria-label="Back to app"
              onClick={() => onNavigate?.()}
            >
              <SidebarChevronIcon
                className="app-side-panel-settings-back-icon"
                pointing="left"
              />
            </Link>
            <h2 className="app-side-panel-settings-title">Settings</h2>
          </header>

          <div className="app-side-panel-list">
            {SETTINGS_TAB_GROUP_ORDER.map((sectionId) => {
              const tabs = tabsBySection[sectionId];
              if (tabs.length === 0) {
                return null;
              }

              return (
                <SettingsNavSection
                  key={sectionId}
                  label={getSettingsSectionLabel(sectionId)}
                  expanded={expandedSections[sectionId]}
                  onToggle={() => {
                    setExpandedSections((current) => ({
                      ...current,
                      [sectionId]: !current[sectionId],
                    }));
                  }}
                >
                  {tabs.map((tab) => (
                    <SettingsNavItem
                      key={tab.id}
                      label={tab.label}
                      href={tab.href}
                      active={activeTab === tab.id}
                      onNavigate={onNavigate}
                    />
                  ))}
                </SettingsNavSection>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
