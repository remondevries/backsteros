import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  TaskDetailSkeleton,
  TaskDetailView,
  TaskStackedDetailView,
  buildAssigneeDropdownOptions,
  buildProjectDropdownOptions,
  buildSpellcheckSegments,
  buildTasksDueHref,
  composeSpellcheckText,
  encodeTaskSlug,
  getInboxTaskRouteSlugForTask,
  getTaskDisplayId,
  getTasksDueFilterLabel,
  isTasksDueFilter,
  spellcheckHasChanges,
  toggleSpellcheckSegment,
  type TaskSpellcheckHighlight,
  type TasksDueFilter,
} from "@backsteros/ui";

import {
  DesktopTaskActivityPanel,
  type TaskSpellcheckAppliedPayload,
} from "../components/desktop-task-activity-panel";
import { DesktopCodebaseTaskLayout } from "../components/desktop-codebase-task-layout";
import { DesktopTaskWorkbench } from "../components/desktop-task-workbench";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useTaskDescriptionImages } from "../lib/task-description-images";
import { useEnsureProjectVault } from "../lib/use-ensure-project-vault";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

export type TaskDetailPageProps = {
  taskRouteParam?: string;
  backHref?: string;
  breadcrumbItems?: { label: string; href?: string }[];
};

function taskMatchesRouteParam(
  entry: {
    id: string;
    number: number;
    projectId: string | null;
    projectKey?: string | null;
    contactId?: string | null;
    contactKey?: string | null;
  },
  routeParam: string | undefined,
): boolean {
  if (!routeParam) return false;
  if (entry.id === routeParam) return true;

  const normalized = decodeURIComponent(routeParam).toLowerCase();
  const displayId = getTaskDisplayId(
    {
      number: entry.number,
      projectId: entry.projectId,
      contactId: entry.contactId,
    },
    entry.projectKey ?? entry.contactKey,
  );
  if (displayId?.toLowerCase() === normalized) return true;

  const slug = getInboxTaskRouteSlugForTask({
    number: entry.number,
    projectKey: entry.projectKey,
    contactKey: entry.contactKey,
  });
  if (slug === normalized) return true;

  if (
    entry.projectKey &&
    encodeTaskSlug(entry.projectKey, entry.number) === normalized
  ) {
    return true;
  }

  if (
    entry.contactKey &&
    encodeTaskSlug(entry.contactKey, entry.number) === normalized
  ) {
    return true;
  }

  return false;
}

export function TaskDetailPage({
  taskRouteParam,
  backHref: backHrefProp,
  breadcrumbItems: breadcrumbItemsProp,
}: TaskDetailPageProps = {}) {
  const navigate = useNavigate();
  const { taskId, taskSlug, dueFilter: dueFilterParam } = useParams<{
    taskId?: string;
    taskSlug?: string;
    dueFilter?: string;
  }>();
  const routeParam = taskRouteParam ?? taskSlug ?? taskId;
  const dueFilter: TasksDueFilter | null =
    dueFilterParam && isTasksDueFilter(dueFilterParam) ? dueFilterParam : null;
  const backHref =
    backHrefProp ??
    (dueFilter ? buildTasksDueHref(dueFilter) : "/tasks");
  const workspace = useDesktopWorkspaceData();
  const { allTasks, projects, contacts } = workspace;
  const [spellcheckHighlight, setSpellcheckHighlight] =
    useState<TaskSpellcheckHighlight | null>(null);
  const spellcheckNonceRef = useRef(0);

  const onSpellcheckApplied = useCallback(
    (payload: TaskSpellcheckAppliedPayload) => {
      const titleSegments = buildSpellcheckSegments(
        payload.beforeTitle,
        payload.afterTitle,
      );
      const descriptionSegments = buildSpellcheckSegments(
        payload.beforeDescription,
        payload.afterDescription,
      );
      if (
        !spellcheckHasChanges(titleSegments) &&
        !spellcheckHasChanges(descriptionSegments)
      ) {
        setSpellcheckHighlight(null);
        return;
      }
      spellcheckNonceRef.current += 1;
      setSpellcheckHighlight({
        beforeTitle: payload.beforeTitle,
        beforeDescription: payload.beforeDescription,
        titleSegments,
        descriptionSegments,
        nonce: spellcheckNonceRef.current,
      });
    },
    [],
  );

  const base =
    allTasks.find((entry) => {
      const contact = entry.contactId
        ? contacts.find((c) => c.id === entry.contactId)
        : null;
      return taskMatchesRouteParam(
        {
          ...entry,
          contactKey: contact?.key ?? null,
        },
        routeParam,
      );
    }) ?? null;

  useEnsureProjectVault(base?.projectId);

  const { onUploadImages, resolveImageSrc } = useTaskDescriptionImages(
    base?.id ?? "",
  );

  const applySpellcheckComposition = useCallback(
    async (session: TaskSpellcheckHighlight) => {
      if (!base) return;
      await workspace.patchTask(base.id, {
        title: composeSpellcheckText(session.titleSegments),
        description: composeSpellcheckText(session.descriptionSegments),
      });
    },
    [base, workspace],
  );

  const onToggleSpellcheckTitleSegment = useCallback(
    (segmentId: string) => {
      setSpellcheckHighlight((current) => {
        if (!current) return current;
        const next: TaskSpellcheckHighlight = {
          ...current,
          titleSegments: toggleSpellcheckSegment(
            current.titleSegments,
            segmentId,
          ),
        };
        void applySpellcheckComposition(next);
        return next;
      });
    },
    [applySpellcheckComposition],
  );

  const onToggleSpellcheckDescriptionSegment = useCallback(
    (segmentId: string) => {
      setSpellcheckHighlight((current) => {
        if (!current) return current;
        const next: TaskSpellcheckHighlight = {
          ...current,
          descriptionSegments: toggleSpellcheckSegment(
            current.descriptionSegments,
            segmentId,
          ),
        };
        void applySpellcheckComposition(next);
        return next;
      });
    },
    [applySpellcheckComposition],
  );

  const onSpellcheckReset = useCallback(() => {
    const session = spellcheckHighlight;
    if (!session || !base) {
      setSpellcheckHighlight(null);
      return;
    }
    void workspace
      .patchTask(base.id, {
        title: session.beforeTitle,
        description: session.beforeDescription,
      })
      .finally(() => setSpellcheckHighlight(null));
  }, [base, spellcheckHighlight, workspace]);

  // Drop highlight when navigating to another task.
  const highlightTaskId = base?.id ?? null;
  const [prevHighlightTaskId, setPrevHighlightTaskId] = useState(highlightTaskId);
  if (highlightTaskId !== prevHighlightTaskId) {
    setPrevHighlightTaskId(highlightTaskId);
    if (spellcheckHighlight) setSpellcheckHighlight(null);
  }

  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, contacts],
  );

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
        })),
      ),
    [projects],
  );

  const task = useMemo(() => {
    if (!base) return null;
    const resolvedProjectKey = base.projectKey ?? null;
    const project =
      projects.find((entry) => entry.key === resolvedProjectKey) ?? null;
    const resolvedAssigneeId = base.assigneeId ?? null;
    const assignee =
      contacts.find((entry) => entry.id === resolvedAssigneeId) ?? null;
    return {
      ...base,
      assigneeId: resolvedAssigneeId,
      assigneeName: assignee?.name ?? null,
      projectKey: resolvedProjectKey,
      projectName: project?.name ?? base.projectName ?? null,
      description: workspace.taskDescriptions[base.id] ?? "",
      links: workspace.taskLinks[base.id] ?? [],
      displayId: getTaskDisplayId(
        {
          number: base.number,
          projectId: base.projectId,
        },
        base.projectKey,
      ),
    };
  }, [base, contacts, projects, workspace.taskDescriptions, workspace.taskLinks]);

  const taskLabel = task
    ? task.displayId
      ? `${task.displayId} ${task.title}`
      : task.title
    : null;

  const breadcrumbItems = useMemo(() => {
    if (breadcrumbItemsProp) {
      return [
        ...breadcrumbItemsProp,
        ...(taskLabel ? [{ label: taskLabel }] : []),
      ];
    }
    if (dueFilter) {
      return [
        { label: "Tasks", href: "/tasks" },
        {
          label: getTasksDueFilterLabel(dueFilter),
          href: buildTasksDueHref(dueFilter),
        },
        ...(taskLabel ? [{ label: taskLabel }] : []),
      ];
    }
    return taskLabel
      ? [
          { label: "Tasks", href: backHref },
          { label: taskLabel },
        ]
      : [{ label: "Tasks", href: backHref }];
  }, [backHref, breadcrumbItemsProp, dueFilter, taskLabel]);

  useDesktopSectionBreadcrumb(breadcrumbItems);

  const handleDeleteTask = useCallback(async () => {
    if (!base) {
      return { ok: false as const, error: "Task is required." };
    }
    try {
      await workspace.softDeleteTask(base.id);
      navigate(backHref, { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Failed to delete task.",
      };
    }
  }, [backHref, base, navigate, workspace]);

  if (!task) {
    if (!workspace.ready) {
      return <TaskDetailSkeleton />;
    }
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-empty">
          <p>Task not found.</p>
          <button type="button" onClick={() => navigate(backHref)}>
            Back to tasks
          </button>
        </div>
      </div>
    );
  }

  const deleteEntityLabel = task.displayId
    ? `task ${task.displayId}`
    : "task";

  const project =
    projects.find((entry) => entry.key === task.projectKey) ?? null;
  const workingDirectory = project?.localWorkingDirectory ?? null;
  const isCodebaseTask = project?.type === "codebase";

  const patchStatus = (next: string) => {
    void workspace.patchTask(task.id, { status: next });
  };
  const patchPriority = (next: number) => {
    void workspace.patchTask(task.id, { priority: next });
  };
  const patchDueDate = (next: Date | null) => {
    void workspace.patchTask(task.id, {
      dueDate: next ? next.toISOString() : null,
    });
  };
  const patchAssignee = (next: string | null) => {
    void workspace.patchTask(task.id, { assigneeId: next });
  };
  const patchProjectKey = (next: string | null) => {
    const nextProject = next
      ? projects.find((entry) => entry.key === next) ?? null
      : null;
    void workspace.patchTask(task.id, {
      projectId: nextProject?.id ?? null,
    });
  };
  const saveDescription = (description: string) => {
    void workspace.patchTask(task.id, { description });
  };
  const changeLinks = (links: typeof task.links) => {
    void workspace.patchTask(task.id, { links: links ?? [] });
  };
  const saveTitle = async (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) {
      return { ok: false as const, error: "Task title is required." };
    }
    try {
      await workspace.patchTask(task.id, { title: trimmed });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Could not rename task.",
      };
    }
  };
  const createAssigneeFromQuery = (query: string) => {
    void workspace.createContact({ name: query }).then((created) => {
      void workspace.patchTask(task.id, { assigneeId: created.id });
    });
  };

  const taskAgentSummary = {
    number: base?.number ?? 0,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    projectKey: task.projectKey,
    projectId: project?.id ?? base?.projectId ?? null,
    projectName: project?.name ?? task.projectName ?? null,
    displayId:
      task.displayId ??
      getTaskDisplayId(
        {
          number: base?.number ?? task.number ?? null,
          projectId: project?.id ?? base?.projectId ?? null,
        },
        task.projectKey,
      ),
    workingDirectory,
  };

  const activityPanel = (spellcheckControlsVisible = true) => (
    <DesktopTaskActivityPanel
      taskId={task.id}
      taskUpdatedAt={base?.updatedAt ?? null}
      contacts={contacts}
      contactAvatarSrc={contactAvatarSrc}
      patchTaskValues={(values) => workspace.patchTask(task.id, values)}
      onSpellcheckApplied={onSpellcheckApplied}
      spellcheckPending={Boolean(spellcheckHighlight)}
      onSpellcheckConfirm={() => setSpellcheckHighlight(null)}
      onSpellcheckReset={onSpellcheckReset}
      spellcheckControlsVisible={spellcheckControlsVisible}
      taskSummary={taskAgentSummary}
    />
  );

  const stackedDetail = (
    <TaskStackedDetailView
      task={task}
      onStatusChange={patchStatus}
      onPriorityChange={patchPriority}
      onDueDateChange={patchDueDate}
      onAssigneeChange={patchAssignee}
      onProjectChange={patchProjectKey}
      onSaveDescription={saveDescription}
      onChangeLinks={changeLinks}
      onUploadImages={onUploadImages}
      resolveImageSrc={resolveImageSrc}
      onSaveTitle={saveTitle}
      assigneeOptions={assigneeOptions}
      projectOptions={projectOptions}
      onCreateAssigneeFromQuery={createAssigneeFromQuery}
      belowDescription={activityPanel(true)}
    />
  );

  const splitDetail = (
    <TaskDetailView
      task={task}
      spellcheckHighlight={spellcheckHighlight}
      onSpellcheckHighlightClear={() => setSpellcheckHighlight(null)}
      onToggleSpellcheckTitleSegment={onToggleSpellcheckTitleSegment}
      onToggleSpellcheckDescriptionSegment={
        onToggleSpellcheckDescriptionSegment
      }
      onStatusChange={patchStatus}
      onPriorityChange={patchPriority}
      onDueDateChange={patchDueDate}
      onAssigneeChange={patchAssignee}
      onProjectChange={patchProjectKey}
      onSaveDescription={saveDescription}
      onChangeLinks={changeLinks}
      onUploadImages={onUploadImages}
      resolveImageSrc={resolveImageSrc}
      onSaveTitle={saveTitle}
      assigneeOptions={assigneeOptions}
      projectOptions={projectOptions}
      assigneeNavigateHref={
        task.assigneeId ? `/contacts/${task.assigneeId}` : null
      }
      projectNavigateHref={
        task.projectKey ? `/projects/${task.projectKey}` : null
      }
      onCreateAssigneeFromQuery={createAssigneeFromQuery}
      belowDescription={({ mode }) => activityPanel(mode === "preview")}
    />
  );

  return (
    <>
      <RegisterPageTitle title={task.title} />
      <RegisterEntityDeleteAction
        entityLabel={deleteEntityLabel}
        onDelete={handleDeleteTask}
      />
      {isCodebaseTask && project ? (
        <DesktopCodebaseTaskLayout
          taskId={task.id}
          projectId={project.id}
          projectLabel={project.name ?? task.projectName ?? "Task"}
          taskDisplayId={task.displayId ?? null}
          cwd={workingDirectory}
          agentChatId={base?.agentChatId ?? null}
          taskStatus={task.status}
          taskSummary={taskAgentSummary}
          patchTaskValues={(values) => workspace.patchTask(task.id, values)}
          onWorkingDirectoryChange={async (directory) => {
            await workspace.patchProject(project.id, {
              localWorkingDirectory: directory,
            });
          }}
        >
          {stackedDetail}
        </DesktopCodebaseTaskLayout>
      ) : (
        <DesktopTaskWorkbench
          taskId={task.id}
          projectId={project?.id ?? null}
          projectLabel={project?.name ?? task.projectName ?? "Task"}
          taskDisplayId={task.displayId ?? null}
          cwd={workingDirectory?.trim() || "~"}
          agentChatId={base?.agentChatId ?? null}
          taskStatus={task.status}
          taskSummary={taskAgentSummary}
          patchTaskValues={(values) => workspace.patchTask(task.id, values)}
        >
          {splitDetail}
        </DesktopTaskWorkbench>
      )}
    </>
  );
}
