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
import { validateTasksListSearch } from "./routes/tasks.route";
import { validateCalendarSearch } from "./routes/calendar.route";
import {
  AreasPage,
  CalendarPage,
  CalendarScopedMeetingDetailPage,
  CalendarScopedTaskDetailPage,
  CommunicationPage,
  ContactScopedLetterPage,
  ContactScopedMeetingDetailPage,
  ContactScopedTaskDetailPage,
  ContactsPage,
  DevelopmentPage,
  EmailPage,
  FinancePage,
  HabitTrackerPage,
  InboxPage,
  JournalPage,
  KnowledgePage,
  LettersPage,
  NotFoundPage,
  OrgContactScopedLetterPage,
  OrgContactScopedMeetingDetailPage,
  OrgContactScopedTaskDetailPage,
  OrgProjectScopedTaskDetailPage,
  OrgScopedContactsPage,
  OrgScopedProjectsPage,
  OrganizationsPage,
  ProjectScopedTaskDetailPage,
  ProjectsPage,
  SettingsPage,
  ShellLayout,
  SocialPage,
  TaskListPage,
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
  component: () => (
    <LazyRoute>
      <JournalPage />
    </LazyRoute>
  ),
});

const journalHabitsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "journal/habits",
  component: () => (
    <LazyRoute>
      <HabitTrackerPage />
    </LazyRoute>
  ),
});

const journalHabitDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "journal/habits/$habitId",
  component: () => (
    <LazyRoute>
      <HabitTrackerPage />
    </LazyRoute>
  ),
});

const journalDateRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "journal/$dateSlug",
  component: () => (
    <LazyRoute>
      <JournalPage />
    </LazyRoute>
  ),
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
  beforeLoad: () => {
    throw redirect({ to: "/journal", replace: true });
  },
});

const journalV2DateRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "journal-v2/$dateSlug",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/journal/$dateSlug",
      params: { dateSlug: params.dateSlug },
      replace: true,
    });
  },
});

const habitsV2ListRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "habits-v2",
  beforeLoad: () => {
    throw redirect({ to: "/journal/habits", replace: true });
  },
});

const habitsV2DetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "habits-v2/$habitId",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/journal/habits/$habitId",
      params: { habitId: params.habitId },
      replace: true,
    });
  },
});

const knowledgeV2Route = createRoute({
  getParentRoute: () => shellRoute,
  path: "knowledge-v2",
  beforeLoad: ({ location }) => {
    const next =
      location.pathname === "/knowledge-v2" ||
      location.pathname === "/knowledge-v2/"
        ? "/knowledge"
        : location.pathname.replace(/^\/knowledge-v2/, "/knowledge");
    throw redirect({ href: `${next}${location.searchStr}`, replace: true });
  },
  component: () => <Outlet />,
});

const knowledgeV2IndexRoute = createRoute({
  getParentRoute: () => knowledgeV2Route,
  path: "/",
  component: () => null,
});

const knowledgeV2SplatRoute = createRoute({
  getParentRoute: () => knowledgeV2Route,
  path: "$",
  component: () => null,
});

const lettersV2Route = createRoute({
  getParentRoute: () => shellRoute,
  path: "letters-v2",
  beforeLoad: () => {
    throw redirect({ to: "/letters", replace: true });
  },
});

const lettersV2DetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "letters-v2/$slug",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/letters/$slug",
      params: { slug: params.slug },
      replace: true,
    });
  },
});

const tasksDueFilterDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "tasks/$dueFilter/$taskSlug",
  component: () => (
    <LazyRoute>
      <TaskListPage />
    </LazyRoute>
  ),
});

const tasksDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "tasks/$taskId",
  component: () => (
    <LazyRoute>
      <TaskListPage />
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
  component: () => <Outlet />,
});

const knowledgeIndexRoute = createRoute({
  getParentRoute: () => knowledgeRoute,
  path: "/",
  component: () => (
    <LazyRoute>
      <KnowledgePage />
    </LazyRoute>
  ),
});

const knowledgeSplatRoute = createRoute({
  getParentRoute: () => knowledgeRoute,
  path: "$",
  component: () => (
    <LazyRoute>
      <KnowledgePage />
    </LazyRoute>
  ),
});

const lettersRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "letters",
  component: () => (
    <LazyRoute>
      <LettersPage />
    </LazyRoute>
  ),
});

const letterDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "letters/$slug",
  component: () => (
    <LazyRoute>
      <LettersPage />
    </LazyRoute>
  ),
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

const orgContactMeetingDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "organizations/$slug/contacts/$contactSlug/meetings/$meetingId",
  component: OrgContactScopedMeetingDetailPage,
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

const socialRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "social",
  component: () => (
    <LazyRoute>
      <SocialPage />
    </LazyRoute>
  ),
});

const socialDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "social/$slug",
  component: () => (
    <LazyRoute>
      <SocialPage />
    </LazyRoute>
  ),
});

const communicationRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "communication",
  component: () => (
    <LazyRoute>
      <CommunicationPage />
    </LazyRoute>
  ),
});

const communicationDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "communication/$itemId",
  component: () => (
    <LazyRoute>
      <CommunicationPage />
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

const contactMeetingDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "contacts/$slug/meetings/$meetingId",
  component: ContactScopedMeetingDetailPage,
});

const contactEmailMessageRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "contacts/$slug/emails/$inboxId/$messageId",
  // Standalone contacts embed email detail in the workspace column.
  component: () => null,
});

const contactEmailDraftRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "contacts/$slug/emails/$inboxId/drafts/$draftId",
  component: () => null,
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
    orgContactMeetingDetailRoute,
    orgContactSectionRoute,
    orgContactDetailRoute,
    organizationDetailRoute,
    organizationSectionRoute,
    socialRoute,
    socialDetailRoute,
    communicationRoute,
    communicationDetailRoute,
    contactsRoute,
    contactTaskDetailRoute,
    contactLetterDetailRoute,
    contactMeetingDetailRoute,
    contactEmailDraftRoute,
    contactEmailMessageRoute,
    contactDetailRoute,
    contactSectionRoute,
    settingsRoute,
    settingsTabRoute,
  ]),
]);

export { tasksListRoute };
