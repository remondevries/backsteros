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

/** Tab label for a task: `CI-33 Title` (display id + title). */
export function formatConsoleTaskTabTitle(
  displayId?: string | null,
  taskTitle?: string | null,
): string {
  const id = displayId?.trim() || "";
  const title = taskTitle?.trim() || "";
  if (id && title) return `${id} ${title}`;
  if (id) return id;
  if (title) return title;
  return "Task";
}

export function getConsoleTabTitle(
  href: string,
  options: {
    projectName?: string | null;
    taskTitle?: string | null;
    taskDisplayId?: string | null;
  } = {},
): string {
  const route = consoleRouteFromHref(href);
  if (route.settings) {
    return "Settings";
  }
  if (route.inbox) {
    if (route.taskId) {
      return formatConsoleTaskTabTitle(
        options.taskDisplayId,
        options.taskTitle,
      );
    }
    return "Inbox";
  }
  if (!route.projectId) {
    return "Projects";
  }
  const projectName = options.projectName?.trim() || "Project";
  if (route.taskId) {
    return formatConsoleTaskTabTitle(options.taskDisplayId, options.taskTitle);
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
  if (route.githubListTab === "files") {
    return `${projectName} · Files`;
  }
  if (route.githubListTab === "tasks") {
    return `${projectName} · Tasks`;
  }
  return projectName;
}
