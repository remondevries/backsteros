import { memo, Suspense, type ReactNode } from "react";
import {
  Navigate,
  Outlet,
  useLocation,
  useParams,
} from "@tanstack/react-router";

import {
  EntityDetailLayout,
  getOrganizationSectionHref,
  getScopedContactBasePath,
  getScopedContactMeetingsListHref,
  getScopedContactSectionHref,
  getScopedProjectBasePath,
  getScopedProjectSectionHref,
  parseNavigationTrailPath,
} from "@backsteros/ui";

import { AppShell } from "../shell/app-shell";
import {
  resolvePendingPageSurface,
  type PendingPageSurface,
} from "../lib/pending-navigation-routes";
import {
  KEEP_ALIVE_SURFACES,
  KeepAliveOutletGate,
  KeepAlivePane,
  StableKeepAliveTree,
  isKeepAliveSurface,
  rememberInboxPanelSelectionHref,
  rememberKeepAliveHref,
  routerAgreesWithWindow,
  shouldKeepAliveSurface,
  syncVisibleKeepAliveSurfaceFromRoute,
  useKeepAliveSnapshots,
  useVisitedKeepAliveSurfaces,
} from "../lib/shell-route-keep-alive";
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
  navigationTrailPage,
  notFoundPage,
  organizationsPage,
  projectsPage,
  settingsPage,
  socialPage,
  taskDetailPage,
  taskListPage,
} from "./shell-route-modules";
import {
  useScopedContact,
  useScopedOrganization,
  useScopedProject,
} from "../lib/workspace/use-scoped-entities";

const AreasPage = areasPage.Page;
const DevelopmentPage = developmentPage.Page;
const ContactsPage = contactsPage.Page;
const EmailPage = emailPage.Page;
const HabitTrackerPage = habitTrackerPage.Page;
const JournalPage = journalPage.Page;
const KnowledgePage = knowledgePage.Page;
const LettersPage = lettersPage.Page;
const FinancePage = financePage.Page;
const OrganizationsPage = organizationsPage.Page;
const ProjectsPage = projectsPage.Page;
const SettingsPage = settingsPage.Page;
const SocialPage = socialPage.Page;
const CalendarPage = calendarPage.Page;
const MeetingDetailPage = meetingDetailPage.Page;
const TaskDetailPage = taskDetailPage.Page;
const InboxPage = inboxPage.Page;
const TaskListPage = taskListPage.Page;
const NavigationTrailPage = navigationTrailPage.Page;
const NotFoundPage = notFoundPage.Page;

const KEEP_ALIVE_PAGE: Partial<Record<PendingPageSurface, () => ReactNode>> = {
  calendar: () => <CalendarPage />,
  inbox: () => <InboxPage />,
  knowledge: () => <KnowledgePage />,
  "tasks-list": () => <TaskListPage />,
  "journal-day": () => <JournalPage />,
  "journal-habits": () => <HabitTrackerPage />,
  projects: () => <ProjectsPage />,
  contacts: () => <ContactsPage />,
  organizations: () => <OrganizationsPage />,
  letters: () => <LettersPage />,
  social: () => <SocialPage />,
};

/** Survive ShellRouteContent remounts — same element identity for StableKeepAliveTree. */
const keepAlivePageElements = new Map<PendingPageSurface, ReactNode>();

// Full page rewrites (e.g. organizations shell port) must drop cached elements
// or keep-alive keeps rendering the pre-HMR component tree until hard refresh.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    keepAlivePageElements.clear();
  });
  import.meta.hot.dispose(() => {
    keepAlivePageElements.clear();
  });
}

function ShellRouteSuspenseFallback() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1" aria-busy="true" aria-label="Loading page" />
  );
}

const MemoizedShellRouteTree = memo(function MemoizedShellRouteTree({
  trail,
}: {
  trail: ReturnType<typeof parseNavigationTrailPath>;
}) {
  return (
    <Suspense fallback={<ShellRouteSuspenseFallback />}>
      {trail ? <NavigationTrailPage trail={trail} /> : <Outlet />}
    </Suspense>
  );
});

function ShellRouteFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}

function ShellRouteContent({
  trail,
}: {
  trail: ReturnType<typeof parseNavigationTrailPath>;
}) {
  const location = useLocation();
  const surface = resolvePendingPageSurface(location.pathname);
  const visited = useVisitedKeepAliveSurfaces(
    surface,
    location.pathname,
    Boolean(trail),
  );
  const snapshots = useKeepAliveSnapshots(
    surface,
    location.pathname,
    location.searchStr ?? "",
  );
  const showOutlet =
    Boolean(trail) || !isKeepAliveSurface(surface, location.pathname);

  // Keep-alive store is truth after warm pushState. Only mirror the router
  // when History still agrees (first visit / Outlet / real TanStack nav).
  if (routerAgreesWithWindow(location.pathname, location.searchStr ?? "")) {
    if (trail || !shouldKeepAliveSurface(surface, location.pathname)) {
      syncVisibleKeepAliveSurfaceFromRoute(null);
      // Inbox list stays warm on email detail — keep its selection href in sync.
      rememberInboxPanelSelectionHref(
        `${location.pathname}${location.searchStr ?? ""}`,
      );
    } else {
      rememberKeepAliveHref(
        surface,
        location.pathname,
        location.searchStr ?? "",
      );
      syncVisibleKeepAliveSurfaceFromRoute(surface);
    }
  }

  return (
    <ShellRouteFrame>
      <div className="keep-alive-stack relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {Array.from(KEEP_ALIVE_SURFACES).map((keepSurface) => {
          if (!visited.has(keepSurface)) return null;
          const renderPage = KEEP_ALIVE_PAGE[keepSurface];
          const snapshot = snapshots.get(keepSurface);
          if (!renderPage || !snapshot) return null;
          if (!keepAlivePageElements.has(keepSurface)) {
            keepAlivePageElements.set(
              keepSurface,
              // Inner boundary: detail/agent lazy loads must not fall through to
              // this Suspense (fallback null would unmount the whole section page).
              <Suspense fallback={null}>{renderPage()}</Suspense>,
            );
          }
          return (
            <KeepAlivePane
              key={keepSurface}
              surface={keepSurface}
              active={
                !trail &&
                surface === keepSurface &&
                shouldKeepAliveSurface(keepSurface, location.pathname)
              }
              snapshot={snapshot}
            >
              <StableKeepAliveTree
                tree={keepAlivePageElements.get(keepSurface)}
              />
            </KeepAlivePane>
          );
        })}
        <KeepAliveOutletGate showOutlet={showOutlet}>
          <MemoizedShellRouteTree trail={trail} />
        </KeepAliveOutletGate>
      </div>
    </ShellRouteFrame>
  );
}

export function ShellLayout() {
  const location = useLocation();
  const trail = parseNavigationTrailPath(location.pathname);
  return (
    <AppShell>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <ShellRouteContent trail={trail} />
      </div>
    </AppShell>
  );
}

export function OrgScopedProjectsPage() {
  const { slug } = useParams({ strict: false }) as { slug?: string };
  const { organization, organizationRouteParam, workspaceReady } =
    useScopedOrganization(slug);

  if (!slug) {
    return <Navigate to="/organizations" replace />;
  }

  if (!organization) {
    return (
      <EntityDetailLayout
        sectionLabel="Organizations"
        title={null}
        resolving={!workspaceReady}
        emptyMessage="Organization not found."
      />
    );
  }

  return (
    <ProjectsPage
      organizationRouteParam={organizationRouteParam}
      organizationName={organization.name}
    />
  );
}

export function OrgScopedContactsPage() {
  const { slug } = useParams({ strict: false }) as { slug?: string };
  const { organization, organizationRouteParam, workspaceReady } =
    useScopedOrganization(slug);

  if (!slug) {
    return <Navigate to="/organizations" replace />;
  }

  if (!organization) {
    return (
      <EntityDetailLayout
        sectionLabel="Organizations"
        title={null}
        resolving={!workspaceReady}
        emptyMessage="Organization not found."
      />
    );
  }

  return (
    <ContactsPage
      organizationRouteParam={organizationRouteParam}
      organizationName={organization.name}
    />
  );
}

export function CalendarScopedTaskDetailPage() {
  const { taskId } = useParams({ strict: false }) as { taskId?: string };
  return (
    <TaskDetailPage
      taskRouteParam={taskId}
      backHref="/calendar"
      breadcrumbItems={[{ label: "Calendar", href: "/calendar" }]}
    />
  );
}

export function CalendarScopedMeetingDetailPage() {
  return <MeetingDetailPage />;
}

export function ProjectScopedTaskDetailPage() {
  const { slug, taskSlug } = useParams({ strict: false }) as {
    slug?: string;
    taskSlug?: string;
  };
  const { project, projectRouteParam } = useScopedProject(slug);
  const backHref = getScopedProjectSectionHref(projectRouteParam, "tasks");

  return (
    <TaskDetailPage
      taskRouteParam={taskSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Projects", href: "/projects" },
        {
          label: project?.name ?? projectRouteParam,
          href: getScopedProjectBasePath(projectRouteParam),
        },
        { label: "Tasks", href: backHref },
      ]}
    />
  );
}

export function OrgProjectScopedTaskDetailPage() {
  const { slug, projectSlug, taskSlug } = useParams({ strict: false }) as {
    slug?: string;
    projectSlug?: string;
    taskSlug?: string;
  };
  const { organization, organizationRouteParam } = useScopedOrganization(slug);
  const { project, projectRouteParam } = useScopedProject(projectSlug);
  const scope = {
    kind: "organization" as const,
    organizationRouteParam,
  };
  const backHref = getScopedProjectSectionHref(projectRouteParam, "tasks", scope);

  return (
    <TaskDetailPage
      taskRouteParam={taskSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Organizations", href: "/organizations" },
        {
          label: organization?.name ?? organizationRouteParam,
          href: getOrganizationSectionHref(organizationRouteParam, "overview"),
        },
        {
          label: "Projects",
          href: getOrganizationSectionHref(organizationRouteParam, "projects"),
        },
        {
          label: project?.name ?? projectRouteParam,
          href: getScopedProjectBasePath(projectRouteParam, scope),
        },
        { label: "Tasks", href: backHref },
      ]}
    />
  );
}

export function ContactScopedTaskDetailPage() {
  const { slug, taskSlug } = useParams({ strict: false }) as {
    slug?: string;
    taskSlug?: string;
  };
  const { contact, contactRouteParam } = useScopedContact(slug);
  const backHref = getScopedContactSectionHref(contactRouteParam, "tasks");

  return (
    <TaskDetailPage
      taskRouteParam={taskSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Contacts", href: "/contacts" },
        {
          label: contact?.name ?? contactRouteParam,
          href: getScopedContactBasePath(contactRouteParam),
        },
        { label: "Tasks", href: backHref },
      ]}
      initialAgentCollapsed
      agentFillsHostColumn
    />
  );
}

export function ContactScopedLetterPage() {
  const { slug, letterSlug } = useParams({ strict: false }) as {
    slug?: string;
    letterSlug?: string;
  };
  const { contact, contactRouteParam } = useScopedContact(slug);
  const backHref = getScopedContactSectionHref(contactRouteParam, "letters");

  return (
    <LettersPage
      letterRouteParam={letterSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Contacts", href: "/contacts" },
        {
          label: contact?.name ?? contactRouteParam,
          href: getScopedContactBasePath(contactRouteParam),
        },
        { label: "Letters", href: backHref },
      ]}
    />
  );
}

export function ContactScopedMeetingDetailPage() {
  const { slug } = useParams({ strict: false }) as {
    slug?: string;
  };
  const { contact, contactRouteParam } = useScopedContact(slug);
  const backHref = getScopedContactMeetingsListHref(contactRouteParam);

  return (
    <MeetingDetailPage
      backHref={backHref}
      breadcrumbItems={[
        { label: "Contacts", href: "/contacts" },
        {
          label: contact?.name ?? contactRouteParam,
          href: getScopedContactBasePath(contactRouteParam),
        },
        { label: "Meetings", href: backHref },
      ]}
    />
  );
}

export function OrgContactScopedTaskDetailPage() {
  const { slug, contactSlug, taskSlug } = useParams({ strict: false }) as {
    slug?: string;
    contactSlug?: string;
    taskSlug?: string;
  };
  const { organization, organizationRouteParam } = useScopedOrganization(slug);
  const { contact, contactRouteParam } = useScopedContact(contactSlug);
  const scope = {
    kind: "organization" as const,
    organizationRouteParam,
  };
  const backHref = getScopedContactSectionHref(contactRouteParam, "tasks", scope);

  return (
    <TaskDetailPage
      taskRouteParam={taskSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Organizations", href: "/organizations" },
        {
          label: organization?.name ?? organizationRouteParam,
          href: getOrganizationSectionHref(organizationRouteParam, "overview"),
        },
        {
          label: "Contacts",
          href: getOrganizationSectionHref(organizationRouteParam, "contacts"),
        },
        {
          label: contact?.name ?? contactRouteParam,
          href: getScopedContactBasePath(contactRouteParam, scope),
        },
        { label: "Tasks", href: backHref },
      ]}
    />
  );
}

export function OrgContactScopedLetterPage() {
  const { slug, contactSlug, letterSlug } = useParams({ strict: false }) as {
    slug?: string;
    contactSlug?: string;
    letterSlug?: string;
  };
  const { organization, organizationRouteParam } = useScopedOrganization(slug);
  const { contact, contactRouteParam } = useScopedContact(contactSlug);
  const scope = {
    kind: "organization" as const,
    organizationRouteParam,
  };
  const backHref = getScopedContactSectionHref(contactRouteParam, "letters", scope);

  return (
    <LettersPage
      letterRouteParam={letterSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Organizations", href: "/organizations" },
        {
          label: organization?.name ?? organizationRouteParam,
          href: getOrganizationSectionHref(organizationRouteParam, "overview"),
        },
        {
          label: "Contacts",
          href: getOrganizationSectionHref(organizationRouteParam, "contacts"),
        },
        {
          label: contact?.name ?? contactRouteParam,
          href: getScopedContactBasePath(contactRouteParam, scope),
        },
        { label: "Letters", href: backHref },
      ]}
    />
  );
}

export function OrgContactScopedMeetingDetailPage() {
  const { slug, contactSlug } = useParams({ strict: false }) as {
    slug?: string;
    contactSlug?: string;
    meetingId?: string;
  };
  const { organization, organizationRouteParam } = useScopedOrganization(slug);
  const { contact, contactRouteParam } = useScopedContact(contactSlug);
  const scope = {
    kind: "organization" as const,
    organizationRouteParam,
  };
  const backHref = getScopedContactMeetingsListHref(contactRouteParam, scope);

  return (
    <MeetingDetailPage
      backHref={backHref}
      breadcrumbItems={[
        { label: "Organizations", href: "/organizations" },
        {
          label: organization?.name ?? organizationRouteParam,
          href: getOrganizationSectionHref(organizationRouteParam, "overview"),
        },
        {
          label: "Contacts",
          href: getOrganizationSectionHref(organizationRouteParam, "contacts"),
        },
        {
          label: contact?.name ?? contactRouteParam,
          href: getScopedContactBasePath(contactRouteParam, scope),
        },
        { label: "Meetings", href: backHref },
      ]}
    />
  );
}

export {
  AreasPage,
  CalendarPage,
  ContactsPage,
  DevelopmentPage,
  EmailPage,
  FinancePage,
  HabitTrackerPage,
  InboxPage,
  JournalPage,
  KnowledgePage,
  LettersPage,
  MeetingDetailPage,
  NotFoundPage,
  OrganizationsPage,
  ProjectsPage,
  SettingsPage,
  SocialPage,
  TaskDetailPage,
  TaskListPage,
};
