import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  InboxDetailSkeleton,
  RegisterEntityDeleteAction,
  RegisterEntityDuplicateAction,
  TaskDetailView,
  buildAssigneeDropdownOptions,
  buildInboxTaskListItem,
  buildProjectDropdownOptions,
  encodeTaskSlug,
  findInboxItemBySlugOrId,
  getFirstInboxItemHref,
  getInboxHrefAfterRemovingItem,
  getInboxItemDisplayId,
  getInboxTaskRouteSlugForTask,
  getProjectTaskHref,
  resolveDuplicatedTaskHref,
  type InboxTaskListItem,
} from "@backsteros/ui";

import { DesktopTaskActivityPanel } from "../components/desktop-task-activity-panel";
import { DesktopTaskLayout } from "../components/desktop-task-layout";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useTaskDescriptionImages } from "../lib/task-description-images";
import { useEnsureProjectVault } from "../lib/use-ensure-project-vault";
import {
  buildDocumentLinkOptions,
  buildEmailLinkOptions,
} from "../lib/task-link-picker-options";
import { useAgentMail } from "../lib/agentmail-context";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

type MovedToProjectNotice = {
  projectKey: string;
  projectName: string;
  taskNumber: number;
};

function resolveInboxTaskFromWorkspace(
  workspace: ReturnType<typeof useDesktopWorkspaceData>,
  itemId: string,
): InboxTaskListItem | null {
  const fromList = findInboxItemBySlugOrId(workspace.inboxItems, itemId);
  if (fromList?.kind === "task") return fromList;

  const normalized = itemId.trim().toLowerCase();
  const full = workspace.allTasks.find((task) => {
    if (task.id === itemId) return true;
    const slug = getInboxTaskRouteSlugForTask({
      number: task.number,
      projectKey: task.projectKey,
    });
    return (
      slug === normalized ||
      slug.toLowerCase() === normalized ||
      encodeTaskSlug(task.projectKey ?? "in", task.number) === normalized
    );
  });
  if (!full) return null;

  return buildInboxTaskListItem({
    id: full.id,
    title: full.title,
    number: full.number ?? 0,
    status: full.status,
    priority: full.priority,
    dueDate:
      typeof full.dueDate === "number"
        ? full.dueDate
        : full.dueDate
          ? full.dueDate.getTime()
          : null,
    updatedAt: full.updatedAt ?? Date.now(),
    description: workspace.taskDescriptions[full.id] ?? null,
    projectId: full.projectId,
    projectKey: full.projectKey ?? null,
    projectName: full.projectName ?? null,
    assigneeId: full.assigneeId ?? null,
    inbox: false,
  });
}

export function InboxPage() {
  const navigate = useNavigate();
  const { itemId } = useParams<{ itemId?: string }>();
  const workspace = useDesktopWorkspaceData();
  const agentMail = useAgentMail();
  const documentLinkOptions = useMemo(
    () => buildDocumentLinkOptions(workspace.documents),
    [workspace.documents],
  );
  const emailLinkOptions = useMemo(
    () => buildEmailLinkOptions(agentMail.messages),
    [agentMail.messages],
  );
  const [movedNotice, setMovedNotice] = useState<MovedToProjectNotice | null>(
    null,
  );

  const selectedTask = itemId
    ? resolveInboxTaskFromWorkspace(workspace, itemId)
    : null;

  const inList = selectedTask
    ? workspace.inboxItems.some((item) => item.id === selectedTask.id)
    : false;

  // Inbox list items omit assignee; join full task row for detail chrome.
  const selectedTaskRecord = selectedTask
    ? (workspace.allTasks.find((entry) => entry.id === selectedTask.id) ?? null)
    : null;

  useEnsureProjectVault(selectedTaskRecord?.projectId);

  const { onUploadImages, resolveImageSrc } = useTaskDescriptionImages(
    selectedTask?.id ?? "",
  );

  const displayId = selectedTask ? getInboxItemDisplayId(selectedTask) : null;
  useDesktopSectionBreadcrumb(
    selectedTask
      ? [
          { label: "Inbox", href: "/inbox" },
          {
            label: displayId
              ? `${displayId} ${selectedTask.title}`
              : selectedTask.title,
          },
        ]
      : [{ label: "Inbox" }],
  );

  useEffect(() => {
    setMovedNotice(null);
  }, [itemId]);

  useEffect(() => {
    // Only auto-open the first item when the route has no selection.
    // When the open task leaves the inbox list (e.g. assigned to a project),
    // keep the detail pane mounted so the user can finish editing.
    if (itemId) return;
    const first = getFirstInboxItemHref(workspace.inboxItems);
    if (first) {
      navigate(first, { replace: true });
    }
  }, [itemId, navigate, workspace.inboxItems]);

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(workspace.contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, workspace.contacts],
  );

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        workspace.projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
        })),
        { includeNone: false },
      ),
    [workspace.projects],
  );

  const handleDeleteTask = useCallback(async () => {
    if (!selectedTask) {
      return { ok: false as const, error: "Task is required." };
    }
    try {
      await workspace.softDeleteTask(selectedTask.id);
      navigate("/inbox", { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Failed to delete task.",
      };
    }
  }, [navigate, selectedTask, workspace]);

  const handleDuplicateTask = useCallback(async () => {
    if (!selectedTask) {
      return { ok: false as const, error: "Task is required." };
    }
    try {
      const created = await workspace.duplicateTask(selectedTask.id);
      const projectKey = selectedTask.projectKey ?? null;
      const project =
        projectKey != null
          ? (workspace.projects.find((entry) => entry.key === projectKey) ??
            null)
          : selectedTask.projectId
            ? (workspace.projects.find(
                (entry) => entry.id === selectedTask.projectId,
              ) ?? null)
            : null;
      navigate(
        resolveDuplicatedTaskHref({
          id: created.id,
          number: created.number,
          projectKey: project?.key ?? projectKey,
        }),
      );
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to duplicate task.",
      };
    }
  }, [navigate, selectedTask, workspace]);

  const handleProjectChange = useCallback(
    (next: string | null) => {
      if (!selectedTask) return;
      const nextProject = next
        ? workspace.projects.find((entry) => entry.key === next) ?? null
        : null;
      void workspace.patchTask(selectedTask.id, {
        projectId: nextProject?.id ?? null,
        inbox: !nextProject,
        // Keep triage until the user explicitly changes status.
        ...(nextProject ? {} : { status: "triage" }),
      });
      if (nextProject) {
        setMovedNotice({
          projectKey: nextProject.key,
          projectName: nextProject.name,
          taskNumber: selectedTask.number,
        });
      } else {
        setMovedNotice(null);
      }
    },
    [selectedTask, workspace],
  );

  if (!itemId || !selectedTask) {
    if (!workspace.ready || workspace.inboxItems.length > 0) {
      return <InboxDetailSkeleton />;
    }
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-empty">
          <p>Inbox is empty.</p>
        </div>
      </div>
    );
  }

  const resolvedProjectKey =
    selectedTask.projectKey ??
    selectedTaskRecord?.projectKey ??
    null;
  const project =
    workspace.projects.find((entry) => entry.key === resolvedProjectKey) ??
    (selectedTaskRecord?.projectId
      ? workspace.projects.find(
          (entry) => entry.id === selectedTaskRecord.projectId,
        ) ?? null
      : null);
  const resolvedAssigneeId = selectedTaskRecord?.assigneeId ?? null;
  const assignee =
    workspace.contacts.find((entry) => entry.id === resolvedAssigneeId) ?? null;
  const deleteEntityLabel = displayId
    ? `task ${displayId}`
    : "task";

  const workingDirectory = project?.localWorkingDirectory ?? null;
  const hasProject = Boolean(project?.id ?? selectedTask.projectId);
  const statusDisabled = !hasProject;
  const projectTaskHref =
    movedNotice != null
      ? getProjectTaskHref(movedNotice.projectKey, movedNotice.taskNumber)
      : project
        ? getProjectTaskHref(project.key, selectedTask.number)
        : null;

  return (
    <>
      <RegisterEntityDuplicateAction onDuplicate={handleDuplicateTask} />
      <RegisterEntityDeleteAction
        entityLabel={deleteEntityLabel}
        onDelete={handleDeleteTask}
      />
      <DesktopTaskLayout
        taskId={selectedTask.id}
        projectId={project?.id ?? null}
        projectLabel={project?.name ?? selectedTask.projectName ?? "Task"}
        taskDisplayId={displayId}
        cwd={workingDirectory?.trim() || "~"}
        agentChatId={selectedTaskRecord?.agentChatId ?? null}
        taskStatus={selectedTaskRecord?.status ?? selectedTask.status}
        preferWideTaskPanel
        viewScope={project?.type === "codebase" ? "codebase" : "rail"}
        taskSummary={{
          number: selectedTask.number ?? 0,
          title: selectedTask.title,
          description:
            workspace.taskDescriptions[selectedTask.id] ??
            selectedTask.description ??
            null,
          projectKey: resolvedProjectKey,
          projectId: project?.id ?? null,
          projectName: project?.name ?? selectedTask.projectName ?? null,
          displayId: getInboxItemDisplayId(selectedTask),
          workingDirectory: workingDirectory,
        }}
        patchTaskValues={async (values) => {
          await workspace.patchTask(selectedTask.id, values);
        }}
      >
      <TaskDetailView
        sectionLabel="Inbox"
        headerMeta={
          movedNotice && projectTaskHref && !inList ? (
            <div className="inbox-moved-banner" role="status">
              <span>
                Moved into{" "}
                <Link
                  className="inbox-moved-banner__link"
                  to={projectTaskHref}
                >
                  {movedNotice.projectName}
                </Link>
                .
              </span>
            </div>
          ) : null
        }
        task={{
          id: selectedTask.id,
          title: selectedTask.title,
          status: selectedTaskRecord?.status ?? selectedTask.status,
          priority: selectedTaskRecord?.priority ?? selectedTask.priority,
          dueDate:
            selectedTaskRecord?.dueDate ?? selectedTask.dueDate ?? null,
          assigneeId: resolvedAssigneeId,
          assigneeName: assignee?.name ?? null,
          projectKey: project?.key ?? resolvedProjectKey,
          projectName: project?.name ?? selectedTask.projectName ?? null,
          agentCreatedAt: selectedTaskRecord?.agentCreatedAt ?? selectedTask.agentCreatedAt ?? null,
          agentInboxApprovedAt:
            selectedTaskRecord?.agentInboxApprovedAt ??
            selectedTask.agentInboxApprovedAt ??
            null,
          description:
            workspace.taskDescriptions[selectedTask.id] ??
            selectedTask.description ??
            "",
          links: workspace.taskLinks[selectedTask.id] ?? [],
          displayId: getInboxItemDisplayId(selectedTask),
        }}
        statusDisabled={statusDisabled}
        onStatusChange={
          statusDisabled
            ? undefined
            : (next) => {
                void workspace.patchTask(selectedTask.id, { status: next });
              }
        }
        onPriorityChange={(next) => {
          void workspace.patchTask(selectedTask.id, { priority: next });
        }}
        onDueDateChange={(next) => {
          void workspace.patchTask(selectedTask.id, {
            dueDate: next ? next.toISOString() : null,
          });
        }}
        onAssigneeChange={(next) => {
          void workspace.patchTask(selectedTask.id, { assigneeId: next });
        }}
        onProjectChange={handleProjectChange}
        onSaveDescription={(description) => {
          void workspace.patchTask(selectedTask.id, { description });
        }}
        onUploadImages={onUploadImages}
        resolveImageSrc={resolveImageSrc}
        onChangeLinks={(links) => {
          void workspace.patchTask(selectedTask.id, { links });
        }}
        documentLinkOptions={documentLinkOptions}
        emailLinkOptions={emailLinkOptions}
        onNavigateLink={(href) => {
          navigate(href);
        }}
        onSaveTitle={async (title) => {
          const trimmed = title.trim();
          if (!trimmed) {
            return { ok: false as const, error: "Task title is required." };
          }
          try {
            await workspace.patchTask(selectedTask.id, { title: trimmed });
            return { ok: true as const };
          } catch (error) {
            return {
              ok: false as const,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not rename task.",
            };
          }
        }}
        assigneeOptions={assigneeOptions}
        projectOptions={projectOptions}
        assigneeNavigateHref={
          resolvedAssigneeId ? `/contacts/${resolvedAssigneeId}` : null
        }
        projectNavigateHref={
          project?.key
            ? `/projects/${project.key}`
            : resolvedProjectKey
              ? `/projects/${resolvedProjectKey}`
              : null
        }
        onCreateAssigneeFromQuery={(query) => {
          void workspace.createContact({ name: query }).then((created) => {
            void workspace.patchTask(selectedTask.id, {
              assigneeId: created.id,
            });
          });
        }}
        onAgentInboxApprove={() => {
          const nextHref = getInboxHrefAfterRemovingItem(
            workspace.inboxItems,
            selectedTask.id,
          );
          void workspace.patchTask(selectedTask.id, {
            agentInboxApproved: true,
          });
          navigate(nextHref ?? "/inbox", { replace: true });
        }}
        belowDescription={
          <DesktopTaskActivityPanel
            taskId={selectedTask.id}
            taskUpdatedAt={selectedTaskRecord?.updatedAt ?? null}
            contacts={workspace.contacts}
            contactAvatarSrc={contactAvatarSrc}
            patchTaskValues={async (values) => {
              await workspace.patchTask(selectedTask.id, values);
            }}
            taskSummary={{
              number: selectedTask.number ?? 0,
              title: selectedTask.title,
              description:
                workspace.taskDescriptions[selectedTask.id] ??
                selectedTask.description ??
                null,
              projectKey: resolvedProjectKey,
              projectId: project?.id ?? null,
              projectName: project?.name ?? selectedTask.projectName ?? null,
              displayId: getInboxItemDisplayId(selectedTask),
              workingDirectory: workingDirectory,
            }}
          />
        }
      />
      </DesktopTaskLayout>
    </>
  );
}
