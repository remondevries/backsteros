/** Pad past traffic lights + fixed sidebar trigger when the main nav is collapsed. */
export const COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS =
  "[[data-sidebar-state=collapsed]_&]:pl-[var(--workspace-titlebar-content-left)]";

/**
 * Same inset for chat / main titlebars, but skipped when the BacksterOS task
 * detail rail is open (`data-task-detail-open` on the sidebar wrapper). That
 * rail already clears the traffic lights, so applying the inset again leaves
 * a dead gap between the rail and the breadcrumb.
 */
export const MAIN_COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS =
  "[[data-sidebar-state=collapsed]:not([data-task-detail-open=true])_&]:pl-[var(--workspace-titlebar-content-left)]";
