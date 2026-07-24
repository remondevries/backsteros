"use client";

import {
  ProductContentTabs,
  getNavigationItemIcon,
} from "@backsteros/ui";

import { useAppTabs } from "@/components/app-tabs-provider";

const ProjectsIcon = getNavigationItemIcon("projects");

function TabIcon() {
  if (!ProjectsIcon) return null;
  return (
    <span className="content-tab-icon" aria-hidden="true">
      <ProjectsIcon />
    </span>
  );
}

export function ConsoleAppTabs() {
  const { tabs, activeTabId, activateTab, closeTab, openNewTab } = useAppTabs();

  return (
    <ProductContentTabs
      tabs={tabs}
      activeTabId={activeTabId}
      onActivateTab={activateTab}
      onCloseTab={closeTab}
      onOpenNewTab={openNewTab}
      renderTabIcon={() => <TabIcon />}
    />
  );
}
