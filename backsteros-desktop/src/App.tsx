import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";

import {
  EntityDetailLayout,
  contactMatchesSlug,
  getOrganizationSectionHref,
  getScopedContactBasePath,
  getScopedContactSectionHref,
  getScopedProjectBasePath,
  getScopedProjectSectionHref,
  organizationMatchesSlug,
  parseNavigationTrailPath,
} from "@backsteros/ui";

import {
  PersistLastLocation,
  StartupRedirect,
} from "./components/startup-location";
import { useDesktopWorkspaceData } from "./lib/workspace-data";
import { AppShell } from "./shell/app-shell";
import { DesktopOverlayRouteSync } from "./components/desktop-overlay-route-sync";
import { ContactsPage } from "./screens/contacts-page";
import { DesktopOverlayComposePage } from "./screens/desktop-overlay-compose-page";
import { DesktopOverlayPalettePage } from "./screens/desktop-overlay-palette-page";
import { InboxPage } from "./screens/inbox-page";
import { JournalPage } from "./screens/journal-page";
import { KnowledgePage } from "./screens/knowledge-page";
import { LettersPage } from "./screens/letters-page";
import { NavigationTrailPage } from "./screens/navigation-trail-page";
import { NotFoundPage } from "./screens/not-found-page";
import { OrganizationsPage } from "./screens/organizations-page";
import { ProjectsPage } from "./screens/projects-page";
import { SettingsPage } from "./screens/settings-page";
import { TaskDetailPage } from "./screens/task-detail-page";
import { TaskListPage } from "./screens/task-list-page";

function ShellLayout() {
  const location = useLocation();
  const trail = parseNavigationTrailPath(location.pathname);
  return (
    <AppShell>
      {trail ? <NavigationTrailPage trail={trail} /> : <Outlet />}
    </AppShell>
  );
}

function orgRouteSlug(org: {
  number?: number | null;
  key?: string | null;
  id: string;
}) {
  return String(org.number ?? org.key ?? org.id);
}

function contactRouteSlug(contact: {
  number?: number | null;
  key?: string | null;
  id: string;
}) {
  return String(contact.number ?? contact.key ?? contact.id);
}

function OrgScopedProjectsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { organizations } = useDesktopWorkspaceData();
  const organization = slug
    ? organizations.find((entry) => organizationMatchesSlug(entry, slug))
    : null;

  if (!slug) {
    return <Navigate to="/organizations" replace />;
  }

  if (organizations.length === 0) {
    return (
      <EntityDetailLayout
        sectionLabel="Organizations"
        title={null}
        resolving
      />
    );
  }

  if (!organization) {
    return (
      <EntityDetailLayout
        sectionLabel="Organizations"
        title={null}
        emptyMessage="Organization not found."
      />
    );
  }

  return (
    <ProjectsPage
      organizationRouteParam={orgRouteSlug(organization)}
      organizationName={organization.name}
    />
  );
}

function OrgScopedContactsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { organizations } = useDesktopWorkspaceData();
  const organization = slug
    ? organizations.find((entry) => organizationMatchesSlug(entry, slug))
    : null;

  if (!slug) {
    return <Navigate to="/organizations" replace />;
  }

  if (organizations.length === 0) {
    return (
      <EntityDetailLayout
        sectionLabel="Organizations"
        title={null}
        resolving
      />
    );
  }

  if (!organization) {
    return (
      <EntityDetailLayout
        sectionLabel="Organizations"
        title={null}
        emptyMessage="Organization not found."
      />
    );
  }

  return (
    <ContactsPage
      organizationRouteParam={orgRouteSlug(organization)}
      organizationName={organization.name}
    />
  );
}

function ProjectScopedTaskDetailPage() {
  const { slug, taskSlug } = useParams<{ slug: string; taskSlug: string }>();
  const { projects } = useDesktopWorkspaceData();
  const project = slug
    ? projects.find(
        (entry) =>
          entry.key.toLowerCase() === slug.toLowerCase() || entry.id === slug,
      )
    : null;
  const projectParam = project?.key ?? slug ?? "";
  const backHref = getScopedProjectSectionHref(projectParam, "tasks");

  return (
    <TaskDetailPage
      taskRouteParam={taskSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Projects", href: "/projects" },
        {
          label: project?.name ?? projectParam,
          href: getScopedProjectBasePath(projectParam),
        },
        { label: "Tasks", href: backHref },
      ]}
    />
  );
}

function OrgProjectScopedTaskDetailPage() {
  const { slug, projectSlug, taskSlug } = useParams<{
    slug: string;
    projectSlug: string;
    taskSlug: string;
  }>();
  const { organizations, projects } = useDesktopWorkspaceData();
  const organization = slug
    ? organizations.find((entry) => organizationMatchesSlug(entry, slug))
    : null;
  const orgParam = organization ? orgRouteSlug(organization) : (slug ?? "");
  const project = projectSlug
    ? projects.find(
        (entry) =>
          entry.key.toLowerCase() === projectSlug.toLowerCase() ||
          entry.id === projectSlug,
      )
    : null;
  const projectParam = project?.key ?? projectSlug ?? "";
  const scope = {
    kind: "organization" as const,
    organizationRouteParam: orgParam,
  };
  const backHref = getScopedProjectSectionHref(projectParam, "tasks", scope);

  return (
    <TaskDetailPage
      taskRouteParam={taskSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Organizations", href: "/organizations" },
        {
          label: organization?.name ?? orgParam,
          href: getOrganizationSectionHref(orgParam, "overview"),
        },
        {
          label: "Projects",
          href: getOrganizationSectionHref(orgParam, "projects"),
        },
        {
          label: project?.name ?? projectParam,
          href: getScopedProjectBasePath(projectParam, scope),
        },
        { label: "Tasks", href: backHref },
      ]}
    />
  );
}

function ContactScopedTaskDetailPage() {
  const { slug, taskSlug } = useParams<{ slug: string; taskSlug: string }>();
  const { contacts } = useDesktopWorkspaceData();
  const contact = slug
    ? contacts.find((entry) => contactMatchesSlug(entry, slug))
    : null;
  const contactParam = contact ? contactRouteSlug(contact) : (slug ?? "");
  const backHref = getScopedContactSectionHref(contactParam, "tasks");

  return (
    <TaskDetailPage
      taskRouteParam={taskSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Contacts", href: "/contacts" },
        {
          label: contact?.name ?? contactParam,
          href: getScopedContactBasePath(contactParam),
        },
        { label: "Tasks", href: backHref },
      ]}
    />
  );
}

function ContactScopedLetterPage() {
  const { slug, letterSlug } = useParams<{
    slug: string;
    letterSlug: string;
  }>();
  const { contacts } = useDesktopWorkspaceData();
  const contact = slug
    ? contacts.find((entry) => contactMatchesSlug(entry, slug))
    : null;
  const contactParam = contact ? contactRouteSlug(contact) : (slug ?? "");
  const backHref = getScopedContactSectionHref(contactParam, "letters");

  return (
    <LettersPage
      letterRouteParam={letterSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Contacts", href: "/contacts" },
        {
          label: contact?.name ?? contactParam,
          href: getScopedContactBasePath(contactParam),
        },
        { label: "Letters", href: backHref },
      ]}
    />
  );
}

function OrgContactScopedTaskDetailPage() {
  const { slug, contactSlug, taskSlug } = useParams<{
    slug: string;
    contactSlug: string;
    taskSlug: string;
  }>();
  const { organizations, contacts } = useDesktopWorkspaceData();
  const organization = slug
    ? organizations.find((entry) => organizationMatchesSlug(entry, slug))
    : null;
  const orgParam = organization ? orgRouteSlug(organization) : (slug ?? "");
  const contact = contactSlug
    ? contacts.find((entry) => contactMatchesSlug(entry, contactSlug))
    : null;
  const contactParam = contact
    ? contactRouteSlug(contact)
    : (contactSlug ?? "");
  const scope = {
    kind: "organization" as const,
    organizationRouteParam: orgParam,
  };
  const backHref = getScopedContactSectionHref(contactParam, "tasks", scope);

  return (
    <TaskDetailPage
      taskRouteParam={taskSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Organizations", href: "/organizations" },
        {
          label: organization?.name ?? orgParam,
          href: getOrganizationSectionHref(orgParam, "overview"),
        },
        {
          label: "Contacts",
          href: getOrganizationSectionHref(orgParam, "contacts"),
        },
        {
          label: contact?.name ?? contactParam,
          href: getScopedContactBasePath(contactParam, scope),
        },
        { label: "Tasks", href: backHref },
      ]}
    />
  );
}

function OrgContactScopedLetterPage() {
  const { slug, contactSlug, letterSlug } = useParams<{
    slug: string;
    contactSlug: string;
    letterSlug: string;
  }>();
  const { organizations, contacts } = useDesktopWorkspaceData();
  const organization = slug
    ? organizations.find((entry) => organizationMatchesSlug(entry, slug))
    : null;
  const orgParam = organization ? orgRouteSlug(organization) : (slug ?? "");
  const contact = contactSlug
    ? contacts.find((entry) => contactMatchesSlug(entry, contactSlug))
    : null;
  const contactParam = contact
    ? contactRouteSlug(contact)
    : (contactSlug ?? "");
  const scope = {
    kind: "organization" as const,
    organizationRouteParam: orgParam,
  };
  const backHref = getScopedContactSectionHref(contactParam, "letters", scope);

  return (
    <LettersPage
      letterRouteParam={letterSlug}
      backHref={backHref}
      breadcrumbItems={[
        { label: "Organizations", href: "/organizations" },
        {
          label: organization?.name ?? orgParam,
          href: getOrganizationSectionHref(orgParam, "overview"),
        },
        {
          label: "Contacts",
          href: getOrganizationSectionHref(orgParam, "contacts"),
        },
        {
          label: contact?.name ?? contactParam,
          href: getScopedContactBasePath(contactParam, scope),
        },
        { label: "Letters", href: backHref },
      ]}
    />
  );
}

export default function App() {
  return (
    <>
      <DesktopOverlayRouteSync />
      <PersistLastLocation />
      <Routes>
      <Route
        path="/desktop-overlay/palette"
        element={<DesktopOverlayPalettePage />}
      />
      <Route
        path="/desktop-overlay/compose"
        element={<DesktopOverlayComposePage />}
      />
      <Route element={<ShellLayout />}>
        <Route index element={<StartupRedirect />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="inbox/:itemId" element={<InboxPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="journal/:dateSlug" element={<JournalPage />} />
        <Route path="tasks" element={<TaskListPage />} />
        <Route
          path="tasks/:dueFilter/:taskSlug"
          element={<TaskDetailPage />}
        />
        <Route path="tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route
          path="projects/:slug/tasks/:taskSlug"
          element={<ProjectScopedTaskDetailPage />}
        />
        <Route
          path="projects/:slug/documents/*"
          element={<ProjectsPage />}
        />
        <Route
          path="projects/:slug/letters/:letterSlug"
          element={<ProjectsPage />}
        />
        <Route path="projects/:slug/:section" element={<ProjectsPage />} />
        <Route path="projects/:slug" element={<ProjectsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="knowledge/*" element={<KnowledgePage />} />
        <Route path="letters" element={<LettersPage />} />
        <Route path="letters/:slug" element={<LettersPage />} />
        <Route path="organizations" element={<OrganizationsPage />} />
        <Route
          path="organizations/:slug/projects/:projectSlug/tasks/:taskSlug"
          element={<OrgProjectScopedTaskDetailPage />}
        />
        <Route
          path="organizations/:slug/projects/:projectSlug/documents/*"
          element={<OrgScopedProjectsPage />}
        />
        <Route
          path="organizations/:slug/projects/:projectSlug/letters/:letterSlug"
          element={<OrgScopedProjectsPage />}
        />
        <Route
          path="organizations/:slug/projects/:projectSlug/:section"
          element={<OrgScopedProjectsPage />}
        />
        <Route
          path="organizations/:slug/projects/:projectSlug"
          element={<OrgScopedProjectsPage />}
        />
        <Route
          path="organizations/:slug/contacts/:contactSlug/tasks/:taskSlug"
          element={<OrgContactScopedTaskDetailPage />}
        />
        <Route
          path="organizations/:slug/contacts/:contactSlug/letters/:letterSlug"
          element={<OrgContactScopedLetterPage />}
        />
        <Route
          path="organizations/:slug/contacts/:contactSlug/:section"
          element={<OrgScopedContactsPage />}
        />
        <Route
          path="organizations/:slug/contacts/:contactSlug"
          element={<OrgScopedContactsPage />}
        />
        <Route path="organizations/:slug" element={<OrganizationsPage />} />
        <Route
          path="organizations/:slug/:section"
          element={<OrganizationsPage />}
        />
        <Route path="contacts" element={<ContactsPage />} />
        <Route
          path="contacts/:slug/tasks/:taskSlug"
          element={<ContactScopedTaskDetailPage />}
        />
        <Route
          path="contacts/:slug/letters/:letterSlug"
          element={<ContactScopedLetterPage />}
        />
        <Route path="contacts/:slug" element={<ContactsPage />} />
        <Route path="contacts/:slug/:section" element={<ContactsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/:tab" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </>
  );
}
