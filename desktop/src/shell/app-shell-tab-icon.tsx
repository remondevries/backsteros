import { createElement } from "react";

import {
  HistoryEntryIcon,
  isEmailPath,
  isInboxPath,
  resolveHistoryEntryDisplay,
  resolveProductTabTaskMeta,
  type ProductTab,
} from "@backsteros/ui";

import {
  isTaskAgentWorkingForUi,
} from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import { useDesktopWorkspaceTasks } from "../lib/workspace-data";

export function renderAppShellTabIcon(tab: ProductTab) {
  return createElement(AppShellTabIcon, { tab });
}

function AppShellTabIcon({ tab }: { tab: ProductTab }) {
  const { allTasks } = useDesktopWorkspaceTasks();
  const agentStatus = useDesktopAgentStatusOptional();

  if (isInboxPath(tab.href)) {
    return createElement(HistoryEntryIcon, {
      display: {
        kind: "navigate",
        navId: "inbox",
        badgeLabel: "Inbox",
        title: tab.title,
      },
    });
  }
  if (isEmailPath(tab.href)) {
    return createElement(HistoryEntryIcon, {
      display: {
        kind: "navigate",
        navId: "email",
        badgeLabel: "Email",
        title: tab.title,
      },
    });
  }
  const meta = resolveProductTabTaskMeta(tab, allTasks);
  const working = Boolean(
    meta.taskId &&
      isTaskAgentWorkingForUi(
        { id: meta.taskId, status: meta.taskStatus },
        agentStatus,
      ),
  );
  return createElement(HistoryEntryIcon, {
    display: resolveHistoryEntryDisplay(tab.href, tab.title),
    icon: tab.icon,
    taskStatus: meta.taskStatus,
    working,
  });
}
