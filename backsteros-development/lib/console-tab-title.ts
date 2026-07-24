import { normalizeTabHref } from "@backsteros/ui";

import { parseConsoleSlug } from "@/lib/console-path";

function pathParts(href: string): string[] {
  return normalizeTabHref(href)
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

export function consoleRouteFromHref(href: string) {
  return parseConsoleSlug(pathParts(href));
}

export function getConsoleTabTitle(
  href: string,
  options: {
    projectName?: string | null;
    taskTitle?: string | null;
  } = {},
): string {
  const route = consoleRouteFromHref(href);
  if (route.settings) {
    return "Settings";
  }
  if (route.inbox) {
    const taskTitle = options.taskTitle?.trim();
    return taskTitle ? `Inbox · ${taskTitle}` : "Inbox";
  }
  if (!route.projectId) {
    return "Projects";
  }
  const projectName = options.projectName?.trim() || "Project";
  const taskTitle = options.taskTitle?.trim();
  if (route.taskId && taskTitle) {
    return `${projectName} · ${taskTitle}`;
  }
  if (route.commitSha) {
    if (route.pullNumber != null) {
      return `${projectName} · PR #${route.pullNumber} · Commit`;
    }
    return `${projectName} · Commit`;
  }
  if (route.pullNumber != null) {
    return `${projectName} · PR #${route.pullNumber}`;
  }
  if (route.githubListTab === "pulls") {
    return `${projectName} · Pulls`;
  }
  if (route.githubListTab === "commits") {
    return `${projectName} · Commits`;
  }
  return projectName;
}
