import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
} from "@tanstack/react-router";

import {
  DocumentsEmptyCreateView,
  DocumentDetailIcon,
  DocumentDetailSkeleton,
  LetterComposeView,
  LetterDetailSkeleton,
  LetterDetailView,
  MarkdownDocumentDetailView,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  PROJECT_SECTIONS,
  ProjectDetailView,
  ProjectDocumentsView,
  ProjectLettersView,
  ProjectTasksView,
  ProjectsOverviewView,
  DomainDetailView,
  RegisterEntityDeleteAction,
  RegisterEntityDuplicateAction,
  RegisterPageTitle,
  primeTabTitle,
  LIST_BOARD_VIEW_SEARCH_PARAM,
  TASKS_LIST_BOARD_STORAGE_KEY,
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  buildProjectKeyRenameRedirectPath,
  buildTransipDomainProjectIcon,
  formatLetterDisplayId,
  getFirstLetterInListOrder,
  getOrganizationProjectHref,
  getOrganizationSectionHref,
  getProjectsListAreaHref,
  getScopedProjectBasePath,
  getScopedProjectDocumentHref,
  getScopedProjectLetterHref,
  getScopedProjectSectionHref,
  getScopedProjectTaskHref,
  getActiveProjectSection,
  getDocumentEditorBody,
  getSelectedProjectDocumentPathFromPathname,
  isCodebaseWorkbenchPath,
  isProjectSectionId,
  letterMatchesSlug,
  letterPdfSubjectFromFilename,
  organizationMatchesSlug,
  parseListBoardViewFromLocation,
  parseProjectAreaFilterFromLocation,
  persistListBoardView,
  resolveLetterDetailHref,
  serializeDocumentBody,
  type DomainRegistrarContact,
  type KnowledgeListItem,
  type ListBoardView,
  type ProjectArea,
  type ProjectOverviewRowProject,
  type ProjectRouteScope,
  type ProjectSectionId,
  type ProjectStatus,
  type TaskStatus,
  getProjectProviderDefaultIcon,
  getProjectEmailCategoryDefaultIcon,
  projectReorderPatches,
  taskReorderPatches,
} from "@backsteros/ui";

import { DesktopProjectUpdatesPanel } from "../components/desktop-project-updates-panel";
import { LetterPdfPreview } from "../components/letter-pdf-viewer";
import {
  buildWorkingProjectIdSet,
  isTaskAgentWorkingForUi,
  renderTaskAgentTitleTrailing,
} from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useDesktopApi } from "../lib/api-context";
import { useAgentMail } from "../lib/agentmail-context";
import {
  filterEmailTaskRowsForProject,
  getEmailTaskListHref,
  isEmailTaskListItem,
  mapEmailMessagesToTaskRows,
  patchEmailTaskListItem,
} from "../lib/email-list-tasks";
import { useEnsureProjectVault } from "../lib/use-ensure-project-vault";
import { uploadLetterPdfFile } from "../lib/letter-pdf-upload";
import { writeDocumentContentCache } from "../lib/document-content-cache";
import { useDesktopDocumentContent } from "../lib/use-document-content";
import { useCodebaseRepoDocs } from "../lib/codebase-repo-docs";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useLetterPdfPanel } from "../lib/use-letter-pdf-panel";
import { useDesktopLetterContext } from "../lib/use-letter-context";
import {
  useKeepAliveActive,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { useDomainProjectApi } from "../lib/use-domain-project-api";
import { CodebaseProjectWorkbench } from "./codebase-project-workbench";
import { DomainProjectWorkbench } from "./domain-project-workbench";
import { DesktopCodebaseDocsListPanel } from "./codebase-docs-list-panel";
import { CodebaseRepoDocsDetail } from "./codebase-repo-docs-detail";
import {
  projectTypeFromLocationState,
  projectNavFromLocationState,
  projectListLabelForNavFrom,
  recalledProjectType,
  recalledProjectNavFrom,
  rememberProjectNavFrom,
  rememberProjectListHref,
  projectListHrefFromLocationState,
  resolveProjectListHref,
  type ProjectLocationState,
  type ProjectNavFrom,
} from "../lib/project-type-cache";
import { navigateToHref } from "../router/navigate-href";

type WorkspaceProject = ProjectOverviewRowProject & {
  organizationId?: string | null;
  type?: string;
  localWorkingDirectory?: string | null;
  githubRepository?: string | null;
  provider?: string | null;
  category?: string | null;
  healthCheckMode?: "simple" | "advanced" | null;
  healthCheckDomain?: string | null;
};

export type ProjectsPageProps = {
  organizationRouteParam?: string;
  organizationName?: string;
};

function computeTaskProgress(tasks: { status: string }[]) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  return { total, completed };
}

function mapWorkspaceNestedAreas(
  areas: { id: string; name: string; parent: string | null; sortOrder?: number }[]) {
  return areas.map((area) => ({
    id: area.id,
    name: area.name,
    parent:
      area.parent === "personal" ||
      area.parent === "business" ||
      area.parent === "clients"
        ? (area.parent as ProjectArea)
        : null,
    sortOrder: area.sortOrder,
  }));
}

export function ProjectsPage({
  organizationRouteParam,
  organizationName,
}: ProjectsPageProps = {}) {
  if (organizationRouteParam) {
    return (
      <OrgScopedProjectsPage
        organizationRouteParam={organizationRouteParam}
        organizationName={organizationName}
      />
    );
  }
  return (
    <ProjectsPageBody
      organizationRouteParam={organizationRouteParam}
      organizationName={organizationName}
    />
  );
}

function OrgScopedProjectsPage({
  organizationRouteParam,
  organizationName,
}: {
  organizationRouteParam: string;
  organizationName?: string;
}) {
  const { pathname } = useLocation();
  if (!pathname.includes("/organizations")) {
    return null;
  }
  return (
    <ProjectsPageBody
      organizationRouteParam={organizationRouteParam}
      organizationName={organizationName}
    />
  );
}

function ProjectsPageBody({
  organizationRouteParam,
  organizationName,
}: ProjectsPageProps = {}) {
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (
      to: string,
      options?: { replace?: boolean; state?: unknown },
    ) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate]);
  const location = useShellLocation();
  const keepAliveActive = useKeepAliveActive();
  const {
    slug,
    projectSlug,
    section: sectionParam,
    letterSlug,
  } = useShellParams() as {
    slug?: string;
    projectSlug?: string;
    section?: string;
    letterSlug?: string;
  };
  const routeSlug = projectSlug ?? slug;
  const documentPath =
    getSelectedProjectDocumentPathFromPathname(location.pathname) ?? null;
  const routeScope = useMemo<ProjectRouteScope>(
    () =>
      organizationRouteParam
        ? { kind: "organization", organizationRouteParam }
        : { kind: "standalone" },
    [organizationRouteParam]);
  const projectsListHref = organizationRouteParam
    ? getOrganizationSectionHref(organizationRouteParam, "projects")
    : "/projects";
  const workspace = useDesktopWorkspaceData();
  const agentStatus = useDesktopAgentStatusOptional();
  const { client } = useDesktopApi();
  const {
    knownDomainTags,
    loadDomainRegistrarDetail,
    updateDomainTags,
    updateDomainContacts,
    loadCloudflareDnsRecords,
    purgeCloudflareCache,
  } = useDomainProjectApi();
  const agentMail = useAgentMail();
  const [projectOverlay, setProjectOverlay] = useState<
    Record<string, Partial<WorkspaceProject>>
  >({});
  const [localDocuments, setLocalDocuments] = useState<KnowledgeListItem[]>([]);
  const [omittedDocumentIds, setOmittedDocumentIds] = useState<string[]>([]);
  const [omittedLetterIds, setOmittedLetterIds] = useState<string[]>([]);
  const [composingDocument, setComposingDocument] = useState(false);
  const [creatingDocument, setCreatingDocument] = useState(false);
  const [pendingEditDocumentId, setPendingEditDocumentId] = useState<
    string | null
  >(null);
  const [composePdfUploading, setComposePdfUploading] = useState(false);
  const [letterStatusOverride, setLetterStatusOverride] =
    useState<TaskStatus | null>(null);
  const [letterTitleOverride, setLetterTitleOverride] = useState<string | null>(
    null,
  );
  /** Title/number from the latest create — `onCreatedTask` may close over a stale tasks list. */
  const pendingCreatedTaskRef = useRef<{
    title: string;
    number: number | null;
  } | null>(null);
  const pendingCreatedProjectNameRef = useRef<string | null>(null);

  const { allTasks: tasks, letters, organizations, contacts } = workspace;
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations);
  const projects = workspace.projects.map((project) => ({
    ...project,
    ...projectOverlay[project.id],
  }));
  const workingProjectIds = useMemo(
    () =>
      buildWorkingProjectIdSet(
        tasks,
        agentStatus?.workingTaskIds ?? new Set()),
    [agentStatus?.workingTaskIds, tasks]);
  const documents = useMemo(() => {
    const omitted = new Set(omittedDocumentIds);
    const byId = new Map<string, KnowledgeListItem>();
    for (const doc of workspace.projectDocuments) {
      if (!omitted.has(doc.id)) byId.set(doc.id, doc);
    }
    for (const doc of localDocuments) {
      if (!omitted.has(doc.id)) byId.set(doc.id, doc);
    }
    return [...byId.values()];
  }, [localDocuments, omittedDocumentIds, workspace.projectDocuments]);

  const selected = useMemo(() => {
    if (!routeSlug) return null;
    return (
      projects.find(
        (project) =>
          project.key.toLowerCase() === routeSlug.toLowerCase() ||
          project.id === routeSlug) ?? null
    );
  }, [projects, routeSlug]);

  const navTypeForDocs = projectTypeFromLocationState(location.state);
  const selectedIsCodebase = Boolean(
    selected &&
      (selected.type === "codebase" ||
        navTypeForDocs === "codebase" ||
        recalledProjectType(selected.id) === "codebase" ||
        recalledProjectType(selected.key) === "codebase"),
  );
  const repoDocs = useCodebaseRepoDocs({
    projectId: selected?.id ?? null,
    enabled:
      selectedIsCodebase &&
      Boolean(selected?.localWorkingDirectory?.trim()),
  });
  const getCodebaseRepoDocHref = useCallback(
    (pathOrId: string) => {
      if (!selected) return pathOrId;
      return getScopedProjectDocumentHref(selected.key, pathOrId, routeScope);
    },
    [routeScope, selected],
  );
  const codebaseDocsEmptyLabel = !selected?.localWorkingDirectory?.trim()
    ? "Set a working directory to browse repository docs."
    : repoDocs.loading
      ? "Loading documents…"
      : (repoDocs.error ?? "No docs in this repository.");

  useEnsureProjectVault(selected?.id);

  // Prefer pathname over :section — `/projects/:slug/documents/*` does not set
  // the section param, so parseProjectSectionId would wrongly fall back to overview.
  const activeSection: ProjectSectionId = routeSlug
    ? getActiveProjectSection(location.pathname, routeSlug)
    : "overview";

  const sectionLabel =
    activeSection === "overview"
      ? null
      : (PROJECT_SECTIONS.find((entry) => entry.id === activeSection)?.label ??
        null);

  const projectDocuments = useMemo(() => {
    if (!selected) return [];
    return documents
      .filter((document) => document.projectId === selected.id)
      .sort((left, right) =>
        (left.path || left.title).localeCompare(
          right.path || right.title,
          undefined,
          { sensitivity: "base" }));
  }, [documents, selected]);

  const readableProjectDocuments = useMemo(
    () => projectDocuments.filter((document) => document.kind !== "folder"),
    [projectDocuments]);

  const projectLetters = useMemo(() => {
    if (!selected) return [];
    return letters.filter(
      (letter) =>
        !omittedLetterIds.includes(letter.id) &&
        (letter.projectId === selected.id ||
          (letter.projectKey &&
            letter.projectKey.toLowerCase() === selected.key.toLowerCase())));
  }, [letters, omittedLetterIds, selected]);

  useEffect(() => {
    if (omittedLetterIds.length === 0) return;
    const present = new Set(letters.map((letter) => letter.id));
    setOmittedLetterIds((current) => {
      const next = current.filter((id) => present.has(id));
      return next.length === current.length ? current : next;
    });
  }, [letters, omittedLetterIds.length]);

  const selectedDocument = useMemo(() => {
    if (!documentPath) return null;
    return (
      projectDocuments.find(
        (document) =>
          document.kind !== "folder" &&
          (document.id === documentPath ||
            document.path === documentPath ||
            document.path === decodeURIComponent(documentPath))) ?? null
    );
  }, [documentPath, projectDocuments]);

  const documentContent = useDesktopDocumentContent(
    selectedDocument?.id ?? null,
    { enabled: keepAliveActive },
  );

  const projectsListView = useMemo(
    () =>
      parseListBoardViewFromLocation(
        location.pathname,
        location.searchStr,
        PROJECTS_LIST_BOARD_STORAGE_KEY),
    [location.pathname, location.searchStr]);

  const projectTasksView = useMemo(
    () =>
      parseListBoardViewFromLocation(
        location.pathname,
        location.searchStr,
        TASKS_LIST_BOARD_STORAGE_KEY),
    [location.pathname, location.searchStr]);

  const composingLetter = letterSlug === "new";
  const selectedLetter = useMemo(() => {
    if (!letterSlug || composingLetter) return null;
    return (
      projectLetters.find((letter) =>
        letterMatchesSlug(letter, letterSlug)) ?? null
    );
  }, [composingLetter, letterSlug, projectLetters]);

  const selectedLetterRecord = selectedLetter
    ? workspace.letterRecords[selectedLetter.id] ?? null
    : null;
  const { context: letterContext } = useDesktopLetterContext(selectedLetter?.id, {
    enabled: keepAliveActive && Boolean(selectedLetter),
  });
  const hasLivePdf = Boolean(
    selectedLetterRecord?.storageKey && selectedLetterRecord.byteSize > 0);
  const pdfPanel = useLetterPdfPanel(selectedLetter?.id, {
    hasLegacyPdf: hasLivePdf,
    legacyFilename: selectedLetterRecord?.originalFilename,
    enabled: keepAliveActive && Boolean(selectedLetter),
  });

  useEffect(() => {
    if (!selected || !sectionParam || documentPath || letterSlug) return;
    if (
      sectionParam === "files" ||
      sectionParam === "commits" ||
      sectionParam === "pulls"
    ) {
      return;
    }
    if (sectionParam === "overview" || !isProjectSectionId(sectionParam)) {
      navigate(
        getScopedProjectSectionHref(selected.key, "overview", routeScope),
        { replace: true });
    }
  }, [documentPath, letterSlug, navigate, routeScope, sectionParam, selected]);

  // Match web ProjectDocumentsIndexScreen: open first project document when
  // landing on the Documents index.
  useEffect(() => {
    if (!selected || activeSection !== "documents" || documentPath) return;
    if (composingDocument) return;
    if (selectedIsCodebase) {
      if (!selected.localWorkingDirectory?.trim() || repoDocs.loading) return;
      const first = repoDocs.items.find((item) => item.kind !== "folder");
      if (!first) return;
      navigate(
        getScopedProjectDocumentHref(
          selected.key,
          first.path || first.id,
          routeScope),
        { replace: true });
      return;
    }
    const first = readableProjectDocuments[0];
    if (!first) return;
    navigate(
      getScopedProjectDocumentHref(
        selected.key,
        first.path || first.id,
        routeScope),
      { replace: true });
  }, [
    activeSection,
    composingDocument,
    documentPath,
    navigate,
    readableProjectDocuments,
    repoDocs.items,
    repoDocs.loading,
    routeScope,
    selected,
    selectedIsCodebase,
  ]);

  // Match web: open first project letter when landing on Letters index.
  useEffect(() => {
    if (!selected || activeSection !== "letters" || letterSlug) return;
    const first = getFirstLetterInListOrder(projectLetters);
    if (!first || first.number == null) return;
    navigate(
      getScopedProjectLetterHref(selected.key, first.number, routeScope),
      { replace: true });
  }, [
    activeSection,
    letterSlug,
    navigate,
    projectLetters,
    routeScope,
    selected,
  ]);

  useEffect(() => {
    setComposingDocument(false);
    setPendingEditDocumentId(null);
    setOmittedDocumentIds([]);
    setLetterStatusOverride(null);
    setLetterTitleOverride(null);
  }, [selected?.id, letterSlug]);

  useEffect(() => {
    if (letterTitleOverride == null || !selectedLetter) return;
    if (selectedLetter.title === letterTitleOverride) {
      setLetterTitleOverride(null);
    }
  }, [letterTitleOverride, selectedLetter]);

  useEffect(() => {
    if (!pendingEditDocumentId || !selectedDocument) return;
    if (pendingEditDocumentId !== selectedDocument.id) return;
    // Child activates edit on mount; clear so remounts / saves don't re-enter edit.
    const frame = requestAnimationFrame(() => {
      setPendingEditDocumentId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingEditDocumentId, selectedDocument]);

  // Letter number is null for optimistic rows until the server assigns one.
  const selectedLetterDisplayId =
    selectedLetter && selectedLetter.number != null
      ? formatLetterDisplayId(selectedLetter.number)
      : null;

  const letterBreadcrumbTitle = composingLetter
    ? "New"
    : selectedLetter
      ? `${selectedLetterDisplayId ? `${selectedLetterDisplayId} ` : ""}${letterTitleOverride ?? selectedLetter.title}`
      : null;

  const projectNavFrom: ProjectNavFrom =
    projectNavFromLocationState(location.state) ??
    (selected
      ? (recalledProjectNavFrom(selected.id) ??
        recalledProjectNavFrom(selected.key))
      : null) ??
    "projects";

  useEffect(() => {
    if (!selected) return;
    const from = projectNavFromLocationState(location.state);
    if (from) {
      rememberProjectNavFrom(selected.id, selected.key, from);
    }
    const listHref = projectListHrefFromLocationState(location.state);
    if (listHref) {
      rememberProjectListHref(selected.id, selected.key, listHref);
    }
  }, [location.state, selected]);

  const standaloneListHref = resolveProjectListHref({
    locationState: location.state,
    navFrom: projectNavFrom,
    projectId: selected?.id,
    projectKey: selected?.key,
    routeParam: routeSlug,
  });
  const standaloneListLabel = projectListLabelForNavFrom(projectNavFrom);
  const projectBackHref = organizationRouteParam
    ? projectsListHref
    : standaloneListHref;

  useDesktopSectionBreadcrumb(
    selected
      ? organizationRouteParam && organizationName
        ? [
            { label: "Organizations", href: "/organizations" },
            {
              label: organizationName,
              href: getOrganizationSectionHref(
                organizationRouteParam,
                "overview"),
            },
            { label: "Projects", href: projectsListHref },
            {
              label: selected.name,
              href:
                activeSection === "overview"
                  ? undefined
                  : getScopedProjectSectionHref(
                      selected.key,
                      "overview",
                      routeScope),
            },
            ...(sectionLabel
              ? [
                  {
                    label: sectionLabel,
                    href:
                      (activeSection === "documents" && selectedDocument) ||
                      (activeSection === "letters" &&
                        (selectedLetter || composingLetter))
                        ? getScopedProjectSectionHref(
                            selected.key,
                            activeSection,
                            routeScope)
                        : undefined,
                  },
                ]
              : []),
            ...(selectedDocument ? [{ label: selectedDocument.title }] : []),
            ...(letterBreadcrumbTitle
              ? [{ label: letterBreadcrumbTitle }]
              : []),
          ]
        : [
            { label: standaloneListLabel, href: standaloneListHref },
            {
              label: selected.name,
              href:
                activeSection === "overview"
                  ? undefined
                  : getScopedProjectSectionHref(
                      selected.key,
                      "overview",
                      routeScope),
            },
            ...(sectionLabel
              ? [
                  {
                    label: sectionLabel,
                    href:
                      (activeSection === "documents" && selectedDocument) ||
                      (activeSection === "letters" &&
                        (selectedLetter || composingLetter))
                        ? getScopedProjectSectionHref(
                            selected.key,
                            activeSection,
                            routeScope)
                        : undefined,
                  },
                ]
              : []),
            ...(selectedDocument ? [{ label: selectedDocument.title }] : []),
            ...(letterBreadcrumbTitle
              ? [{ label: letterBreadcrumbTitle }]
              : []),
          ]
      : [{ label: "Projects" }],
    { enabled: keepAliveActive });

  const handleDeleteProject = useCallback(async () => {
    if (!selected) {
      return { ok: false as const, error: "Project is required." };
    }
    try {
      await workspace.softDeleteProject(selected.id);
      navigate(projectBackHref, { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete project.",
      };
    }
  }, [navigate, projectBackHref, selected, workspace]);

  const handleDuplicateProject = useCallback(
    async (options?: { includeTasks?: boolean }) => {
      if (!selected) {
        return { ok: false as const, error: "Project is required." };
      }
      try {
        const created = await workspace.duplicateProject(selected.id, {
          includeTasks: Boolean(options?.includeTasks),
        });
        const href = organizationRouteParam
          ? getOrganizationProjectHref(organizationRouteParam, created.key)
          : getScopedProjectBasePath(created.key, routeScope);
        primeTabTitle(href, `${selected.name} copy`);
        navigate(href);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Failed to duplicate project.",
        };
      }
    },
    [navigate, organizationRouteParam, routeScope, selected, workspace]);

  const handleDeleteLetter = useCallback(async () => {
    if (!selectedLetter || !selected) {
      return { ok: false as const, error: "Letter is required." };
    }
    const deletedId = selectedLetter.id;
    const remaining = projectLetters.filter((letter) => letter.id !== deletedId);
    setOmittedLetterIds((current) =>
      current.includes(deletedId) ? current : [...current, deletedId]);
    try {
      await workspace.softDeleteLetter(deletedId);
      if (remaining.length === 0) {
        navigate(
          getScopedProjectSectionHref(selected.key, "letters", routeScope),
          { replace: true });
      } else {
        const next = remaining[0]!;
        if (next.number != null) {
          navigate(
            getScopedProjectLetterHref(selected.key, next.number, routeScope),
            { replace: true });
        } else {
          navigate(
            `${getScopedProjectSectionHref(selected.key, "letters", routeScope)}/${next.id}`,
            { replace: true });
        }
      }
      return { ok: true as const };
    } catch (error) {
      setOmittedLetterIds((current) =>
        current.filter((id) => id !== deletedId));
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete letter.",
      };
    }
  }, [
    navigate,
    projectLetters,
    routeScope,
    selected,
    selectedLetter,
    workspace,
  ]);

  const handleDeleteDocument = useCallback(async () => {
    if (!selectedDocument || !selected) {
      return { ok: false as const, error: "Document is required." };
    }
    const deletedId = selectedDocument.id;
    const remaining = readableProjectDocuments.filter(
      (document) => document.id !== deletedId);
    setOmittedDocumentIds((current) =>
      current.includes(deletedId) ? current : [...current, deletedId]);
    setLocalDocuments((current) =>
      current.filter((doc) => doc.id !== deletedId));
    try {
      const result = await workspace.deleteDocument(deletedId);
      if (!result.ok) {
        setOmittedDocumentIds((current) =>
          current.filter((id) => id !== deletedId));
        return result;
      }
      if (remaining.length === 0) {
        setComposingDocument(true);
        navigate(
          getScopedProjectSectionHref(selected.key, "documents", routeScope),
          { replace: true });
      } else {
        const next = remaining[0]!;
        navigate(
          getScopedProjectDocumentHref(
            selected.key,
            next.path || next.id,
            routeScope),
          { replace: true });
      }
      return { ok: true as const };
    } catch (error) {
      setOmittedDocumentIds((current) =>
        current.filter((id) => id !== deletedId));
      return {
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete document.",
      };
    }
  }, [
    navigate,
    readableProjectDocuments,
    routeScope,
    selected,
    selectedDocument,
    workspace,
  ]);

  const projectTasks = useMemo(() => {
    if (!selected) return [];
    const taskRows = tasks.filter(
      (task) =>
        !task.habitId &&
        (task.projectId === selected.id ||
          (task.projectKey &&
            task.projectKey.toLowerCase() === selected.key.toLowerCase())));
    const mailboxes = agentMail.mailboxes.map((mailbox) => ({
      ...mailbox,
      avatarSrc: mailbox.contactId
        ? contactAvatarSrc[mailbox.contactId] ?? null
        : null,
    }));
    const emailRows = filterEmailTaskRowsForProject(
      mapEmailMessagesToTaskRows(agentMail.messages, mailboxes),
      selected);
    return [...taskRows, ...emailRows];
  }, [
    agentMail.mailboxes,
    agentMail.messages,
    contactAvatarSrc,
    selected,
    tasks,
  ]);

  const projectList = workspace.projects;

  const assigneeOptions = useMemo(
    () => buildAssigneeDropdownOptions(withAvatarSrc(contacts, contactAvatarSrc)),
    [contactAvatarSrc, contacts]);

  const organizationOptions = useMemo(
    () =>
      buildOrganizationDropdownOptions(
        withAvatarSrc(organizations, organizationAvatarSrc),
        { includeNone: false }),
    [organizationAvatarSrc, organizations]);

  const domainOrganizationOptions = useMemo(
    () =>
      organizations.map((org) => ({
        value: org.id,
        label: org.name,
      })),
    [organizations],
  );

  const letterOrganizationOptions = useMemo(
    () =>
      buildOrganizationDropdownOptions(
        withAvatarSrc(organizations, organizationAvatarSrc)),
    [organizationAvatarSrc, organizations]);

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projectList.map((entry) => ({
          key: entry.key,
          name: entry.name,
          icon: entry.icon,
        })),
        { includeNone: false }),
    [projectList]);

  const composeProjectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projectList.map((entry) => ({
          key: entry.key,
          name: entry.name,
          icon: entry.icon,
        })),
        { includeNone: true }),
    [projectList]);

  if (!routeSlug) {
    const areaFilter =
      parseProjectAreaFilterFromLocation(location.pathname, location.searchStr) ??
      undefined;

    return (
      <ProjectsOverviewView
        projects={projects}
        nestedAreas={mapWorkspaceNestedAreas(workspace.areas)}
        organizations={organizations.map((org) => ({
          id: org.id,
          name: org.name,
        }))}
        workingProjectIds={workingProjectIds}
        typeToFilterEnabled={keepAliveActive}
        area={areaFilter}
        onAreaChange={(area) => {
          navigate(getProjectsListAreaHref(area, projectsListView));
        }}
        view={projectsListView}
        onViewChange={(nextView) => {
          persistListBoardView(nextView, PROJECTS_LIST_BOARD_STORAGE_KEY);
          navigate(
            getProjectsListAreaHref(areaFilter ?? "personal", nextView));
        }}
        onSelectProject={(key) => {
          const match = projects.find(
            (entry) => entry.key.toLowerCase() === key.toLowerCase());
          const href = `/projects/${key}`;
          if (match?.name) {
            primeTabTitle(href, match.name);
          }
          const state: ProjectLocationState = {
            from: "projects",
            listHref: `${location.pathname}${location.searchStr ?? ""}`,
            ...(match?.type ? { projectType: match.type } : {}),
          };
          navigate(href, { state });
        }}
        onStatusChange={(projectId, status) => {
          void workspace.patchProject(projectId, { status });
        }}
        onPriorityChange={(projectId, priority) => {
          void workspace.patchProject(projectId, { priority });
        }}
        onStartDateChange={(projectId, startDate) => {
          void workspace.patchProject(projectId, {
            startDate: startDate ? startDate.toISOString() : null,
          });
        }}
        onDueDateChange={(projectId, dueDate) => {
          void workspace.patchProject(projectId, {
            dueDate: dueDate ? dueDate.toISOString() : null,
          });
        }}
        onOrganizationChange={(projectId, organizationId) => {
          void workspace.patchProject(projectId, { organizationId });
        }}
        onProjectAreaChange={(projectId, area) => {
          void workspace.patchProject(projectId, { area, areaId: null });
        }}
        onCreateProject={async ({ status, name }) => {
          const organizationId = organizationRouteParam
            ? (organizations.find((org) =>
                organizationMatchesSlug(org, organizationRouteParam))?.id ?? null)
            : null;
          pendingCreatedProjectNameRef.current = name;
          return workspace.createProject({
            name,
            status,
            organizationId,
          });
        }}
        onCreatedProject={(id, key) => {
          if (!key) return;
          const pendingName = pendingCreatedProjectNameRef.current;
          pendingCreatedProjectNameRef.current = null;
          const createdName =
            pendingName ??
            projects.find((entry) => entry.id === id)?.name ??
            projects.find(
              (entry) => entry.key.toLowerCase() === key.toLowerCase())?.name;
          if (organizationRouteParam) {
            const href = getOrganizationProjectHref(
              organizationRouteParam,
              key);
            if (createdName) primeTabTitle(href, createdName);
            navigate(href);
            return;
          }
          const href = `/projects/${key}`;
          if (createdName) primeTabTitle(href, createdName);
          const state: ProjectLocationState = {
            from: "projects",
            listHref: `${location.pathname}${location.searchStr ?? ""}`,
          };
          navigate(href, { state });
        }}
        onCreateArea={async ({ parent, name }) =>
          workspace.createArea({ parent, name })
        }
        onReorder={(request) => {
          const patches = projectReorderPatches(projects, request);
          for (const patch of patches) {
            void workspace.patchProject(patch.id, {
              status: patch.status,
              sortOrder: patch.sortOrder,
            });
          }
        }}
      />
    );
  }

  if (!selected) {
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-empty">
          <p>Project not found.</p>
        </div>
      </div>
    );
  }

  const project = selected;
  const projectKey = project.key;
  const navType = projectTypeFromLocationState(location.state);
  const cachedType =
    recalledProjectType(project.id) ?? recalledProjectType(projectKey);
  // Nav/list cache wins over a missing-type→"general" default so the
  // codebase workbench mounts immediately instead of flashing ProjectDetailView.
  const effectiveType =
    navType === "codebase" ||
    cachedType === "codebase" ||
    project.type === "codebase"
      ? "codebase"
      : navType === "domeinname" ||
          cachedType === "domeinname" ||
          project.type === "domeinname"
        ? "domeinname"
        : (project.type ?? navType ?? cachedType ?? "general");
  // Tasks (list or board) and Docs stay in the codebase workbench so the left
  // Tasks/Files/Docs/Commits/PRs/Updates sidebar remains; only letters use the
  // default project section chrome.
  const isCodebaseWorkbench =
    effectiveType === "codebase" &&
    (activeSection === "overview" ||
      activeSection === "tasks" ||
      activeSection === "documents" ||
      activeSection === "updates" ||
      isCodebaseWorkbenchPath(location.pathname, projectKey));
  const isDomainWorkbench = effectiveType === "domeinname";

  const patchSelected = (
    patch: Partial<WorkspaceProject>) => {
    setProjectOverlay((current) => ({
      ...current,
      [project.id]: { ...current[project.id], ...patch },
    }));
  };

  const taskProgress = computeTaskProgress(projectTasks);

  function handleSectionChange(next: ProjectSectionId) {
    navigate(getScopedProjectSectionHref(projectKey, next, routeScope), {
      replace: true,
    });
  }

  function navigateProjectTasksView(nextView: ListBoardView) {
    persistListBoardView(nextView, TASKS_LIST_BOARD_STORAGE_KEY);
    // Codebase projects keep list/board on the workbench base path so the
    // left sidebar stays mounted (same as list view). Default projects use
    // the `/tasks` section route.
    const base =
      effectiveType === "codebase" || effectiveType === "domeinname"
        ? getScopedProjectBasePath(projectKey, routeScope)
        : getScopedProjectSectionHref(projectKey, "tasks", routeScope);
    navigate(
      nextView === "board"
        ? `${base}?${LIST_BOARD_VIEW_SEARCH_PARAM}=board`
        : base);
  }

  function renderSection(sectionId: ProjectSectionId) {
    if (sectionId === "tasks") {
      return (
        <ProjectTasksView
          tasks={projectTasks}
          assigneeOptions={assigneeOptions}
          view={projectTasksView}
          onViewChange={navigateProjectTasksView}
          renderTaskTitleTrailing={(task) =>
            isEmailTaskListItem(task)
              ? null
              : renderTaskAgentTitleTrailing({
                  taskId: task.id,
                  agentChatId: task.agentChatId,
                  taskStatus: task.status,
                  agentStatus,
                  workingShownOnStatusIcon: true,
                })
          }
          isTaskAgentWorking={(task) =>
            isEmailTaskListItem(task)
              ? false
              : isTaskAgentWorkingForUi(task, agentStatus)
          }
          onSelectTask={(id) => {
            const task = projectTasks.find((entry) => entry.id === id);
            const emailHref = task
              ? getEmailTaskListHref(task, { list: "project" })
              : null;
            if (emailHref) {
              if (task?.title) primeTabTitle(emailHref, task.title);
              navigate(emailHref);
              return;
            }
            const href =
              task?.number != null
                ? getScopedProjectTaskHref(projectKey, task.number, routeScope)
                : `${getScopedProjectSectionHref(projectKey, "tasks", routeScope)}/${id}`;
            if (task?.title) {
              primeTabTitle(href, task.title);
            }
            navigate(href);
          }}
          onStatusChange={(taskId, status) => {
            const task = projectTasks.find((entry) => entry.id === taskId);
            if (task && isEmailTaskListItem(task)) {
              void patchEmailTaskListItem(client, task, { status });
              return;
            }
            void workspace.patchTask(taskId, { status });
          }}
          onPriorityChange={(taskId, priority) => {
            const task = projectTasks.find((entry) => entry.id === taskId);
            if (task && isEmailTaskListItem(task)) {
              void patchEmailTaskListItem(client, task, { priority });
              return;
            }
            void workspace.patchTask(taskId, { priority });
          }}
          onDueDateChange={(taskId, dueDate) => {
            const task = projectTasks.find((entry) => entry.id === taskId);
            if (task && isEmailTaskListItem(task)) {
              void patchEmailTaskListItem(client, task, {
                dueDate: dueDate ? dueDate.toISOString() : null,
              });
              return;
            }
            void workspace.patchTask(taskId, {
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onAssigneeChange={(taskId, assigneeId) => {
            const task = projectTasks.find((entry) => entry.id === taskId);
            if (task && isEmailTaskListItem(task)) {
              const assignee = assigneeId
                ? workspace.contacts.find((entry) => entry.id === assigneeId) ??
                  null
                : null;
              void patchEmailTaskListItem(
                client,
                task,
                { assigneeId },
                { assigneeName: assignee?.name ?? null });
              return;
            }
            void workspace.patchTask(taskId, { assigneeId });
          }}
          onBulkDelete={async (taskIds) => {
            for (const taskId of taskIds) {
              const task = projectTasks.find((entry) => entry.id === taskId);
              if (task && isEmailTaskListItem(task)) continue;
              await workspace.softDeleteTask(taskId);
            }
          }}
          onReorder={(request) => {
            const patches = taskReorderPatches(projectTasks, request).filter(
              (patch) => {
                const task = projectTasks.find((entry) => entry.id === patch.id);
                return !task || !isEmailTaskListItem(task);
              });
            for (const patch of patches) {
              void workspace.patchTask(patch.id, {
                status: patch.status,
                sortOrder: patch.sortOrder,
              });
            }
          }}
          onCreateTask={async ({ status, title }) => {
            const created = await workspace.createProjectTask({
              projectId: project.id,
              title,
              status,
            });
            pendingCreatedTaskRef.current = {
              title,
              number: created?.number ?? null,
            };
            return created;
          }}
          onCreatedTask={(taskId) => {
            const pending = pendingCreatedTaskRef.current;
            pendingCreatedTaskRef.current = null;
            const task = tasks.find((entry) => entry.id === taskId);
            const number = task?.number ?? pending?.number ?? null;
            const title = task?.title ?? pending?.title ?? null;
            const href =
              number != null
                ? getScopedProjectTaskHref(projectKey, number, routeScope)
                : `${getScopedProjectSectionHref(projectKey, "tasks", routeScope)}/${taskId}`;
            if (title) {
              primeTabTitle(href, title);
            }
            navigate(href);
          }}
        />
      );
    }

    if (sectionId === "letters") {
      const record = selectedLetterRecord;

      const showCompose =
        composingLetter || projectLetters.length === 0;

      return (
        <ProjectLettersView>
          {showCompose ? (
            <LetterComposeView
              organizationOptions={letterOrganizationOptions}
              contacts={contacts}
              projectOptions={composeProjectOptions}
              onCreateOrganizationFromQuery={(query) =>
                workspace.createOrganization({ name: query })
              }
              onCreateContactFromQuery={(query, organizationId) =>
                workspace.createContact({
                  name: query,
                  organizationId,
                })
              }
              pdfUploading={composePdfUploading}
              onSubmit={(payload) => {
                const orgId =
                  payload.organizationId ?? project.organizationId ?? null;
                void (async () => {
                  try {
                    const created = await workspace.createLetter({
                      title: payload.title,
                      body: payload.body,
                      status: payload.status,
                      organizationId: orgId,
                      contactId: payload.contactId,
                      projectId: project.id,
                      dueDate: payload.dueDate
                        ? payload.dueDate.toISOString()
                        : null,
                      receivedDate: payload.receivedDate
                        ? payload.receivedDate.toISOString()
                        : null,
                    });
                    setOmittedLetterIds([]);
                      if (payload.navigateAfterCreate !== false) {
                        navigate(
                          resolveLetterDetailHref({
                            id: created.id,
                            number: created.number,
                            listBaseHref: getScopedProjectSectionHref(
                              projectKey,
                              "letters",
                              routeScope,
                            ),
                          }),
                          { replace: true },
                        );
                      }
                    if (payload.pdfFile) {
                      setComposePdfUploading(true);
                      const upload = await uploadLetterPdfFile(
                        client,
                        created.id,
                        payload.pdfFile);
                      setComposePdfUploading(false);
                      if (!upload.ok) {
                        console.error(upload.error);
                      }
                    }
                  } catch (error) {
                    console.error("[desktop] create project letter", error);
                  }
                })();
              }}
            />
          ) : letterSlug && !selectedLetter ? (
            <LetterDetailSkeleton />
          ) : selectedLetter ? (
            <>
              <RegisterEntityDeleteAction
                entityLabel={
                  selectedLetterDisplayId
                    ? `letter ${selectedLetterDisplayId}`
                    : "letter"
                }
                onDelete={handleDeleteLetter}
              />
              <LetterDetailView
                letter={{
                  id: selectedLetter.id,
                  title: letterTitleOverride ?? selectedLetter.title,
                  status: letterStatusOverride ?? selectedLetter.status,
                  organizationId: record?.organizationId ?? null,
                  organizationName:
                    organizations.find(
                      (org) => org.id === record?.organizationId)?.name ?? null,
                  contactId: record?.contactId ?? null,
                  contactName:
                    contacts.find((contact) => contact.id === record?.contactId)
                      ?.name ?? null,
                  receivedDate: record?.receivedDate
                    ? new Date(record.receivedDate).getTime()
                    : null,
                  dueDate: record?.dueDate
                    ? new Date(record.dueDate).getTime()
                    : null,
                  projectKey,
                  projectName: project.name,
                  body: letterContext,
                  displayId: selectedLetterDisplayId,
                }}
                showPdfDock
                hasPdfDocument={pdfPanel.hasPdf}
                hasLegacyPdf={hasLivePdf}
                legacyPdfTitle={
                  selectedLetterRecord?.originalFilename || "Document.pdf"
                }
                pdfAttachments={pdfPanel.attachments}
                selectedAttachmentId={pdfPanel.selectedAttachmentId}
                onSelectAttachment={pdfPanel.selectAttachment}
                onRenameAttachment={async (attachmentId, originalFilename) => {
                  const result = await pdfPanel.renameAttachment(
                    attachmentId,
                    originalFilename,
                  );
                  if (result.ok) {
                    const primaryId = pdfPanel.attachments[0]?.id;
                    if (attachmentId === primaryId) {
                      setLetterTitleOverride(
                        letterPdfSubjectFromFilename(originalFilename),
                      );
                    }
                  }
                  return result;
                }}
                onAttachmentRenamed={pdfPanel.reloadAttachments}
                onDeleteAttachment={pdfPanel.deleteAttachment}
                onReorderAttachments={async (orderedIds) => {
                  const result = await pdfPanel.reorderAttachments(orderedIds);
                  if (!result.ok) {
                    window.alert(
                      `Could not save PDF order.\n${result.error}\n\nIf you are on Prod, switch Settings → Backend to Dev (local API), or deploy the API with the reorder route.`);
                  }
                }}
                pdfOpen={pdfPanel.pdfOpen}
                onTogglePdf={pdfPanel.togglePdfOpen}
                pdfMaximized={pdfPanel.pdfMaximized}
                onTogglePdfMaximize={pdfPanel.togglePdfMaximized}
                pdfUploading={pdfPanel.uploading}
                pdfChildren={
                  pdfPanel.hasPdf ? (
                    <LetterPdfPreview
                      letterId={selectedLetter.id}
                      attachmentId={pdfPanel.selectedAttachmentId}
                      vaultStorageKey={
                        pdfPanel.selectedAttachmentId
                          ? (pdfPanel.attachments.find(
                              (entry) =>
                                entry.id === pdfPanel.selectedAttachmentId,
                            )?.storageKey ?? null)
                          : (selectedLetterRecord?.storageKey ?? null)
                      }
                      useApi={pdfPanel.hasPdf}
                      revision={pdfPanel.revision}
                    />
                  ) : null
                }
                onUploadPdfFile={(file) => {
                  void pdfPanel.uploadPdfFile(file);
                }}
                onUploadPdf={() => {
                  void pdfPanel.uploadPdf();
                }}
                onStatusChange={(next) => {
                  setLetterStatusOverride(next);
                  void workspace.patchLetter(selectedLetter.id, {
                    status: next,
                  });
                }}
                onDueDateChange={(next) => {
                  void workspace.patchLetter(selectedLetter.id, {
                    dueDate: next ? next.toISOString() : null,
                  });
                }}
                onReceivedDateChange={(next) => {
                  void workspace.patchLetter(selectedLetter.id, {
                    receivedDate: next ? next.toISOString() : null,
                  });
                }}
                onOrganizationChange={(next) => {
                  void workspace.patchLetter(selectedLetter.id, {
                    organizationId: next,
                  });
                }}
                onContactChange={(next) => {
                  void workspace.patchLetter(selectedLetter.id, {
                    contactId: next,
                  });
                }}
                onProjectChange={(next) => {
                  const nextProject = next
                    ? projectList.find((entry) => entry.key === next) ?? null
                    : null;
                  void workspace.patchLetter(selectedLetter.id, {
                    projectId: nextProject?.id ?? null,
                  });
                }}
                onSaveBody={(body) => {
                  void workspace.patchLetter(selectedLetter.id, {
                    context: body,
                  });
                }}
                onSaveTitle={async (title) => {
                  const trimmed = title.trim();
                  if (!trimmed) {
                    return {
                      ok: false as const,
                      error: "Letter title is required.",
                    };
                  }
                  try {
                    await workspace.patchLetter(selectedLetter.id, {
                      title: trimmed,
                    });
                    void pdfPanel.reloadAttachments();
                    return { ok: true as const };
                  } catch (error) {
                    return {
                      ok: false as const,
                      error:
                        error instanceof Error
                          ? error.message
                          : "Could not rename letter.",
                    };
                  }
                }}
                organizationOptions={letterOrganizationOptions}
                contactOptions={buildContactDropdownOptions(
                  record?.organizationId
                    ? contacts.filter(
                        (contact) =>
                          contact.organizationId === record.organizationId)
                    : [])}
                projectOptions={projectOptions}
                organizationNavigateHref={
                  record?.organizationId
                    ? `/organizations/${record.organizationId}`
                    : null
                }
                contactNavigateHref={
                  record?.contactId ? `/contacts/${record.contactId}` : null
                }
                projectNavigateHref={getScopedProjectBasePath(
                  projectKey,
                  routeScope)}
                onCreateOrganizationFromQuery={(query) => {
                  void workspace
                    .createOrganization({ name: query })
                    .then((created) => {
                      void workspace.patchLetter(selectedLetter.id, {
                        organizationId: created.id,
                      });
                    });
                }}
                onCreateContactFromQuery={(query) => {
                  const orgId = record?.organizationId;
                  if (!orgId) return;
                  void workspace
                    .createContact({ name: query, organizationId: orgId })
                    .then((created) => {
                      void workspace.patchLetter(selectedLetter.id, {
                        contactId: created.id,
                      });
                    });
                }}
              />
            </>
          ) : null}
        </ProjectLettersView>
      );
    }

    if (sectionId === "documents") {
      const showEmptyCreate =
        composingDocument || readableProjectDocuments.length === 0;

      return (
        <ProjectDocumentsView>
          {showEmptyCreate ? (
            <DocumentsEmptyCreateView
              creating={creatingDocument}
              onCreate={async ({ title, content }) => {
                setCreatingDocument(true);
                try {
                  const created = await workspace.createProjectDocument({
                    projectId: project.id,
                    title,
                    content,
                  });
                  const item: KnowledgeListItem = {
                    id: created.id,
                    title,
                    path: created.path,
                    projectId: project.id,
                    kind: "document",
                  };
                  setLocalDocuments((current) =>
                    current.some((entry) => entry.id === created.id)
                      ? current
                      : [...current, item]);
                  writeDocumentContentCache(created.id, {
                    content,
                    contentVersion: created.contentVersion,
                  });
                  setPendingEditDocumentId(created.id);
                  setOmittedDocumentIds([]);
                  setComposingDocument(false);
                  navigate(
                    getScopedProjectDocumentHref(
                      projectKey,
                      created.path || created.id,
                      routeScope),
                    { replace: true });
                  return created;
                } finally {
                  setCreatingDocument(false);
                }
              }}
            />
          ) : documentPath && !selectedDocument ? (
            <DocumentDetailSkeleton />
          ) : selectedDocument ? (
            documentContent.loading ? (
              <DocumentDetailSkeleton />
            ) : (
              <>
                <RegisterEntityDeleteAction
                  entityLabel={`document "${selectedDocument.title}"`}
                  onDelete={handleDeleteDocument}
                />
                <MarkdownDocumentDetailView
                  sectionLabel="Documents"
                  title={selectedDocument.title}
                  resetKey={selectedDocument.id}
                  startInEditMode={
                    pendingEditDocumentId === selectedDocument.id
                  }
                  icon={
                    <DocumentDetailIcon
                      documentId={selectedDocument.id}
                      icon={selectedDocument.icon ?? null}
                      title={selectedDocument.title}
                      onSaveIcon={(icon) =>
                        workspace.updateDocumentIcon(selectedDocument.id, icon)
                      }
                    />
                  }
                  initialBody={getDocumentEditorBody(
                    documentContent.initialBody,
                    selectedDocument.title)}
                  onSave={async (nextEditorBody) => {
                    await documentContent.onSave(
                      serializeDocumentBody(nextEditorBody));
                  }}
                  onSaveTitle={async (title) => {
                    const result = await workspace.renameDocument(
                      selectedDocument.id,
                      title);
                    if (result.ok) {
                      setLocalDocuments((current) =>
                        current.map((doc) =>
                          doc.id === selectedDocument.id
                            ? { ...doc, title: title.trim() }
                            : doc));
                    }
                    return result;
                  }}
                />
              </>
            )
          ) : (
            // Index with docs present — skeleton while auto-open redirects (Next parity).
            <DocumentDetailSkeleton />
          )}
        </ProjectDocumentsView>
      );
    }

    if (sectionId === "updates") {
      return <DesktopProjectUpdatesPanel projectId={project.id} />;
    }

    return null;
  }

  if (isCodebaseWorkbench) {
    return (
      <>
        <RegisterPageTitle
          active={keepAliveActive}
          href={location.pathname}
          title={project.name}
        />
        <RegisterEntityDuplicateAction
          confirm="project"
          entityLabel={`project "${project.name}"`}
          onDuplicate={handleDuplicateProject}
        />
        <RegisterEntityDeleteAction
          entityLabel={`project "${project.name}"`}
          onDelete={handleDeleteProject}
        />
        <CodebaseProjectWorkbench
          project={{
            ...project,
            status: project.status as ProjectStatus,
            organizationId: project.organizationId ?? null,
            type: "codebase",
            areaId: project.areaId ?? null,
            localWorkingDirectory: project.localWorkingDirectory ?? null,
            githubRepository: project.githubRepository ?? null,
            healthCheckMode: project.healthCheckMode ?? null,
            healthCheckDomain: project.healthCheckDomain ?? null,
            summary: workspace.projectSummaries[project.id] ?? "",
            description: workspace.projectDescriptions[project.id] ?? "",
          }}
          projects={projectList.map((entry) => ({
            ...entry,
            status: entry.status as ProjectStatus,
            organizationId: entry.organizationId ?? null,
            type: entry.type ?? "general",
            localWorkingDirectory: entry.localWorkingDirectory ?? null,
            githubRepository: entry.githubRepository ?? null,
            healthCheckMode: entry.healthCheckMode ?? null,
            healthCheckDomain: entry.healthCheckDomain ?? null,
          }))}
          organizations={Object.values(workspace.organizationDetails)}
          nestedAreas={mapWorkspaceNestedAreas(workspace.areas)}
          tasks={[]}
          taskProgress={taskProgress}
          routeScope={routeScope}
          pathname={location.pathname}
          tasksPanel={renderSection("tasks")}
          docsPanel={
            <CodebaseRepoDocsDetail
              projectId={project.id}
              documentPath={documentPath}
              items={repoDocs.items}
              loading={repoDocs.loading}
              error={repoDocs.error}
              workingDirectoryMissing={!project.localWorkingDirectory?.trim()}
            />
          }
          updatesPanel={<DesktopProjectUpdatesPanel projectId={project.id} />}
          docsListPanel={
            <DesktopCodebaseDocsListPanel
              keyboardEnabled={activeSection === "documents"}
              prefetchDocuments={false}
              pathname={location.pathname}
              items={repoDocs.items}
              getDocumentHref={getCodebaseRepoDocHref}
              emptyLabel={codebaseDocsEmptyLabel}
            />
          }
          onCreateOrganizationFromQuery={(query) => {
            void workspace
              .createOrganization({ name: query })
              .then((created) => {
                patchSelected({ organizationId: created.id });
                void workspace.patchProject(project.id, {
                  organizationId: created.id,
                });
              });
          }}
          onProjectPatched={(patch: Record<string, unknown>) => {
            const localPatch: Partial<WorkspaceProject> = {};
            if (typeof patch.name === "string") localPatch.name = patch.name;
            if (typeof patch.key === "string") localPatch.key = patch.key;
            if (patch.status != null) {
              localPatch.status = patch.status as WorkspaceProject["status"];
            }
            if (typeof patch.priority === "number") {
              localPatch.priority = patch.priority;
            }
            if ("icon" in patch) {
              localPatch.icon = (patch.icon as string | null) ?? null;
            }
            if (typeof patch.type === "string") localPatch.type = patch.type;
            if ("area" in patch) {
              localPatch.area = patch.area as WorkspaceProject["area"];
            }
            if ("areaId" in patch) {
              localPatch.areaId = (patch.areaId as string | null) ?? null;
            }
            if ("organizationId" in patch) {
              localPatch.organizationId =
                (patch.organizationId as string | null) ?? null;
            }
            if ("localWorkingDirectory" in patch) {
              localPatch.localWorkingDirectory =
                (patch.localWorkingDirectory as string | null) ?? null;
            }
            if ("githubRepository" in patch) {
              localPatch.githubRepository =
                (patch.githubRepository as string | null) ?? null;
            }
            if ("healthCheckMode" in patch) {
              localPatch.healthCheckMode =
                (patch.healthCheckMode as "simple" | "advanced" | null) ?? null;
            }
            if ("healthCheckDomain" in patch) {
              localPatch.healthCheckDomain =
                (patch.healthCheckDomain as string | null) ?? null;
            }
            if ("provider" in patch) {
              localPatch.provider = (patch.provider as string | null) ?? null;
            }
            if ("category" in patch) {
              localPatch.category = (patch.category as string | null) ?? null;
            }
            if ("startDate" in patch) {
              localPatch.startDate = patch.startDate
                ? new Date(String(patch.startDate)).getTime()
                : null;
            }
            if ("dueDate" in patch) {
              localPatch.dueDate = patch.dueDate
                ? new Date(String(patch.dueDate)).getTime()
                : null;
            }
            patchSelected(localPatch);
            void workspace.patchProject(project.id, patch);
          }}
        />
      </>
    );
  }

  if (isDomainWorkbench) {
    const domainProject = {
      ...project,
      organizationId: project.organizationId ?? null,
      type: "domeinname" as const,
      provider: project.provider ?? null,
      summary: workspace.projectSummaries[project.id] ?? "",
      description: workspace.projectDescriptions[project.id] ?? "",
      taskProgress,
    };

    const saveDomainName = async (name: string) => {
      patchSelected({ name });
      try {
        await workspace.patchProject(project.id, { name });
        return { ok: true as const };
      } catch {
        return { ok: false as const, error: "Could not rename project" };
      }
    };

    const saveDomainKey = async (key: string) => {
      const conflict = projectList.some(
        (entry) =>
          entry.id !== project.id &&
          entry.key.toLowerCase() === key.toLowerCase(),
      );
      if (conflict) {
        return { ok: false as const, error: "Project key already exists." };
      }
      const previousKey = project.key;
      patchSelected({ key });
      try {
        await workspace.patchProject(project.id, { key });
      } catch (error) {
        patchSelected({ key: previousKey });
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Could not update project ID.",
        };
      }
      const nextPath = buildProjectKeyRenameRedirectPath(
        location.pathname,
        previousKey,
        key,
      );
      if (nextPath !== location.pathname) {
        navigate(nextPath, { replace: true });
      }
      return { ok: true as const, key };
    };

    const domainDetailProps = {
      project: domainProject,
      organizationOptions: domainOrganizationOptions,
      nestedAreas: mapWorkspaceNestedAreas(workspace.areas),
      knownTags: knownDomainTags,
      loadDetail: loadDomainRegistrarDetail,
      loadCloudflareDnsRecords,
      purgeCloudflareCache,
      onSaveName: saveDomainName,
      onSaveKey: saveDomainKey,
      onStatusChange: (status: ProjectStatus) => {
        patchSelected({ status });
        void workspace.patchProject(project.id, { status });
      },
      onPriorityChange: (priority: number) => {
        patchSelected({ priority });
        void workspace.patchProject(project.id, { priority });
      },
      onAreaChange: (area: ProjectArea | null) => {
        patchSelected({ area, areaId: null });
        void workspace.patchProject(project.id, { area, areaId: null });
      },
      onAreaIdChange: (areaId: string | null) => {
        patchSelected({ areaId });
        void workspace.patchProject(project.id, { areaId });
      },
      onOrganizationChange: (organizationId: string | null) => {
        patchSelected({ organizationId });
        void workspace.patchProject(project.id, { organizationId });
      },
      onCreateOrganizationFromQuery: (query: string) => {
        void workspace.createOrganization({ name: query }).then((created) => {
          patchSelected({ organizationId: created.id });
          void workspace.patchProject(project.id, {
            organizationId: created.id,
          });
        });
      },
      onIconChange: (icon: string | null) => {
        patchSelected({ icon });
        void workspace.patchProject(project.id, { icon });
      },
      onTagsChange: async (tags: string[]) => {
        try {
          const result = await updateDomainTags(project.name, tags);
          await workspace.patchProject(project.id, {
            icon: buildTransipDomainProjectIcon(result.tags),
          });
          return { ok: true as const, tags: result.tags };
        } catch (error) {
          return {
            ok: false as const,
            error:
              error instanceof Error ? error.message : "Could not update tags",
          };
        }
      },
      onContactsChange: async (contacts: DomainRegistrarContact[]) => {
        try {
          const result = await updateDomainContacts(project.name, contacts);
          return { ok: true as const, contacts: result.contacts };
        } catch (error) {
          return {
            ok: false as const,
            error:
              error instanceof Error
                ? error.message
                : "Could not update WHOIS contacts",
          };
        }
      },
    };

    return (
      <>
        <RegisterPageTitle
          active={keepAliveActive}
          href={location.pathname}
          title={project.name}
        />
        <RegisterEntityDuplicateAction
          confirm="project"
          entityLabel={`project "${project.name}"`}
          onDuplicate={handleDuplicateProject}
        />
        <RegisterEntityDeleteAction
          entityLabel={`project "${project.name}"`}
          onDelete={handleDeleteProject}
        />
        <DomainProjectWorkbench tasksPanel={renderSection("tasks")}>
          <DomainDetailView {...domainDetailProps} />
        </DomainProjectWorkbench>
      </>
    );
  }

  return (
    <>
      <RegisterPageTitle
        active={keepAliveActive}
        href={location.pathname}
        title={project.name}
      />
      {activeSection === "overview" ? (
        <>
          <RegisterEntityDuplicateAction
            confirm="project"
            entityLabel={`project "${project.name}"`}
            onDuplicate={handleDuplicateProject}
          />
          <RegisterEntityDeleteAction
            entityLabel={`project "${project.name}"`}
            onDelete={handleDeleteProject}
          />
        </>
      ) : null}
      <ProjectDetailView
        project={{
          ...project,
          organizationId: project.organizationId ?? null,
          type: project.type ?? "general",
          healthCheckMode: project.healthCheckMode ?? null,
          healthCheckDomain: project.healthCheckDomain ?? null,
          summary:
            workspace.projectSummaries[project.id] ??
            "",
          description:
            workspace.projectDescriptions[project.id] ??
            "",
          taskProgress,
        }}
        nestedAreas={mapWorkspaceNestedAreas(workspace.areas)}
        section={activeSection}
        onSectionChange={handleSectionChange}
        renderSection={renderSection}
        organizationOptions={organizationOptions}
        organizationNavigateHref={
          project.organizationId
            ? `/organizations/${
                organizations.find((org) => org.id === project.organizationId)
                  ?.key ?? project.organizationId
              }`
            : null
        }
        onSaveName={async (name) => {
          patchSelected({ name });
          try {
            await workspace.patchProject(project.id, { name });
            return { ok: true };
          } catch (error) {
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not save project name.",
            };
          }
        }}
        onSaveKey={async (key) => {
          const conflict = projectList.some(
            (entry) =>
              entry.id !== project.id &&
              entry.key.toLowerCase() === key.toLowerCase());
          if (conflict) {
            return { ok: false, error: "Project key already exists." };
          }
          const previousKey = project.key;
          patchSelected({ key });
          try {
            await workspace.patchProject(project.id, { key });
          } catch (error) {
            patchSelected({ key: previousKey });
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not update project ID.",
            };
          }
          const nextPath = buildProjectKeyRenameRedirectPath(
            location.pathname,
            previousKey,
            key);
          if (nextPath !== location.pathname) {
            navigate(nextPath, { replace: true });
          }
          return { ok: true, key };
        }}
        onSaveSummary={(summary) => {
          void workspace.patchProject(project.id, { summary });
        }}
        onSaveDescription={(description) => {
          void workspace.patchProject(project.id, { description });
        }}
        onIconChange={(icon) => {
          patchSelected({ icon });
          void workspace.patchProject(project.id, { icon });
        }}
        onStatusChange={(status: ProjectStatus) => {
          patchSelected({ status });
          void workspace.patchProject(project.id, { status });
        }}
        onPriorityChange={(priority) => {
          patchSelected({ priority });
          void workspace.patchProject(project.id, { priority });
        }}
        onTypeChange={(type) => {
          const patch: {
            type: string;
            category?: null;
            healthCheckMode?: null;
            healthCheckDomain?: null;
          } = { type };
          if (type !== "email") {
            patch.category = null;
          }
          if (type !== "codebase") {
            patch.healthCheckMode = null;
            patch.healthCheckDomain = null;
          }
          patchSelected(patch);
          void workspace.patchProject(project.id, patch);
        }}
        onProviderChange={(provider) => {
          const patch: {
            provider: string | null;
            icon?: string;
          } = { provider };
          if (provider === "transip") {
            patch.icon = getProjectProviderDefaultIcon("transip");
          }
          patchSelected(patch);
          void workspace.patchProject(project.id, patch);
        }}
        onCategoryChange={(category) => {
          const patch: {
            category: string | null;
            icon?: string;
          } = { category };
          if (category) {
            patch.icon = getProjectEmailCategoryDefaultIcon(category);
          }
          patchSelected(patch);
          void workspace.patchProject(project.id, patch);
        }}
        onHealthCheckChange={(next) => {
          patchSelected(next);
          void workspace.patchProject(project.id, next);
        }}
        onAreaChange={(area: ProjectArea | null) => {
          patchSelected({ area, areaId: null });
          void workspace.patchProject(project.id, { area, areaId: null });
        }}
        onAreaIdChange={(areaId) => {
          patchSelected({ areaId });
          void workspace.patchProject(project.id, { areaId });
        }}
        onOrganizationChange={(organizationId) => {
          patchSelected({ organizationId });
          void workspace.patchProject(project.id, { organizationId });
        }}
        onCreateOrganizationFromQuery={(query) => {
          void workspace.createOrganization({ name: query }).then((created) => {
            patchSelected({ organizationId: created.id });
            void workspace.patchProject(project.id, {
              organizationId: created.id,
            });
          });
        }}
        onStartDateChange={(startDate) => {
          patchSelected({ startDate: startDate ? startDate.getTime() : null });
          void workspace.patchProject(project.id, {
            startDate: startDate ? startDate.toISOString() : null,
          });
        }}
        onDueDateChange={(dueDate) => {
          patchSelected({ dueDate: dueDate ? dueDate.getTime() : null });
          void workspace.patchProject(project.id, {
            dueDate: dueDate ? dueDate.toISOString() : null,
          });
        }}
      />
    </>
  );
}
