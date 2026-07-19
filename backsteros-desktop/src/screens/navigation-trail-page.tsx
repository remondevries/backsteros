import { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";

import {
  ContactOverviewView,
  DocumentDetailSkeleton,
  KnowledgeDetailSkeleton,
  LetterDetailSkeleton,
  MarkdownDocumentDetailView,
  OrganizationOverviewView,
  ProjectDetailView,
  ProjectOverviewSkeleton,
  TaskDetailSkeleton,
  buildOrganizationDropdownOptions,
  formatJournalEntryTitle,
  getContactsHref,
  getDocumentEditorBody,
  getJournalHref,
  getKnowledgeHref,
  getNavigationTrailAncestorHref,
  getOrganizationsHref,
  getProjectsHref,
  isEntityRouteUuid,
  isValidJournalDateSlug,
  parseNavigationTrailPath,
  serializeDocumentBody,
  type NavigationTrail,
  type NavigationTrailEntityRef,
} from "@backsteros/ui";

import { useDesktopDocumentContent } from "../lib/use-document-content";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { LettersPage } from "./letters-page";
import { TaskDetailPage } from "./task-detail-page";

function resolveTaskRouteParam(ref: {
  routeParam?: string;
  entityId?: string;
}): string | null {
  if (ref.entityId && isEntityRouteUuid(ref.entityId)) {
    return ref.entityId;
  }
  if (!ref.routeParam) return null;
  const decoded = decodeURIComponent(ref.routeParam);
  const sep = decoded.lastIndexOf("~");
  if (sep > 0) {
    const id = decoded.slice(sep + 1);
    if (isEntityRouteUuid(id)) return id;
  }
  return decoded;
}

function resolveSourceBreadcrumbs(
  trail: NavigationTrail,
  workspace: ReturnType<typeof useDesktopWorkspaceData>,
): { label: string; href?: string }[] {
  const source = trail.sourceHref.split("?")[0] ?? trail.sourceHref;

  const journalMatch = source.match(/^\/journal\/([^/]+)$/);
  if (journalMatch && isValidJournalDateSlug(journalMatch[1]!)) {
    const dateSlug = journalMatch[1]!;
    return [
      { label: "Journal", href: "/journal" },
      {
        label: formatJournalEntryTitle(dateSlug),
        href: getJournalHref(dateSlug),
      },
    ];
  }

  const orgProjectDocMatch = source.match(
    /^\/organizations\/([^/]+)\/projects\/([^/]+)\/documents\/(.+)$/,
  );
  if (orgProjectDocMatch) {
    const orgParam = decodeURIComponent(orgProjectDocMatch[1]!);
    const projectParam = decodeURIComponent(orgProjectDocMatch[2]!);
    const docPath = decodeURIComponent(orgProjectDocMatch[3]!);
    const org = workspace.organizations.find(
      (entry) =>
        entry.id === orgParam ||
        String(entry.number) === orgParam ||
        entry.key?.toLowerCase() === orgParam.toLowerCase(),
    );
    const project = workspace.projects.find(
      (entry) =>
        entry.id === projectParam ||
        entry.key.toLowerCase() === projectParam.toLowerCase(),
    );
    const document = workspace.projectDocuments.find(
      (entry) =>
        entry.path === docPath ||
        entry.id === docPath ||
        entry.path === decodeURIComponent(docPath),
    );
    return [
      { label: "Organizations", href: "/organizations" },
      {
        label: org?.name ?? orgParam,
        href: `/organizations/${orgParam}`,
      },
      {
        label: project?.name ?? projectParam,
        href: `/organizations/${orgParam}/projects/${projectParam}`,
      },
      {
        label: document?.title ?? docPath.split("/").pop() ?? "Document",
        href: source,
      },
    ];
  }

  const projectDocMatch = source.match(/^\/projects\/([^/]+)\/documents\/(.+)$/);
  if (projectDocMatch) {
    const projectParam = decodeURIComponent(projectDocMatch[1]!);
    const docPath = decodeURIComponent(projectDocMatch[2]!);
    const project = workspace.projects.find(
      (entry) =>
        entry.id === projectParam ||
        entry.key.toLowerCase() === projectParam.toLowerCase(),
    );
    const document = workspace.projectDocuments.find(
      (entry) =>
        entry.path === docPath ||
        entry.id === docPath ||
        entry.path === decodeURIComponent(docPath),
    );
    return [
      { label: "Projects", href: "/projects" },
      {
        label: project?.name ?? projectParam,
        href: `/projects/${projectParam}`,
      },
      {
        label: document?.title ?? docPath.split("/").pop() ?? "Document",
        href: source,
      },
    ];
  }

  const knowledgeMatch = source.match(/^\/knowledge\/(.+)$/);
  if (knowledgeMatch) {
    const slug = decodeURIComponent(knowledgeMatch[1]!);
    const document = workspace.knowledgeDocuments.find(
      (entry) => entry.path === slug || entry.id === slug,
    );
    return [
      { label: "Knowledge Base", href: "/knowledge" },
      {
        label: document?.title ?? slug.split("/").pop() ?? "Document",
        href: getKnowledgeHref(slug),
      },
    ];
  }

  const orgContactMatch = source.match(
    /^\/organizations\/([^/]+)\/contacts\/([^/]+)$/,
  );
  if (orgContactMatch) {
    const orgParam = decodeURIComponent(orgContactMatch[1]!);
    const contactParam = decodeURIComponent(orgContactMatch[2]!);
    const org = workspace.organizations.find(
      (entry) =>
        entry.id === orgParam ||
        String(entry.number) === orgParam ||
        entry.key?.toLowerCase() === orgParam.toLowerCase(),
    );
    const contact = workspace.contacts.find(
      (entry) =>
        entry.id === contactParam ||
        String(entry.number) === contactParam ||
        entry.key?.toLowerCase() === contactParam.toLowerCase(),
    );
    return [
      { label: "Organizations", href: "/organizations" },
      {
        label: org?.name ?? orgParam,
        href: `/organizations/${orgParam}`,
      },
      {
        label: contact?.name ?? contactParam,
        href: source,
      },
    ];
  }

  const contactMatch = source.match(/^\/contacts\/([^/]+)$/);
  if (contactMatch) {
    const contactParam = decodeURIComponent(contactMatch[1]!);
    const contact = workspace.contacts.find(
      (entry) =>
        entry.id === contactParam ||
        String(entry.number) === contactParam ||
        entry.key?.toLowerCase() === contactParam.toLowerCase(),
    );
    return [
      { label: "Contacts", href: "/contacts" },
      {
        label: contact?.name ?? contactParam,
        href: source,
      },
    ];
  }

  return [{ label: "Back", href: trail.sourceHref }];
}

function resolveNodeLabel(
  ref: NavigationTrailEntityRef,
  workspace: ReturnType<typeof useDesktopWorkspaceData>,
): string {
  switch (ref.kind) {
    case "task": {
      const id = resolveTaskRouteParam(ref);
      const task = id
        ? workspace.tasks.find(
            (entry) =>
              entry.id === id ||
              entry.id === ref.entityId ||
              String(entry.number) === ref.routeParam,
          )
        : null;
      return task?.title ?? ref.routeParam;
    }
    case "letter": {
      const letter = workspace.letters.find(
        (entry) =>
          entry.id === ref.entityId ||
          entry.id === ref.routeParam ||
          String(entry.number) === ref.routeParam,
      );
      return letter?.title ?? ref.routeParam;
    }
    case "document": {
      const docs = [
        ...workspace.projectDocuments,
        ...workspace.knowledgeDocuments,
      ];
      const document = docs.find(
        (entry) =>
          entry.id === ref.entityId ||
          entry.path === ref.relativePath ||
          entry.id === ref.relativePath,
      );
      return (
        document?.title ??
        ref.relativePath.split("/").pop() ??
        "Document"
      );
    }
    case "project": {
      const project = workspace.projects.find(
        (entry) =>
          entry.id === ref.entityId ||
          entry.key.toLowerCase() === ref.routeParam.toLowerCase(),
      );
      return project?.name ?? ref.routeParam;
    }
    case "contact": {
      const contact = workspace.contacts.find(
        (entry) =>
          entry.id === ref.entityId ||
          entry.key?.toLowerCase() === ref.routeParam.toLowerCase(),
      );
      return contact?.name ?? ref.routeParam;
    }
    case "organization": {
      const organization = workspace.organizations.find(
        (entry) =>
          entry.id === ref.entityId ||
          entry.key?.toLowerCase() === ref.routeParam.toLowerCase(),
      );
      return organization?.name ?? ref.routeParam;
    }
  }
}

function resolveTrailBreadcrumbs(
  trail: NavigationTrail,
  workspace: ReturnType<typeof useDesktopWorkspaceData>,
): { label: string; href?: string }[] {
  const sourceCrumbs = resolveSourceBreadcrumbs(trail, workspace);
  const nodeCrumbs = trail.nodes.map((node, index) => ({
    label: resolveNodeLabel(node, workspace),
    href:
      index < trail.nodes.length - 1
        ? getNavigationTrailAncestorHref(trail, index)
        : undefined,
  }));
  return [...sourceCrumbs, ...nodeCrumbs];
}

function trailBackHref(trail: NavigationTrail): string {
  if (trail.nodes.length > 1) {
    return getNavigationTrailAncestorHref(trail, trail.nodes.length - 2);
  }
  return trail.sourceHref;
}

function TrailDocumentLeaf({
  documentId,
  title,
  sectionLabel,
  breadcrumbItems,
}: {
  documentId: string;
  title: string;
  sectionLabel: string;
  breadcrumbItems: { label: string; href?: string }[];
}) {
  const { initialBody, onSave, loading } =
    useDesktopDocumentContent(documentId);
  useDesktopSectionBreadcrumb(breadcrumbItems);
  const editorBody = useMemo(
    () => getDocumentEditorBody(initialBody, title),
    [initialBody, title],
  );

  if (loading) {
    return sectionLabel === "Knowledge Base" ? (
      <KnowledgeDetailSkeleton />
    ) : (
      <DocumentDetailSkeleton />
    );
  }

  return (
    <MarkdownDocumentDetailView
      sectionLabel={sectionLabel}
      title={title}
      initialBody={editorBody}
      resetKey={documentId}
      onSave={async (nextEditorBody) => {
        await onSave(serializeDocumentBody(nextEditorBody));
      }}
    />
  );
}

function TrailLoadingSkeleton({
  kind,
}: {
  kind: NavigationTrailEntityRef["kind"] | undefined;
}) {
  if (kind === "task") return <TaskDetailSkeleton />;
  if (kind === "letter") return <LetterDetailSkeleton />;
  if (kind === "document") return <DocumentDetailSkeleton />;
  if (kind === "project") return <ProjectOverviewSkeleton />;
  return <DocumentDetailSkeleton />;
}

/**
 * Generic navigation trail leaf — supports multi-node trails with task,
 * letter, document, project, contact, and organization leaves.
 */
export function NavigationTrailPage({
  trail: trailProp,
}: {
  trail?: NavigationTrail;
} = {}) {
  const location = useLocation();
  const workspace = useDesktopWorkspaceData();
  const trail =
    trailProp ?? parseNavigationTrailPath(location.pathname) ?? null;

  if (!trail) {
    return <Navigate to="/inbox" replace />;
  }

  const leaf = trail.nodes[trail.nodes.length - 1];
  if (!leaf) {
    return <Navigate to={trail.sourceHref} replace />;
  }

  const breadcrumbItems = resolveTrailBreadcrumbs(trail, workspace);
  const backHref = trailBackHref(trail);

  if (leaf.kind === "task") {
    const routeParam = resolveTaskRouteParam(leaf);
    if (!routeParam) {
      return <Navigate to={trail.sourceHref} replace />;
    }
    return (
      <TaskDetailPage
        taskRouteParam={routeParam}
        backHref={backHref}
        breadcrumbItems={breadcrumbItems}
      />
    );
  }

  if (leaf.kind === "letter") {
    const routeParam = leaf.entityId ?? leaf.routeParam;
    if (!routeParam) {
      return <Navigate to={trail.sourceHref} replace />;
    }
    return (
      <LettersPage
        letterRouteParam={routeParam}
        backHref={backHref}
        breadcrumbItems={breadcrumbItems}
        disableAutoSelectFirst
      />
    );
  }

  if (leaf.kind === "document") {
    const docs = [
      ...workspace.projectDocuments,
      ...workspace.knowledgeDocuments,
    ];
    const document = docs.find(
      (entry) =>
        entry.id === leaf.entityId ||
        entry.path === leaf.relativePath ||
        entry.id === leaf.relativePath,
    );
    if (!document) {
      if (!workspace.ready) {
        return <TrailLoadingSkeleton kind="document" />;
      }
      return <Navigate to={trail.sourceHref} replace />;
    }
    const isKnowledge = !leaf.projectRouteParam;
    return (
      <TrailDocumentLeaf
        documentId={document.id}
        title={document.title}
        sectionLabel={isKnowledge ? "Knowledge Base" : "Documents"}
        breadcrumbItems={breadcrumbItems}
      />
    );
  }

  if (leaf.kind === "project") {
    const project = workspace.projects.find(
      (entry) =>
        entry.id === leaf.entityId ||
        entry.key.toLowerCase() === leaf.routeParam.toLowerCase(),
    );
    if (!project) {
      if (!workspace.ready) {
        return <TrailLoadingSkeleton kind="project" />;
      }
      return <Navigate to={getProjectsHref(leaf.routeParam)} replace />;
    }
    return (
      <TrailProjectLeaf
        project={project}
        breadcrumbItems={breadcrumbItems}
        workspace={workspace}
      />
    );
  }

  if (leaf.kind === "contact") {
    const contact = workspace.contacts.find(
      (entry) =>
        entry.id === leaf.entityId ||
        entry.key?.toLowerCase() === leaf.routeParam.toLowerCase(),
    );
    if (!contact) {
      if (!workspace.ready) {
        return <TrailLoadingSkeleton kind="contact" />;
      }
      return <Navigate to={getContactsHref(leaf.routeParam)} replace />;
    }
    return (
      <TrailContactLeaf
        contact={contact}
        breadcrumbItems={breadcrumbItems}
        workspace={workspace}
      />
    );
  }

  if (leaf.kind === "organization") {
    const organization = workspace.organizations.find(
      (entry) =>
        entry.id === leaf.entityId ||
        entry.key?.toLowerCase() === leaf.routeParam.toLowerCase(),
    );
    if (!organization) {
      if (!workspace.ready) {
        return <TrailLoadingSkeleton kind="organization" />;
      }
      return <Navigate to={getOrganizationsHref(leaf.routeParam)} replace />;
    }
    return (
      <TrailOrganizationLeaf
        organization={organization}
        breadcrumbItems={breadcrumbItems}
        workspace={workspace}
      />
    );
  }

  return <Navigate to={trail.sourceHref} replace />;
}

function TrailProjectLeaf({
  project,
  breadcrumbItems,
  workspace,
}: {
  project: ReturnType<typeof useDesktopWorkspaceData>["projects"][number];
  breadcrumbItems: { label: string; href?: string }[];
  workspace: ReturnType<typeof useDesktopWorkspaceData>;
}) {
  useDesktopSectionBreadcrumb(breadcrumbItems);
  const tasks = workspace.tasks.filter((task) => task.projectId === project.id);
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "completed").length;

  return (
    <ProjectDetailView
      project={{
        id: project.id,
        key: project.key,
        name: project.name,
        status: project.status ?? "planned",
        priority: project.priority ?? 0,
        area: project.area ?? null,
        icon: project.icon ?? null,
        organizationId: project.organizationId ?? null,
        startDate: project.startDate ?? null,
        dueDate: project.dueDate ?? null,
        taskProgress: { total, completed },
      }}
      onSaveName={(name) => {
        void workspace.patchProject(project.id, { name });
        return { ok: true as const };
      }}
      onStatusChange={(status) => {
        void workspace.patchProject(project.id, { status });
      }}
      onPriorityChange={(priority) => {
        void workspace.patchProject(project.id, { priority });
      }}
      organizationOptions={buildOrganizationDropdownOptions(
        workspace.organizations,
      )}
      organizationNavigateHref={
        project.organizationId
          ? `/organizations/${
              workspace.organizations.find(
                (org) => org.id === project.organizationId,
              )?.key ?? project.organizationId
            }`
          : null
      }
      onOrganizationChange={(organizationId) => {
        void workspace.patchProject(project.id, { organizationId });
      }}
      section="overview"
    />
  );
}

function TrailContactLeaf({
  contact,
  breadcrumbItems,
  workspace,
}: {
  contact: ReturnType<typeof useDesktopWorkspaceData>["contacts"][number];
  breadcrumbItems: { label: string; href?: string }[];
  workspace: ReturnType<typeof useDesktopWorkspaceData>;
}) {
  useDesktopSectionBreadcrumb(breadcrumbItems);

  return (
    <ContactOverviewView
      contact={{
        id: contact.id,
        name: contact.name,
        email: contact.email,
        title: contact.title,
        organizationId: contact.organizationId,
        organizationName: contact.organizationName,
      }}
      organizationOptions={workspace.organizations.map((org) => ({
        id: org.id,
        name: org.name,
      }))}
      onSaveName={(name) => {
        void workspace.patchContact(contact.id, { name });
        return { ok: true as const };
      }}
    />
  );
}

function TrailOrganizationLeaf({
  organization,
  breadcrumbItems,
  workspace,
}: {
  organization: ReturnType<
    typeof useDesktopWorkspaceData
  >["organizations"][number];
  breadcrumbItems: { label: string; href?: string }[];
  workspace: ReturnType<typeof useDesktopWorkspaceData>;
}) {
  useDesktopSectionBreadcrumb(breadcrumbItems);

  return (
    <OrganizationOverviewView
      organization={{
        id: organization.id,
        name: organization.name,
        key: organization.key,
        number: organization.number,
      }}
      onSaveName={(name) => {
        void workspace.patchOrganization(organization.id, { name });
        return { ok: true as const };
      }}
    />
  );
}
