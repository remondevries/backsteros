"use client";

import {
  DotScrollLoader,
  ProductContentTabs,
  TaskStatusIcon,
  getNavigationItemIcon,
  isTaskStatus,
  type ProductTab,
  type TaskStatus,
} from "@backsteros/ui";

import { useAppTabs } from "@/components/app-tabs-provider";
import { consoleRouteFromHref } from "@/lib/console-tab-title";

const ProjectsIcon = getNavigationItemIcon("projects");
const InboxIcon = getNavigationItemIcon("inbox");
const SettingsIcon = getNavigationItemIcon("settings");

function resolveTabTaskId(tab: ProductTab): string | null {
  if (tab.taskId) return tab.taskId;
  const route = consoleRouteFromHref(tab.href);
  return route.taskId;
}

function TabIcon({
  tab,
  working,
}: {
  tab: ProductTab;
  working: boolean;
}) {
  if (working) {
    return (
      <span className="content-tab-icon" aria-hidden="true">
        <DotScrollLoader
          className="task-sync-loader"
          aria-label="Agent working"
        />
      </span>
    );
  }

  const status =
    tab.taskStatus && isTaskStatus(tab.taskStatus)
      ? (tab.taskStatus as TaskStatus)
      : null;
  if (status) {
    return (
      <span className="content-tab-icon" aria-hidden="true">
        <TaskStatusIcon status={status} size={14} className="shrink-0" />
      </span>
    );
  }

  const route = consoleRouteFromHref(tab.href);
  let Icon = ProjectsIcon;
  if (route.settings) {
    Icon = SettingsIcon;
  } else if (route.inbox) {
    Icon = InboxIcon;
  }

  if (!Icon) return null;
  return (
    <span className="content-tab-icon" aria-hidden="true">
      <Icon />
    </span>
  );
}

export function ConsoleAppTabs() {
  const { tabs, activeTabId, activateTab, closeTab, openNewTab, workingTaskIds } =
    useAppTabs();

  return (
    <ProductContentTabs
      tabs={tabs}
      activeTabId={activeTabId}
      onActivateTab={activateTab}
      onCloseTab={closeTab}
      onOpenNewTab={openNewTab}
      renderTabIcon={(tab) => {
        const taskId = resolveTabTaskId(tab);
        return (
          <TabIcon
            tab={tab}
            working={Boolean(taskId && workingTaskIds.has(taskId))}
          />
        );
      }}
    />
  );
}
