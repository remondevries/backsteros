/** Persisted width for the BacksterOS task-detail rail (between nav and chat). */
export const TASK_DETAIL_PANEL_WIDTH_STORAGE_KEY = "backsteros_task_detail_panel_width";

export const TASK_DETAIL_PANEL_DEFAULT_WIDTH = 380;
export const TASK_DETAIL_PANEL_MIN_WIDTH = 280;
/** Leave enough room for the chat column while dragging. */
export const TASK_DETAIL_PANEL_MAIN_CONTENT_MIN_WIDTH = 40 * 16;

export function resolveTaskDetailPanelMaximumWidth(
  viewportWidth: number,
  reservedLeftWidth = 0,
): number {
  return Math.max(
    TASK_DETAIL_PANEL_MIN_WIDTH,
    Math.floor(viewportWidth) - reservedLeftWidth - TASK_DETAIL_PANEL_MAIN_CONTENT_MIN_WIDTH,
  );
}

export function resolveInitialTaskDetailPanelWidth(
  storedWidth: number | null,
  viewportWidth: number,
  reservedLeftWidth = 0,
): number {
  const preferredWidth =
    storedWidth === null
      ? TASK_DETAIL_PANEL_DEFAULT_WIDTH
      : Math.max(TASK_DETAIL_PANEL_MIN_WIDTH, storedWidth);
  return Math.min(
    preferredWidth,
    resolveTaskDetailPanelMaximumWidth(viewportWidth, reservedLeftWidth),
  );
}

export function clampTaskDetailPanelWidth(
  width: number,
  viewportWidth: number,
  reservedLeftWidth = 0,
): number {
  const maxWidth = resolveTaskDetailPanelMaximumWidth(viewportWidth, reservedLeftWidth);
  return Math.max(TASK_DETAIL_PANEL_MIN_WIDTH, Math.min(width, maxWidth));
}
