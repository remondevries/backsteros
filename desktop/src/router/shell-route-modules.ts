import { lazy, type ComponentType, type LazyExoticComponent } from "react";

type ScreenModule = Record<string, ComponentType<any>>;

export type ShellLazyPage = {
  load: () => Promise<{ default: ComponentType<object> }>;
  Page: LazyExoticComponent<ComponentType<object>>;
  isReady: () => boolean;
  subscribeReady: (listener: () => void) => () => void;
};

function createSharedLazyPage<K extends string>(
  importFn: () => Promise<ScreenModule>,
  exportName: K,
): ShellLazyPage {
  let modulePromise: Promise<{ default: ComponentType<object> }> | null = null;
  let ready = false;
  const readyListeners = new Set<() => void>();
  const load = () => {
    modulePromise ??= importFn().then((module) => {
      ready = true;
      for (const listener of readyListeners) listener();
      return {
        default: module[exportName] as ComponentType<object>,
      };
    });
    return modulePromise;
  };
  return {
    load,
    Page: lazy(load),
    isReady: () => ready,
    subscribeReady: (listener) => {
      readyListeners.add(listener);
      if (ready) listener();
      return () => {
        readyListeners.delete(listener);
      };
    },
  };
}

export const areasPage = createSharedLazyPage(
  () => import("../screens/areas-page"),
  "AreasPage",
);
export const developmentPage = createSharedLazyPage(
  () => import("../screens/development-page"),
  "DevelopmentPage",
);
export const contactsPage = createSharedLazyPage(
  () => import("../screens/contacts-page"),
  "ContactsPage",
);
export const emailPage = createSharedLazyPage(
  () => import("../screens/email-page"),
  "EmailPage",
);
export const habitTrackerPage = createSharedLazyPage(
  () => import("../screens/habit-tracker-page"),
  "HabitTrackerPage",
);
export const journalPage = createSharedLazyPage(
  () => import("../screens/journal-page"),
  "JournalPage",
);
export const knowledgePage = createSharedLazyPage(
  () => import("../screens/knowledge-page"),
  "KnowledgePage",
);
export const lettersPage = createSharedLazyPage(
  () => import("../screens/letters-page"),
  "LettersPage",
);
export const financePage = createSharedLazyPage(
  () => import("../screens/finance-page"),
  "FinancePage",
);
export const organizationsPage = createSharedLazyPage(
  () => import("../screens/organizations-page"),
  "OrganizationsPage",
);
export const projectsPage = createSharedLazyPage(
  () => import("../screens/projects-page"),
  "ProjectsPage",
);
export const settingsPage = createSharedLazyPage(
  () => import("../screens/settings-page"),
  "SettingsPage",
);
export const calendarPage = createSharedLazyPage(
  () => import("../screens/calendar-page"),
  "CalendarPage",
);
export const meetingDetailPage = createSharedLazyPage(
  () => import("../screens/meeting-detail-page"),
  "MeetingDetailPage",
);
export const taskDetailPage = createSharedLazyPage(
  () => import("../screens/task-detail-page"),
  "TaskDetailPage",
);
export const inboxPage = createSharedLazyPage(
  () => import("../screens/inbox-page"),
  "InboxPage",
);
export const taskListPage = createSharedLazyPage(
  () => import("../screens/task-list-page"),
  "TaskListPage",
);
export const journalV2Page = createSharedLazyPage(
  () => import("../screens/journal-v2-page"),
  "JournalV2Page",
);
export const habitTrackerV2Page = createSharedLazyPage(
  () => import("../screens/habit-tracker-v2-page"),
  "HabitTrackerV2Page",
);
export const knowledgeV2Page = createSharedLazyPage(
  () => import("../screens/knowledge-v2-page"),
  "KnowledgeV2Page",
);
export const lettersV2Page = createSharedLazyPage(
  () => import("../screens/letters-v2-page"),
  "LettersV2Page",
);
export const navigationTrailPage = createSharedLazyPage(
  () => import("../screens/navigation-trail-page"),
  "NavigationTrailPage",
);
export const notFoundPage = createSharedLazyPage(
  () => import("../screens/not-found-page"),
  "NotFoundPage",
);

const ALL_PAGES = [
  areasPage,
  developmentPage,
  contactsPage,
  emailPage,
  habitTrackerPage,
  journalPage,
  knowledgePage,
  lettersPage,
  financePage,
  organizationsPage,
  projectsPage,
  settingsPage,
  calendarPage,
  meetingDetailPage,
  taskDetailPage,
  inboxPage,
  taskListPage,
  navigationTrailPage,
  notFoundPage,
];

/** Warm route chunks using the same promises React.lazy resolves. */
export function preloadShellRouteChunks(): Promise<void> {
  return Promise.all(ALL_PAGES.map((page) => page.load())).then(() => undefined);
}

if (typeof window !== "undefined") {
  void preloadShellRouteChunks();
}
