"use client";

import type {
  Contact as ApiContact,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { ContactRouteBreadcrumb } from "@/components/contacts/contact-route-breadcrumb";
import { ContentDetailTitleHeader } from "@/components/content/content-detail-title-header";
import { RegisterEntityDeleteAction } from "@/components/entity-actions/register-entity-delete-action";
import { DetailBreadcrumbLeaf } from "@/components/navigation/detail-breadcrumb-leaf";
import { ProjectRouteBreadcrumb } from "@/components/projects/project-route-breadcrumb";
import { RegisterTabTitle } from "@/components/shell/register-tab-title";
import { TasksSectionBreadcrumb } from "@/components/tasks/tasks-section-breadcrumb";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
} from "@/components/content/content-markdown-view-layout";
import { useContentTitleEditorNavigation } from "@/components/content/use-content-title-editor-navigation";
import { useMarkdownDetailEditor } from "@/components/content/use-markdown-detail-editor";
import { DocumentMarkdownPreview } from "@/components/documents/document-markdown-preview";
import { TaskDetailPropertiesPanel } from "@/components/tasks/task-detail-properties-panel";
import { TaskTitleEditor } from "@/components/tasks/task-title-editor";
import { FloatingPillToggleDock } from "@/components/ui/floating-pill-toggle-dock";
import { TaskDetailSkeleton } from "@/components/tasks/task-detail-skeleton";
import { ResizableSidePanel } from "@/components/ui/resizable-side-panel";
import { SegmentedPillToggle } from "@/components/ui/segmented-pill-toggle";
import {
  MentionCatalogProvider,
  useMentionCatalog,
} from "@/hooks/use-mention-catalog";
import { useApiResource } from "@/lib/api-context";
import { mapContactToAssignable } from "@/lib/contacts/assignable-contact";
import {
  normalizeContact,
  normalizeProject,
  normalizeTask,
} from "@/lib/entity-normalize";
import {
  encodeProjectSlug,
  isEntityRouteUuid,
  parseTaskSlug,
} from "@/lib/entity-slugs";
import { deleteTaskAction, updateTaskDescriptionAction } from "@/lib/mutations/tasks";
import { mapProjectToAssignable } from "@/lib/projects/assignable-project";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { projectMatchesRouteParam } from "@/lib/project-sections";
import { getTaskDisplayId, INBOX_TASK_KEY } from "@/lib/task-display-id";
import {
  TASK_PROPERTIES_PANEL_LEGACY_WIDTH_KEYS,
  TASK_PROPERTIES_PANEL_WIDTH_KEY,
} from "@/lib/task-properties-panel";

const DocumentMarkdownEditor = dynamic(
  () =>
    import("@/components/documents/document-markdown-editor").then(
      (module) => module.DocumentMarkdownEditor,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      key === "inbox" ? Boolean(value) : value;
  }
  return output;
}

function taskMatchesParam(
  task: ReturnType<typeof normalizeTask>,
  routeParam: string,
  contextKey: string | null,
  projectsById: Map<string, ReturnType<typeof normalizeProject>>,
) {
  if (task.id === routeParam) return true;
  if (isEntityRouteUuid(routeParam)) return task.id === routeParam;

  const parsed = parseTaskSlug(routeParam);
  if (!parsed) {
    const asNumber = Number(routeParam);
    return Number.isInteger(asNumber) && task.number === asNumber;
  }

  if (task.number !== parsed.number) return false;

  const project = task.projectId ? projectsById.get(task.projectId) : null;
  const resolvedContext =
    contextKey ??
    project?.key ??
    (task.inbox ? INBOX_TASK_KEY : null);

  if (!resolvedContext) return false;
  return (
    encodeProjectSlug(resolvedContext) ===
    encodeProjectSlug(parsed.contextKey)
  );
}

type TaskDetailScreenProps = {
  taskRouteParam: string;
  projectRouteParam?: string;
  context?: "inbox" | "project" | "tasks" | "trail";
  backHref?: string;
};

export function TaskDetailScreen(props: TaskDetailScreenProps) {
  return (
    <MentionCatalogProvider>
      <TaskDetailScreenInner {...props} />
    </MentionCatalogProvider>
  );
}

function TaskDetailScreenInner({
  taskRouteParam,
  projectRouteParam,
  context = "tasks",
  backHref,
}: TaskDetailScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { catalog: mentionCatalog } = useMentionCatalog();
  const tasksResource = useApiResource<{ tasks: ApiTask[] }>((client) =>
    client.requestJson(
      context === "inbox" ? "/api/v1/tasks/inbox" : "/api/v1/tasks",
    ),
  );
  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );
  const localTasks = usePowerSyncQuery<Record<string, unknown>>(
    context === "inbox"
      ? "SELECT * FROM tasks WHERE deleted_at IS NULL AND inbox = 1"
      : "SELECT * FROM tasks WHERE deleted_at IS NULL",
  );

  const projectsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof normalizeProject>>();
    for (const project of projectsResource.data?.projects ?? []) {
      const normalized = normalizeProject(project);
      map.set(normalized.id, normalized);
    }
    return map;
  }, [projectsResource.data]);

  const scopedProject = useMemo(() => {
    if (!projectRouteParam) return null;
    const match = (projectsResource.data?.projects ?? []).find((entry) =>
      projectMatchesRouteParam(entry, projectRouteParam),
    );
    return match ? normalizeProject(match) : null;
  }, [projectRouteParam, projectsResource.data]);

  const task = useMemo(() => {
    const rows =
      localTasks.data?.map((row) => snakeRow(row) as ApiTask) ??
      tasksResource.data?.tasks ??
      [];
    const contextKey = scopedProject?.key ?? null;
    const match = rows.find((row) =>
      taskMatchesParam(
        normalizeTask(row),
        taskRouteParam,
        contextKey,
        projectsById,
      ),
    );
    return match ? normalizeTask(match) : null;
  }, [
    localTasks.data,
    projectsById,
    scopedProject?.key,
    taskRouteParam,
    tasksResource.data,
  ]);

  const project = task?.projectId
    ? projectsById.get(task.projectId) ?? null
    : scopedProject;

  const assignableProjects = useMemo(
    () =>
      (projectsResource.data?.projects ?? []).map((entry) =>
        mapProjectToAssignable(normalizeProject(entry)),
      ),
    [projectsResource.data],
  );

  const assignableContacts = useMemo(
    () =>
      (contactsResource.data?.contacts ?? []).map((contact) =>
        mapContactToAssignable({
          ...normalizeContact(contact),
          organization: null,
        }),
      ),
    [contactsResource.data],
  );

  const saveDescription = useCallback(
    (nextDescription: string) => {
      if (!task) {
        return null;
      }

      const trimmed = nextDescription.trim();
      const currentDescription = (task.description ?? "").trim();

      if (trimmed === currentDescription) {
        return null;
      }

      return updateTaskDescriptionAction({
        taskId: task.id,
        projectId: task.projectId,
        description: trimmed,
      }).then((result) => {
        if (result.ok) {
          tasksResource.reload();
        }
        return result;
      });
    },
    [task, tasksResource],
  );

  const {
    value: description,
    mode,
    editorActivated,
    editorFocusRequest,
    error: descriptionError,
    isPending,
    handleChange: handleDescriptionChange,
    handleBlur: handleDescriptionBlurSave,
    requestEditorFocus,
    activateEditMode,
    switchToEdit,
    switchToPreview,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: task?.description ?? "",
    save: saveDescription,
    blurOnPreview: true,
  });

  const {
    titleRenameFocusRequest,
    requestTitleFocus,
    handleLeaveTitleForEditor,
  } = useContentTitleEditorNavigation({
    mode,
    activateEditMode,
    requestEditorFocus,
  });

  const handleDeleteTask = useCallback(async () => {
    if (!task) {
      return { ok: false as const, error: "Task is required." };
    }
    const result = await deleteTaskAction({
      taskId: task.id,
      pathname,
    });
    if (!result.ok) {
      return result;
    }
    router.replace(result.redirectHref);
    return result;
  }, [pathname, router, task]);

  const isLoading = (tasksResource.loading || projectsResource.loading) && !task;

  if (!isLoading && !task) {
    return (
      <div className="error-state" data-content-detail>
        <strong>Task not found</strong>
        <p>No task matches “{taskRouteParam}”.</p>
        {backHref ? <Link href={backHref}>Go back</Link> : null}
      </div>
    );
  }

  const contextKey = task
    ? project?.key ?? (task.inbox ? INBOX_TASK_KEY : null)
    : null;
  const displayId = task ? getTaskDisplayId(task, contextKey) : null;
  const deleteEntityLabel = displayId ? `task ${displayId}` : "task";
  const contactRouteMatch = pathname.match(/^\/contacts\/([^/]+)/);
  const contactRouteParam = contactRouteMatch?.[1]
    ? decodeURIComponent(contactRouteMatch[1])
    : null;

  const viewModeToggle = (
    <SegmentedPillToggle
      value={mode}
      options={[
        { value: "edit", label: "Edit" },
        { value: "preview", label: "Preview" },
      ]}
      onChange={(nextMode) => {
        if (nextMode === "edit") {
          switchToEdit();
          return;
        }
        switchToPreview();
      }}
      ariaLabel="Task view mode"
      className="pointer-events-auto"
    />
  );

  const titleHeader = task ? (
    <ContentDetailTitleHeader>
      {displayId ? (
        <p className="mb-2 font-mono text-sm tabular-nums text-foreground/50">
          {displayId}
        </p>
      ) : null}
      <TaskTitleEditor
        taskId={task.id}
        projectId={task.projectId}
        value={task.title}
        renameFocusRequest={titleRenameFocusRequest}
        onLeaveTitle={handleLeaveTitleForEditor}
        onSaved={() => tasksResource.reload()}
      />
    </ContentDetailTitleHeader>
  ) : null;

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row"
      data-content-detail
      data-content-view-mode={mode}
      data-detail-split=""
    >
      {task ? <RegisterTabTitle title={task.title} /> : null}
      {task ? (
        <RegisterEntityDeleteAction
          entityLabel={deleteEntityLabel}
          onDelete={handleDeleteTask}
        />
      ) : null}
      {context !== "trail" && projectRouteParam ? (
        <ProjectRouteBreadcrumb projectRouteParam={projectRouteParam} />
      ) : null}
      {context !== "trail" && contactRouteParam ? (
        <ContactRouteBreadcrumb contactRouteParam={contactRouteParam} />
      ) : null}
      {context === "tasks" && !projectRouteParam && !contactRouteParam ? (
        <TasksSectionBreadcrumb />
      ) : null}
      {context !== "trail" && task ? (
        <DetailBreadcrumbLeaf label={task.title} displayId={displayId} />
      ) : null}
      {isLoading ? (
        <TaskDetailSkeleton framed={false} />
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mx-auto w-full shrink-0">{titleHeader}</div>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <ContentMarkdownViewLayout
              mode={mode}
              editorActivated={editorActivated}
              onToggleMode={toggleViewMode}
              editor={
                <DocumentMarkdownEditor
                  value={description}
                  onChange={handleDescriptionChange}
                  onBlur={handleDescriptionBlurSave}
                  disabled={isPending}
                  ariaLabel="Task description"
                  mentionCatalog={mentionCatalog}
                  focusRequest={editorFocusRequest}
                  onShiftTabFocusTitle={requestTitleFocus}
                />
              }
              preview={
                <ContentMarkdownPreviewColumn includeTopInset={false}>
                  {description.trim() ? (
                    <DocumentMarkdownPreview
                      body={description}
                      mentionCatalog={mentionCatalog}
                    />
                  ) : (
                    <p className="text-sm text-foreground/40">
                      Add a description…
                    </p>
                  )}
                </ContentMarkdownPreviewColumn>
              }
            />
          </div>

          {descriptionError ? (
            <p className="shrink-0 px-4 pb-3 text-xs text-red-400" role="alert">
              {descriptionError}
            </p>
          ) : null}
        </div>
      )}

      <ResizableSidePanel
        storageKey={TASK_PROPERTIES_PANEL_WIDTH_KEY}
        legacyStorageKeys={TASK_PROPERTIES_PANEL_LEGACY_WIDTH_KEYS}
        defaultWidth={300}
        minWidth={240}
        maxWidth={480}
        className="pt-4"
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <TaskDetailPropertiesPanel
            task={task}
            assignableProjects={assignableProjects}
            assignableContacts={assignableContacts}
          />

          {!isLoading ? (
            <FloatingPillToggleDock>{viewModeToggle}</FloatingPillToggleDock>
          ) : null}
        </div>
      </ResizableSidePanel>
    </div>
  );
}
