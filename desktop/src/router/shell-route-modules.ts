import { lazy, type ComponentType, type LazyExoticComponent } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous component map; `LazyExoticComponent` is invariant in props
type ScreenModule<K extends string> = Record<K, ComponentType<any>>;

type ScreenProps<M, K extends keyof M> = M[K] extends ComponentType<infer P>
  ? P
  : never;

/**
 * `P` defaults to `any` so heterogeneous pages can be stored in one collection
 * (e.g. surface → page maps); call sites get the exact props via inference.
 * `never` does not work here because `LazyExoticComponent` is invariant.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
export type ShellLazyPage<P = any> = {
  load: () => Promise<{ default: ComponentType<P> }>;
  Page: LazyExoticComponent<ComponentType<P>>;
  isReady: () => boolean;
  subscribeReady: (listener: () => void) => () => void;
};

function createSharedLazyPage<M extends ScreenModule<K>, K extends string>(
  importFn: () => Promise<M>,
  exportName: K,
): ShellLazyPage<ScreenProps<M, K>> {
  type Props = ScreenProps<M, K>;
  let modulePromise: Promise<{ default: ComponentType<Props> }> | null = null;
  let ready = false;
  const readyListeners = new Set<() => void>();
  const load = () => {
    modulePromise ??= importFn().then((module) => {
      ready = true;
      for (const listener of readyListeners) listener();
      return {
        default: module[exportName] as ComponentType<Props>,
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
export const socialPage = createSharedLazyPage(
  () => import("../screens/social-page"),
  "SocialPage",
);
export const communicationPage = createSharedLazyPage(
  () => import("../screens/communication-page"),
  "CommunicationPage",
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
  socialPage,
  communicationPage,
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
