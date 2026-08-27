import {
  createRootRoute,
  createRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { DesktopOverlayRouteSync } from "../components/desktop-overlay-route-sync";
import {
  PersistLastLocation,
  StartupRedirect,
} from "../components/startup-location";
import { DesktopProviders } from "../lib/desktop-providers";
import { isDesktopOverlayPath } from "../lib/desktop-overlay";
import { DesktopOverlayComposePage } from "../screens/desktop-overlay-compose-page";
import { DesktopOverlayPalettePage } from "../screens/desktop-overlay-palette-page";
import { OauthPopupDonePage } from "../screens/oauth-popup-done-page";
import { SsoCallbackPage } from "../screens/sso-callback-page";
import { validateTasksListSearch } from "./routes/tasks.route";
import { validateCalendarSearch } from "./routes/calendar.route";
import {
  AreasPage,
  CalendarPage,
  CalendarScopedMeetingDetailPage,
  CalendarScopedTaskDetailPage,
  ContactScopedLetterPage,
  ContactScopedTaskDetailPage,
  ContactsPage,
  DevelopmentPage,
  EmailPage,
  FinancePage,
  InboxPage,
  NotFoundPage,
  OrgContactScopedLetterPage,
  OrgContactScopedTaskDetailPage,
  OrgProjectScopedTaskDetailPage,
  OrgScopedContactsPage,
  OrgScopedProjectsPage,
  OrganizationsPage,
  ProjectScopedTaskDetailPage,
  ProjectsPage,
  SettingsPage,
  ShellLayout,
  TaskDetailPage,
  TaskListPage,
  JournalV2Page,
  HabitTrackerV2Page,
  KnowledgeV2Page,
  LettersV2Page,
} from "./shell-layout";

function RootLayout() {
  const enablePowerSync = !isDesktopOverlayPath(window.location.pathname);
  return (
    <DesktopProviders enablePowerSync={enablePowerSync}>
      <DesktopOverlayRouteSync />
      <PersistLastLocation />
      <Outlet />
    </DesktopProviders>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return children;
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const overlayPaletteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop-overlay/palette",
  component: DesktopOverlayPalettePage,
});

const overlayComposeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop-overlay/compose",
  component: DesktopOverlayComposePage,
});

const ssoCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sso-callback",
  component: SsoCallbackPage,
});

const oauthPopupDoneRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/popup-done",
  component: OauthPopupDonePage,
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: ShellLayout,
  notFoundComponent: () => (
    <LazyRoute>
      <NotFoundPage />
    </LazyRoute>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  component: StartupRedirect,
});

const inboxRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "inbox",
  component: () => (
    <LazyRoute>
      <InboxPage />
    </LazyRoute>
  ),
});

const inboxDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "inbox/$itemId",
  component: () => (
    <LazyRoute>
      <InboxPage />
    </LazyRoute>
  ),
});

const emailRedirectRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "email",
  beforeLoad: () => {
    throw redirect({ to: "/inbox", replace: true });
  },
});

const emailComposeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "email/compose",
  component: () => (
    <LazyRoute>
      <EmailPage />
    </LazyRoute>
  ),
});

const emailDraftRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "email/$inboxId/drafts/$draftId",
  component: () => (
    <LazyRoute>
      <EmailPage />
    </LazyRoute>
  ),
});

const emailMessageRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "email/$inboxId/$messageId",
  component: () => (
    <LazyRoute>
      <EmailPage />
    </LazyRoute>
  ),
});

const journalIndexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "journal",
  beforeLoad: () => {
    throw redirect({ to: "/journal-v2" });
  },
});

const journalHabitsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "journal/habits",
  beforeLoad: () => {
    throw redirect({ to: "/habits-v2" });
  },
});

const journalHabitDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "journal/habits/$habitId",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/habits-v2/$habitId",
      params: { habitId: params.habitId },
    });
  },
});

const journalDateRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "journal/$dateSlug",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/journal-v2/$dateSlug",
      params: { dateSlug: params.dateSlug },
    });
  },
});

const tasksListRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "tasks",
  validateSearch: validateTasksListSearch,
  component: () => (
    <LazyRoute>
      <TaskListPage />
    </LazyRoute>
  ),
});

const journalV2ListRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "journal-v2",
  component: () => (
    <LazyRoute>
      <JournalV2Page />
    </LazyRoute>
  ),
});

const journalV2DateRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "journal-v2/$dateSlug",
  component: () => (
    <LazyRoute>
      <JournalV2Page />
    </LazyRoute>
  ),
});

const habitsV2ListRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "habits-v2",
  component: () => (
    <LazyRoute>
      <HabitTrackerV2Page />
    </LazyRoute>
  ),
});

const habitsV2DetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "habits-v2/$habitId",
  component: () => (
    <LazyRoute>
      <HabitTrackerV2Page />
    </LazyRoute>
  ),
});

const knowledgeV2Route = createRoute({
  getParentRoute: () => shellRoute,
  path: "knowledge-v2",
  component: () => <Outlet />,
});

const knowledgeV2IndexRoute = createRoute({
  getParentRoute: () => knowledgeV2Route,
  path: "/",
  component: () => (
    <LazyRoute>
      <KnowledgeV2Page />
    </LazyRoute>
  ),
});

const knowledgeV2SplatRoute = createRoute({
  getParentRoute: () => knowledgeV2Route,
  path: "$",
  component: () => (
    <LazyRoute>
      <KnowledgeV2Page />
    </LazyRoute>
  ),
});

const lettersV2Route = createRoute({
  getParentRoute: () => shellRoute,
  path: "letters-v2",
  component: () => (
    <LazyRoute>
      <LettersV2Page />
    </LazyRoute>
  ),
});

const lettersV2DetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "letters-v2/$slug",
  component: () => (
    <LazyRoute>
      <LettersV2Page />
    </LazyRoute>
  ),
});

const tasksDueFilterDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "tasks/$dueFilter/$taskSlug",
  component: () => (
    <LazyRoute>
      <TaskDetailPage />
    </LazyRoute>
  ),
});

const tasksDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "tasks/$taskId",
  component: () => (
    <LazyRoute>
      <TaskDetailPage />
    </LazyRoute>
  ),
});

const calendarRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "calendar",
  validateSearch: validateCalendarSearch,
  component: () => (
    <LazyRoute>
      <CalendarPage />
    </LazyRoute>
  ),
});

const calendarTaskDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "calendar/tasks/$taskId",
  component: CalendarScopedTaskDetailPage,
});

const calendarMeetingDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "calendar/meetings/$meetingId",
  component: CalendarScopedMeetingDetailPage,
});

const areasRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "areas",
  component: () => (
    <LazyRoute>
      <AreasPage />
    </LazyRoute>
  ),
});

const projectsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects",
  component: () => (
    <LazyRoute>
      <ProjectsPage />
    </LazyRoute>
  ),
});

const developmentRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "development",
  component: () => (
    <LazyRoute>
      <DevelopmentPage />
    </LazyRoute>
  ),
});

const projectTaskDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects/$slug/tasks/$taskSlug",
  component: ProjectScopedTaskDetailPage,
});

const projectDocumentsSplatRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects/$slug/documents/$",
  component: () => (
    <LazyRoute>
      <ProjectsPage />
    </LazyRoute>
  ),
});

const projectLetterDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects/$slug/letters/$letterSlug",
  component: () => (
    <LazyRoute>
      <ProjectsPage />
    </LazyRoute>
  ),
});

const projectFilesSplatRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects/$slug/files/$",
  component: () => (
    <LazyRoute>
      <ProjectsPage />
    </LazyRoute>
  ),
});

const projectFilesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects/$slug/files",
  component: () => (
    <LazyRoute>
      <ProjectsPage />
    </LazyRoute>
  ),
});

const projectCommitDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects/$slug/commits/$sha",
  component: () => (
    <LazyRoute>
      <ProjectsPage />
    </LazyRoute>
  ),
});

const projectCommitsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects/$slug/commits",
  component: () => (
    <LazyRoute>
      <ProjectsPage />
    </LazyRoute>
  ),
});

const projectPullDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects/$slug/pulls/$number",
  component: () => (
    <LazyRoute>
      <ProjectsPage />
    </LazyRoute>
  ),
});

const projectPullsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects/$slug/pulls",
  component: () => (
    <LazyRoute>
      <ProjectsPage />
    </LazyRoute>
  ),
});

const projectSectionRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects/$slug/$section",
  component: () => (
    <LazyRoute>
      <ProjectsPage />
    </LazyRoute>
  ),
});

const projectDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "projects/$slug",
  component: () => (
    <LazyRoute>
      <ProjectsPage />
    </LazyRoute>
  ),
});

const knowledgeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "knowledge",
  beforeLoad: ({ location }) => {
    const next =
      location.pathname === "/knowledge" || location.pathname === "/knowledge/"
        ? "/knowledge-v2"
        : location.pathname.replace(/^\/knowledge/, "/knowledge-v2");
    throw redirect({ href: `${next}${location.searchStr}` });
  },
  component: () => <Outlet />,
});

const knowledgeIndexRoute = createRoute({
  getParentRoute: () => knowledgeRoute,
  path: "/",
  component: () => null,
});

const knowledgeSplatRoute = createRoute({
  getParentRoute: () => knowledgeRoute,
  path: "$",
  component: () => null,
});

const lettersRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "letters",
  beforeLoad: () => {
    throw redirect({ to: "/letters-v2" });
  },
});

const letterDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "letters/$slug",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/letters-v2/$slug",
      params: { slug: params.slug },
    });
  },
});

const financeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "finance",
  component: () => (
    <LazyRoute>
      <FinancePage />
    </LazyRoute>
  ),
});

const financeSlugRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "finance/$slug",
  component: () => (
    <LazyRoute>
      <FinancePage />
    </LazyRoute>
  ),
});

const financeSectionRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "finance/$slug/$section",
  component: () => (
    <LazyRoute>
      <FinancePage />
    </LazyRoute>
  ),
});

const organizationsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations",
  component: () => (
    <LazyRoute>
      <OrganizationsPage />
    </LazyRoute>
  ),
});

const orgProjectTaskDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/projects/$projectSlug/tasks/$taskSlug",
  component: OrgProjectScopedTaskDetailPage,
});

const orgProjectDocumentsSplatRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/projects/$projectSlug/documents/$",
  component: OrgScopedProjectsPage,
});

const orgProjectLetterDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/projects/$projectSlug/letters/$letterSlug",
  component: OrgScopedProjectsPage,
});

const orgProjectFilesSplatRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/projects/$projectSlug/files/$",
  component: OrgScopedProjectsPage,
});

const orgProjectFilesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/projects/$projectSlug/files",
  component: OrgScopedProjectsPage,
});

const orgProjectCommitDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/projects/$projectSlug/commits/$sha",
  component: OrgScopedProjectsPage,
});

const orgProjectCommitsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/projects/$projectSlug/commits",
  component: OrgScopedProjectsPage,
});

const orgProjectPullDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/projects/$projectSlug/pulls/$number",
  component: OrgScopedProjectsPage,
});

const orgProjectPullsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/projects/$projectSlug/pulls",
  component: OrgScopedProjectsPage,
});

const orgProjectSectionRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/projects/$projectSlug/$section",
  component: OrgScopedProjectsPage,
});

const orgProjectDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/projects/$projectSlug",
  component: OrgScopedProjectsPage,
});

const orgContactTaskDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/contacts/$contactSlug/tasks/$taskSlug",
  component: OrgContactScopedTaskDetailPage,
});

const orgContactLetterDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/contacts/$contactSlug/letters/$letterSlug",
  component: OrgContactScopedLetterPage,
});

const orgContactSectionRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/contacts/$contactSlug/$section",
  component: OrgScopedContactsPage,
});

const orgContactDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/contacts/$contactSlug",
  component: OrgScopedContactsPage,
});

const organizationDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug",
  component: () => (
    <LazyRoute>
      <OrganizationsPage />
    </LazyRoute>
  ),
});

const organizationSectionRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/$section",
  component: () => (
    <LazyRoute>
      <OrganizationsPage />
    </LazyRoute>
  ),
});

const contactsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "contacts",
  component: () => (
    <LazyRoute>
      <ContactsPage />
    </LazyRoute>
  ),
});

const contactTaskDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "contacts/$slug/tasks/$taskSlug",
  component: ContactScopedTaskDetailPage,
});

const contactLetterDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "contacts/$slug/letters/$letterSlug",
  component: ContactScopedLetterPage,
});

const contactDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "contacts/$slug",
  component: () => (
    <LazyRoute>
      <ContactsPage />
    </LazyRoute>
  ),
});

const contactSectionRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "contacts/$slug/$section",
  component: () => (
    <LazyRoute>
      <ContactsPage />
    </LazyRoute>
  ),
});

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "settings",
  component: () => (
    <LazyRoute>
      <SettingsPage />
    </LazyRoute>
  ),
});

const settingsTabRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "settings/$tab",
  component: () => (
    <LazyRoute>
      <SettingsPage />
    </LazyRoute>
  ),
});


export const routeTree = rootRoute.addChildren([
  overlayPaletteRoute,
  overlayComposeRoute,
  ssoCallbackRoute,
  oauthPopupDoneRoute,
  shellRoute.addChildren([
    indexRoute,
    inboxRoute,
    inboxDetailRoute,
    emailRedirectRoute,
    emailComposeRoute,
    emailDraftRoute,
    emailMessageRoute,
    journalIndexRoute,
    journalHabitsRoute,
    journalHabitDetailRoute,
    journalDateRoute,
    tasksListRoute,
    journalV2ListRoute,
    journalV2DateRoute,
    habitsV2ListRoute,
    habitsV2DetailRoute,
    tasksDueFilterDetailRoute,
    tasksDetailRoute,
    calendarRoute,
    calendarTaskDetailRoute,
    calendarMeetingDetailRoute,
    areasRoute,
    projectsRoute,
    developmentRoute,
    projectTaskDetailRoute,
    projectDocumentsSplatRoute,
    projectLetterDetailRoute,
    projectFilesSplatRoute,
    projectFilesRoute,
    projectCommitDetailRoute,
    projectCommitsRoute,
    projectPullDetailRoute,
    projectPullsRoute,
    projectSectionRoute,
    projectDetailRoute,
    knowledgeRoute.addChildren([
      knowledgeIndexRoute,
      knowledgeSplatRoute,
    ]),
    knowledgeV2Route.addChildren([
      knowledgeV2IndexRoute,
      knowledgeV2SplatRoute,
    ]),
    lettersRoute,
    letterDetailRoute,
    lettersV2Route,
    lettersV2DetailRoute,
    financeRoute,
    financeSlugRoute,
    financeSectionRoute,
    organizationsRoute,
    orgProjectTaskDetailRoute,
    orgProjectDocumentsSplatRoute,
    orgProjectLetterDetailRoute,
    orgProjectFilesSplatRoute,
    orgProjectFilesRoute,
    orgProjectCommitDetailRoute,
    orgProjectCommitsRoute,
    orgProjectPullDetailRoute,
    orgProjectPullsRoute,
    orgProjectSectionRoute,
    orgProjectDetailRoute,
    orgContactTaskDetailRoute,
    orgContactLetterDetailRoute,
    orgContactSectionRoute,
    orgContactDetailRoute,
    organizationDetailRoute,
    organizationSectionRoute,
    contactsRoute,
    contactTaskDetailRoute,
    contactLetterDetailRoute,
    contactDetailRoute,
    contactSectionRoute,
    settingsRoute,
    settingsTabRoute,
  ]),
]);

export { tasksListRoute };
