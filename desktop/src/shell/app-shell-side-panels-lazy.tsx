/**
 * Lazy side-panel entry points — one async chunk per domain so opening
 * Calendar does not download Finance/Journal panel code.
 *
 * Inbox stays eager via `app-shell-inbox-side-panel` (default cold-start route).
 */
import { lazy } from "react";

export const DesktopCalendarSidePanel = lazy(() =>
  import("./side-panels/calendar-side-panel").then((m) => ({
    default: m.DesktopCalendarSidePanel,
  })),
);

export const DesktopCalendarTasksSidePanel = lazy(() =>
  import("./side-panels/calendar-tasks-side-panel").then((m) => ({
    default: m.DesktopCalendarTasksSidePanel,
  })),
);

export const DesktopCalendarAvailabilitySidePanel = lazy(() =>
  import("./side-panels/calendar-availability-side-panel").then((m) => ({
    default: m.DesktopCalendarAvailabilitySidePanel,
  })),
);

export const DesktopCalendarTimetrackingSidePanel = lazy(() =>
  import("./side-panels/calendar-timetracking-side-panel").then((m) => ({
    default: m.DesktopCalendarTimetrackingSidePanel,
  })),
);

export const DesktopContactsSidePanel = lazy(() =>
  import("./side-panels/contacts-side-panel").then((m) => ({
    default: m.DesktopContactsSidePanel,
  })),
);

export const DesktopFinanceSidePanel = lazy(() =>
  import("./side-panels/finance-side-panel").then((m) => ({
    default: m.DesktopFinanceSidePanel,
  })),
);

export const DesktopHabitSidePanel = lazy(() =>
  import("./side-panels/habit-side-panel").then((m) => ({
    default: m.DesktopHabitSidePanel,
  })),
);

export const DesktopJournalSidePanel = lazy(() =>
  import("./side-panels/journal-side-panel").then((m) => ({
    default: m.DesktopJournalSidePanel,
  })),
);

export const DesktopKnowledgeSidePanel = lazy(() =>
  import("./side-panels/knowledge-side-panel").then((m) => ({
    default: m.DesktopKnowledgeSidePanel,
  })),
);

export const DesktopLettersSidePanel = lazy(() =>
  import("./side-panels/letters-side-panel").then((m) => ({
    default: m.DesktopLettersSidePanel,
  })),
);

export const DesktopOrganizationsSidePanel = lazy(() =>
  import("./side-panels/organizations-side-panel").then((m) => ({
    default: m.DesktopOrganizationsSidePanel,
  })),
);

export const DesktopProjectDocumentsSidePanel = lazy(() =>
  import("./side-panels/project-documents-side-panel").then((m) => ({
    default: m.DesktopProjectDocumentsSidePanel,
  })),
);
