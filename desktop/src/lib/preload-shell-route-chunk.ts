import {
  parseNavigationPathname,
  resolvePendingPageSurface,
  type PendingPageSurface,
} from "./pending-navigation-routes";
import { KEEP_ALIVE_SURFACES } from "./shell-warm-keep-alive";
import {
  areasPage,
  calendarPage,
  contactsPage,
  developmentPage,
  emailPage,
  financePage,
  habitTrackerPage,
  inboxPage,
  journalPage,
  knowledgePage,
  lettersPage,
  meetingDetailPage,
  organizationsPage,
  projectsPage,
  settingsPage,
  taskDetailPage,
  taskListPage,
  journalV2Page,
  habitTrackerV2Page,
  knowledgeV2Page,
  lettersV2Page,
  type ShellLazyPage,
} from "../router/shell-route-modules";

const SURFACE_PAGES: Partial<Record<PendingPageSurface, ShellLazyPage>> = {
  inbox: inboxPage,
  email: emailPage,
  "journal-day": journalPage,
  "journal-habits": habitTrackerPage,
  "tasks-list": taskListPage,
  "journal-v2": journalV2Page,
  "habits-v2": habitTrackerV2Page,
  "knowledge-v2": knowledgeV2Page,
  "letters-v2": lettersV2Page,
  "task-detail": taskDetailPage,
  calendar: calendarPage,
  "meeting-detail": meetingDetailPage,
  areas: areasPage,
  projects: projectsPage,
  knowledge: knowledgePage,
  letters: lettersPage,
  finance: financePage,
  contacts: contactsPage,
  organizations: organizationsPage,
  settings: settingsPage,
  development: developmentPage,
};

function shellPageForHref(href: string): ShellLazyPage | undefined {
  return SURFACE_PAGES[resolvePendingPageSurface(href)];
}

const SIDE_PANEL_LOADERS: Partial<
  Record<PendingPageSurface, () => Promise<unknown>>
> = {
  calendar: () =>
    Promise.all([
      import("../shell/side-panels/calendar-tasks-side-panel"),
      import("../shell/side-panels/calendar-availability-side-panel"),
      import("../shell/side-panels/calendar-timetracking-side-panel"),
    ]),
  "journal-day": () => import("../shell/side-panels/journal-side-panel"),
  "journal-habits": () => import("../shell/side-panels/habit-side-panel"),
  "habits-v2": () => import("../shell/side-panels/habit-side-panel"),
  contacts: () => import("../shell/side-panels/contacts-side-panel"),
  organizations: () => import("../shell/side-panels/organizations-side-panel"),
  finance: () => import("../shell/side-panels/finance-side-panel"),
  knowledge: () => import("../shell/side-panels/knowledge-side-panel"),
  "knowledge-v2": () => import("../shell/side-panels/knowledge-side-panel"),
  letters: () => import("../shell/side-panels/letters-side-panel"),
  "letters-v2": () => import("../shell/side-panels/letters-side-panel"),
  projects: () => import("../shell/side-panels/project-documents-side-panel"),
};

/** Side-panel modules are a second lazy() graph — first visit used to wait on them. */
export function preloadShellSidePanelForHref(href: string): void {
  const loader = SIDE_PANEL_LOADERS[resolvePendingPageSurface(href)];
  if (loader) void loader();
}

export function preloadShellSidePanels(): Promise<void> {
  return Promise.all(
    Object.values(SIDE_PANEL_LOADERS).map((load) => load()),
  ).then(() => undefined);
}

/** Warm the lazy chunk for a pending navigation target. */
export function preloadShellRouteChunkForHref(href: string): void {
  const page = shellPageForHref(href);
  if (page) void page.load();
  preloadShellSidePanelForHref(href);
}

/**
 * Keep-alive section pages + their side-panel chunks. No finance/email/settings.
 * Does not fetch journal markdown or letter PDFs.
 */
export function preloadKeepAliveSectionChunks(): void {
  for (const surface of KEEP_ALIVE_SURFACES) {
    const page = SURFACE_PAGES[surface];
    if (page) void page.load();
    const panel = SIDE_PANEL_LOADERS[surface];
    if (panel) void panel();
  }
}

/** Preload Go-palette destinations while the user picks a letter. */
export function preloadGoNavigationRouteChunks(): void {
  for (const href of [
    "/inbox",
    "/journal-v2",
    "/habits-v2",
    "/knowledge-v2",
    "/tasks",
    "/calendar",
    "/areas",
    "/projects",
    "/development",
    "/letters-v2",
    "/finance/dashboard",
    "/contacts",
    "/organizations",
  ]) {
    preloadShellRouteChunkForHref(href);
  }
  void calendarPage.load();
  void developmentPage.load();
  void financePage.load();
  void emailPage.load();
  void settingsPage.load();
  void habitTrackerPage.load();
  void organizationsPage.load();
  void taskDetailPage.load();
  void meetingDetailPage.load();
  void preloadShellSidePanels();
}

/** Preload from a pathname alone (sidebar hover, etc.). */
export function preloadShellRouteChunkForPathname(pathname: string): void {
  preloadShellRouteChunkForHref(parseNavigationPathname(pathname));
}

if (typeof window !== "undefined") {
  preloadKeepAliveSectionChunks();
}
