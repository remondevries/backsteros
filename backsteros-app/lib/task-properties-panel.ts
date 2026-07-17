export const TASK_PROPERTIES_PANEL_WIDTH_KEY = "task-properties-panel-width";

export const LEGACY_INBOX_TASK_PROPERTIES_PANEL_WIDTH_KEY =
  "inbox-task-properties-panel-width";

export const TASK_PROPERTIES_PANEL_LEGACY_WIDTH_KEYS = [
  LEGACY_INBOX_TASK_PROPERTIES_PANEL_WIDTH_KEY,
];

export function isTaskDetailPath(pathname: string): boolean {
  return (
    /^\/inbox\/[^/]+$/.test(pathname) ||
    /^\/projects\/[^/]+\/tasks\/[^/]+$/.test(pathname) ||
    /^\/organizations\/[^/]+\/projects\/[^/]+\/tasks\/[^/]+$/.test(pathname) ||
    /^\/contacts\/[^/]+\/tasks\/[^/]+$/.test(pathname) ||
    /^\/organizations\/[^/]+\/contacts\/[^/]+\/tasks\/[^/]+$/.test(pathname) ||
    /^\/tasks\/[^/]+\/[^/]+$/.test(pathname)
  );
}
