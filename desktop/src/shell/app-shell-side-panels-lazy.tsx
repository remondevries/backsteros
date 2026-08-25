/**
 * Lazy wrappers for non-default side panels so AppShell's initial parse does
 * not pull finance/calendar/knowledge/… panel code. Inbox stays a static
 * import from `app-shell-inbox-side-panel` (default route).
 *
 * All of these resolve to the same async chunk on first non-inbox panel use.
 */
import { lazy, type ComponentType } from "react";

function lazyPanel(exportName: string) {
  return lazy(async () => {
    const mod = (await import("./app-shell-side-panels")) as unknown as Record<
      string,
      ComponentType<any>
    >;
    const Component = mod[exportName];
    if (!Component) {
      throw new Error(`Missing side panel export: ${exportName}`);
    }
    return { default: Component };
  });
}

export const DesktopCalendarTasksSidePanel = lazyPanel(
  "DesktopCalendarTasksSidePanel",
);
export const DesktopCalendarAvailabilitySidePanel = lazyPanel(
  "DesktopCalendarAvailabilitySidePanel",
);
export const DesktopCalendarTimetrackingSidePanel = lazyPanel(
  "DesktopCalendarTimetrackingSidePanel",
);
export const DesktopContactsSidePanel = lazyPanel("DesktopContactsSidePanel");
export const DesktopFinanceSidePanel = lazyPanel("DesktopFinanceSidePanel");
export const DesktopHabitSidePanel = lazyPanel("DesktopHabitSidePanel");
export const DesktopJournalSidePanel = lazyPanel("DesktopJournalSidePanel");
export const DesktopKnowledgeSidePanel = lazyPanel(
  "DesktopKnowledgeSidePanel",
);
export const DesktopLettersSidePanel = lazyPanel("DesktopLettersSidePanel");
export const DesktopOrganizationsSidePanel = lazyPanel(
  "DesktopOrganizationsSidePanel",
);
export const DesktopProjectDocumentsSidePanel = lazyPanel(
  "DesktopProjectDocumentsSidePanel",
);
