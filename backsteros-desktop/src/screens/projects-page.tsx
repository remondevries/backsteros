import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  DocumentsEmptyCreateView,
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
  ProjectOverviewSkeleton,
  ProjectsListSkeleton,
  ProjectTasksView,
  ProjectsOverviewView,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  TASKS_LIST_BOARD_STORAGE_KEY,
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
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
  isProjectSectionId,
  letterMatchesSlug,
  organizationMatchesSlug,
  parseListBoardViewFromLocation,
  parseProjectAreaFilterFromLocation,
  persistListBoardView,
  serializeDocumentBody,
  type KnowledgeListItem,
  type ListBoardView,
  type ProjectArea,
  type ProjectOverviewRowProject,
  type ProjectRouteScope,
  type ProjectSectionId,
  type ProjectStatus,
  type TaskStatus,
  projectReorderPatches,
} from "@backsteros/ui";

import { LetterPdfPreview } from "../components/letter-pdf-viewer";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useDesktopApi } from "../lib/api-context";
import { uploadLetterPdfFile } from "../lib/letter-pdf-upload";
import { useDesktopDocumentContent } from "../lib/use-document-content";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useLetterPdfPanel } from "../lib/use-letter-pdf-panel";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

type WorkspaceProject = ProjectOverviewRowProject & {
  organizationId?: string | null;
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

export function ProjectsPage({
  organizationRouteParam,
  organizationName,
}: ProjectsPageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    slug,
    projectSlug,
    section: sectionParam,
    letterSlug,
  } = useParams<{
    slug?: string;
    projectSlug?: string;
    section?: string;
    letterSlug?: string;
  }>();
  const routeSlug = projectSlug ?? slug;
  const documentPath =
    getSelectedProjectDocumentPathFromPathname(location.pathname) ?? null;
  const routeScope = useMemo<ProjectRouteScope>(
    () =>
      organizationRouteParam
        ? { kind: "organization", organizationRouteParam }
        : { kind: "standalone" },
    [organizationRouteParam],
  );
  const projectsListHref = organizationRouteParam
    ? getOrganizationSectionHref(organizationRouteParam, "projects")
    : "/projects";
  const workspace = useDesktopWorkspaceData();
  const { client } = useDesktopApi();
  const [projectOverlay, setProjectOverlay] = useState<
    Record<string, Partial<WorkspaceProject>>
  >({});
  const [localDocuments, setLocalDocuments] = useState<KnowledgeListItem[]>([]);
  const [composingDocument, setComposingDocument] = useState(false);
  const [composePdfUploading, setComposePdfUploading] = useState(false);
  const [letterStatusOverride, setLetterStatusOverride] =
    useState<TaskStatus | null>(null);

  const { tasks, letters, organizations, contacts } = workspace;
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );
  const projects = workspace.projects.map((project) => ({
    ...project,
    ...projectOverlay[project.id],
  }));
  const documents = useMemo(
    () => [...workspace.projectDocuments, ...localDocuments],
    [localDocuments, workspace.projectDocuments],
  );

  const selected = useMemo(() => {
    if (!routeSlug) return null;
    return (
      projects.find(
        (project) =>
          project.key.toLowerCase() === routeSlug.toLowerCase() ||
          project.id === routeSlug,
      ) ?? null
    );
  }, [projects, routeSlug]);

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
          { sensitivity: "base" },
        ),
      );
  }, [documents, selected]);

  const projectLetters = useMemo(() => {
    if (!selected) return [];
    return letters.filter(
      (letter) =>
        letter.projectId === selected.id ||
        (letter.projectKey &&
          letter.projectKey.toLowerCase() === selected.key.toLowerCase()),
    );
  }, [letters, selected]);

  const selectedDocument = useMemo(() => {
    if (!documentPath) return null;
    return (
      projectDocuments.find(
        (document) =>
          document.kind !== "folder" &&
          (document.id === documentPath ||
            document.path === documentPath ||
            document.path === decodeURIComponent(documentPath)),
      ) ?? null
    );
  }, [documentPath, projectDocuments]);

  const documentContent = useDesktopDocumentContent(
    selectedDocument?.id ?? null,
  );

  const projectsListView = useMemo(
    () =>
      parseListBoardViewFromLocation(
        location.pathname,
        location.search,
        PROJECTS_LIST_BOARD_STORAGE_KEY,
      ),
    [location.pathname, location.search],
  );

  const projectTasksView = useMemo(
    () =>
      parseListBoardViewFromLocation(
        location.pathname,
        location.search,
        TASKS_LIST_BOARD_STORAGE_KEY,
      ),
    [location.pathname, location.search],
  );

  const composingLetter = letterSlug === "new";
  const selectedLetter = useMemo(() => {
    if (!letterSlug || composingLetter) return null;
    return (
      projectLetters.find((letter) =>
        letterMatchesSlug(letter, letterSlug),
      ) ?? null
    );
  }, [composingLetter, letterSlug, projectLetters]);

  const selectedLetterRecord = selectedLetter
    ? workspace.letterRecords[selectedLetter.id] ?? null
    : null;
  const hasLivePdf = Boolean(
    selectedLetterRecord?.storageKey && selectedLetterRecord.byteSize > 0,
  );
  const pdfPanel = useLetterPdfPanel(selectedLetter?.id, {
    hasLegacyPdf: hasLivePdf,
    legacyFilename: selectedLetterRecord?.originalFilename,
    enabled: Boolean(selectedLetter),
  });

  useEffect(() => {
    if (!selected || !sectionParam || documentPath || letterSlug) return;
    if (sectionParam === "overview" || !isProjectSectionId(sectionParam)) {
      navigate(
        getScopedProjectSectionHref(selected.key, "overview", routeScope),
        { replace: true },
      );
    }
  }, [documentPath, letterSlug, navigate, routeScope, sectionParam, selected]);

  // Match web ProjectDocumentsIndexScreen: open first project document when
  // landing on the Documents index.
  useEffect(() => {
    if (!selected || activeSection !== "documents" || documentPath) return;
    if (composingDocument) return;
    const first = projectDocuments[0];
    if (!first) return;
    navigate(
      getScopedProjectDocumentHref(
        selected.key,
        first.path || first.id,
        routeScope,
      ),
      { replace: true },
    );
  }, [
    activeSection,
    composingDocument,
    documentPath,
    navigate,
    projectDocuments,
    routeScope,
    selected,
  ]);

  // Match web: open first project letter when landing on Letters index.
  useEffect(() => {
    if (!selected || activeSection !== "letters" || letterSlug) return;
    const first = getFirstLetterInListOrder(projectLetters);
    if (!first) return;
    navigate(
      getScopedProjectLetterHref(selected.key, first.number, routeScope),
      { replace: true },
    );
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
    setLetterStatusOverride(null);
  }, [selected?.id, letterSlug]);

  const letterBreadcrumbTitle = composingLetter
    ? "New"
    : selectedLetter
      ? `${formatLetterDisplayId(selectedLetter.number)} ${selectedLetter.title}`
      : null;

  useDesktopSectionBreadcrumb(
    selected
      ? organizationRouteParam && organizationName
        ? [
            { label: "Organizations", href: "/organizations" },
            {
              label: organizationName,
              href: getOrganizationSectionHref(
                organizationRouteParam,
                "overview",
              ),
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
                      routeScope,
                    ),
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
                            routeScope,
                          )
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
            { label: "Projects", href: "/projects" },
            {
              label: selected.name,
              href:
                activeSection === "overview"
                  ? undefined
                  : getScopedProjectSectionHref(
                      selected.key,
                      "overview",
                      routeScope,
                    ),
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
                            routeScope,
                          )
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
  );

  const handleDeleteProject = useCallback(async () => {
    if (!selected) {
      return { ok: false as const, error: "Project is required." };
    }
    try {
      await workspace.softDeleteProject(selected.id);
      navigate(projectsListHref, { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete project.",
      };
    }
  }, [navigate, projectsListHref, selected, workspace]);

  const handleDeleteLetter = useCallback(async () => {
    if (!selectedLetter || !selected) {
      return { ok: false as const, error: "Letter is required." };
    }
    try {
      await workspace.softDeleteLetter(selectedLetter.id);
      navigate(
        getScopedProjectSectionHref(selected.key, "letters", routeScope),
        { replace: true },
      );
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete letter.",
      };
    }
  }, [navigate, routeScope, selected, selectedLetter, workspace]);

  const handleDeleteDocument = useCallback(async () => {
    if (!selectedDocument || !selected) {
      return { ok: false as const, error: "Document is required." };
    }
    try {
      const result = await workspace.deleteDocument(selectedDocument.id);
      if (!result.ok) {
        return result;
      }
      setLocalDocuments((current) =>
        current.filter((doc) => doc.id !== selectedDocument.id),
      );
      navigate(
        getScopedProjectSectionHref(selected.key, "documents", routeScope),
        { replace: true },
      );
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete document.",
      };
    }
  }, [navigate, routeScope, selected, selectedDocument, workspace]);

  if (!routeSlug) {
    const areaFilter =
      parseProjectAreaFilterFromLocation(location.pathname, location.search) ??
      undefined;

    if (!workspace.ready) {
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
          <ProjectsListSkeleton />
        </div>
      );
    }

    return (
      <ProjectsOverviewView
        projects={projects}
        area={areaFilter}
        onAreaChange={(area) => {
          navigate(getProjectsListAreaHref(area, projectsListView));
        }}
        view={projectsListView}
        onViewChange={(nextView) => {
          persistListBoardView(nextView, PROJECTS_LIST_BOARD_STORAGE_KEY);
          navigate(
            getProjectsListAreaHref(areaFilter ?? "all", nextView),
          );
        }}
        onSelectProject={(key) => navigate(`/projects/${key}`)}
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
        onCreateProject={async ({ status, name }) => {
          const organizationId = organizationRouteParam
            ? (organizations.find((org) =>
                organizationMatchesSlug(org, organizationRouteParam),
              )?.id ?? null)
            : null;
          return workspace.createProject({
            name,
            status,
            organizationId,
          });
        }}
        onCreatedProject={(_id, key) => {
          if (!key) return;
          if (organizationRouteParam) {
            navigate(
              getOrganizationProjectHref(organizationRouteParam, key),
            );
            return;
          }
          navigate(`/projects/${key}`);
        }}
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
    if (!workspace.ready) {
      return <ProjectOverviewSkeleton />;
    }
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

  const patchSelected = (
    patch: Partial<WorkspaceProject>,
  ) => {
    setProjectOverlay((current) => ({
      ...current,
      [project.id]: { ...current[project.id], ...patch },
    }));
  };

  const projectTasks = tasks.filter(
    (task) =>
      task.projectId === project.id ||
      (task.projectKey &&
        task.projectKey.toLowerCase() === projectKey.toLowerCase()),
  );

  const projectList = workspace.projects;

  const assigneeOptions = buildAssigneeDropdownOptions(
    withAvatarSrc(contacts, contactAvatarSrc),
  );

  const organizationOptions = buildOrganizationDropdownOptions(
    withAvatarSrc(organizations, organizationAvatarSrc),
    { includeNone: false },
  );

  const letterOrganizationOptions = buildOrganizationDropdownOptions(
    withAvatarSrc(organizations, organizationAvatarSrc),
  );

  const projectOptions = buildProjectDropdownOptions(
    projectList.map((entry) => ({
      key: entry.key,
      name: entry.name,
      icon: entry.icon,
    })),
    { includeNone: false },
  );

  const composeProjectOptions = buildProjectDropdownOptions(
    projectList.map((entry) => ({
      key: entry.key,
      name: entry.name,
      icon: entry.icon,
    })),
  );

  const taskProgress = computeTaskProgress(projectTasks);

  function handleSectionChange(next: ProjectSectionId) {
    navigate(getScopedProjectSectionHref(projectKey, next, routeScope), {
      replace: true,
    });
  }

  function navigateProjectTasksView(nextView: ListBoardView) {
    persistListBoardView(nextView, TASKS_LIST_BOARD_STORAGE_KEY);
    const base = getScopedProjectSectionHref(projectKey, "tasks", routeScope);
    navigate(nextView === "board" ? `${base}?view=board` : base);
  }

  function renderSection(sectionId: ProjectSectionId) {
    if (sectionId === "tasks") {
      return (
        <ProjectTasksView
          tasks={projectTasks}
          assigneeOptions={assigneeOptions}
          view={projectTasksView}
          onViewChange={navigateProjectTasksView}
          onSelectTask={(id) => {
            const task = projectTasks.find((entry) => entry.id === id);
            if (task?.number != null) {
              navigate(
                getScopedProjectTaskHref(projectKey, task.number, routeScope),
              );
              return;
            }
            navigate(
              `${getScopedProjectSectionHref(projectKey, "tasks", routeScope)}/${id}`,
            );
          }}
          onStatusChange={(taskId, status) => {
            void workspace.patchTask(taskId, { status });
          }}
          onPriorityChange={(taskId, priority) => {
            void workspace.patchTask(taskId, { priority });
          }}
          onDueDateChange={(taskId, dueDate) => {
            void workspace.patchTask(taskId, {
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onAssigneeChange={(taskId, assigneeId) => {
            void workspace.patchTask(taskId, { assigneeId });
          }}
          onCreateTask={({ status, title }) =>
            workspace.createProjectTask({
              projectId: project.id,
              title,
              status,
            })
          }
          onCreatedTask={(taskId) => {
            const task = tasks.find((entry) => entry.id === taskId);
            if (task?.number != null) {
              navigate(
                getScopedProjectTaskHref(projectKey, task.number, routeScope),
              );
              return;
            }
            navigate(
              `${getScopedProjectSectionHref(projectKey, "tasks", routeScope)}/${taskId}`,
            );
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
              onCancel={() =>
                navigate(
                  getScopedProjectSectionHref(
                    projectKey,
                    "overview",
                    routeScope,
                  ),
                )
              }
              pdfUploading={composePdfUploading}
              onSubmit={(payload) => {
                const orgId =
                  payload.organizationId ?? project.organizationId ?? null;
                void (async () => {
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
                  if (payload.pdfFile) {
                    setComposePdfUploading(true);
                    const upload = await uploadLetterPdfFile(
                      client,
                      created.id,
                      payload.pdfFile,
                    );
                    setComposePdfUploading(false);
                    if (!upload.ok) {
                      console.error(upload.error);
                      return;
                    }
                  }
                  if (created.number != null) {
                    navigate(
                      getScopedProjectLetterHref(
                        projectKey,
                        created.number,
                        routeScope,
                      ),
                    );
                    return;
                  }
                  navigate(
                    `${getScopedProjectSectionHref(projectKey, "letters", routeScope)}/${created.id}`,
                  );
                })();
              }}
            />
          ) : letterSlug && !selectedLetter ? (
            !workspace.ready ? (
              <LetterDetailSkeleton />
            ) : (
              <div className="project-detail__placeholder">
                <p className="overview-empty">Letter not found.</p>
              </div>
            )
          ) : selectedLetter ? (
            <>
              <RegisterEntityDeleteAction
                entityLabel={`letter ${formatLetterDisplayId(selectedLetter.number)}`}
                onDelete={handleDeleteLetter}
              />
              <LetterDetailView
                letter={{
                  id: selectedLetter.id,
                  title: selectedLetter.title,
                  status: letterStatusOverride ?? selectedLetter.status,
                  organizationId: record?.organizationId ?? null,
                  organizationName:
                    organizations.find(
                      (org) => org.id === record?.organizationId,
                    )?.name ?? null,
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
                  body:
                    workspace.letterBodies[selectedLetter.id] ??
                    "",
                  displayId: formatLetterDisplayId(selectedLetter.number),
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
                onRenameAttachment={pdfPanel.renameAttachment}
                onAttachmentRenamed={pdfPanel.reloadAttachments}
                onDeleteAttachment={pdfPanel.deleteAttachment}
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
                      useApi={pdfPanel.hasPdf}
                      revision={pdfPanel.revision}
                    />
                  ) : null
                }
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
                          contact.organizationId === record.organizationId,
                      )
                    : [],
                )}
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
                  routeScope,
                )}
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
        composingDocument || projectDocuments.length === 0;

      return (
        <ProjectDocumentsView>
          {showEmptyCreate ? (
            <DocumentsEmptyCreateView
              onCreate={({ title, content }) => {
                void workspace
                  .createProjectDocument({
                    projectId: project.id,
                    title,
                    content,
                  })
                  .then((created) => {
                    const item: KnowledgeListItem = {
                      id: created.id,
                      title,
                      path: created.path,
                      projectId: project.id,
                      kind: "document",
                    };
                    setLocalDocuments((current) => [...current, item]);
                    setComposingDocument(false);
                    navigate(
                      getScopedProjectDocumentHref(
                        projectKey,
                        created.path || created.id,
                        routeScope,
                      ),
                    );
                  });
              }}
            />
          ) : documentPath && !selectedDocument ? (
            !workspace.ready ? (
              <DocumentDetailSkeleton />
            ) : (
              <div className="project-detail__placeholder">
                <p className="overview-empty">Document not found.</p>
              </div>
            )
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
                  initialBody={getDocumentEditorBody(
                    documentContent.initialBody,
                    selectedDocument.title,
                  )}
                  onSave={async (nextEditorBody) => {
                    await documentContent.onSave(
                      serializeDocumentBody(nextEditorBody),
                    );
                  }}
                  onSaveTitle={async (title) => {
                    const result = await workspace.renameDocument(
                      selectedDocument.id,
                      title,
                    );
                    if (result.ok) {
                      setLocalDocuments((current) =>
                        current.map((doc) =>
                          doc.id === selectedDocument.id
                            ? { ...doc, title: title.trim() }
                            : doc,
                        ),
                      );
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
      return (
        <div className="project-detail__updates">
          <p>Project updates will live here.</p>
        </div>
      );
    }

    return null;
  }

  return (
    <>
      <RegisterPageTitle title={project.name} />
      {activeSection === "overview" ? (
        <RegisterEntityDeleteAction
          entityLabel={`project "${project.name}"`}
          onDelete={handleDeleteProject}
        />
      ) : null}
      <ProjectDetailView
        project={{
          ...project,
          organizationId: project.organizationId ?? null,
          summary:
            workspace.projectSummaries[project.id] ??
            "",
          description:
            workspace.projectDescriptions[project.id] ??
            "",
          taskProgress,
        }}
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
        onSaveName={(name) => {
          patchSelected({ name });
          void workspace.patchProject(project.id, { name });
          return { ok: true };
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
        onAreaChange={(area: ProjectArea | null) => {
          patchSelected({ area });
          void workspace.patchProject(project.id, { area });
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
