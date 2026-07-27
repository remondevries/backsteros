import { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  InboxDetailSkeleton,
  RegisterEntityDeleteAction,
  TaskDetailView,
  buildAssigneeDropdownOptions,
  buildProjectDropdownOptions,
  findInboxItemBySlugOrId,
  getFirstInboxItemHref,
  getInboxItemDisplayId,
} from "@backsteros/ui";

import { DesktopTaskActivityPanel } from "../components/desktop-task-activity-panel";
import { DesktopTaskWorkbench } from "../components/desktop-task-workbench";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

export function InboxPage() {
  const navigate = useNavigate();
  const { itemId } = useParams<{ itemId?: string }>();
  const workspace = useDesktopWorkspaceData();

  const selected = itemId
    ? findInboxItemBySlugOrId(workspace.inboxItems, itemId) ?? null
    : null;

  const selectedTask =
    selected?.kind === "task" ? selected : null;

  // Inbox list items omit assignee; join full task row for detail chrome.
  const selectedTaskRecord = selectedTask
    ? (workspace.allTasks.find((entry) => entry.id === selectedTask.id) ?? null)
    : null;

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
    if (itemId) {
      if (!selectedTask && workspace.inboxItems.length) {
        const first = getFirstInboxItemHref(workspace.inboxItems);
        if (first) navigate(first, { replace: true });
      }
      return;
    }

    const first = getFirstInboxItemHref(workspace.inboxItems);
    if (first) {
      navigate(first, { replace: true });
    }
  }, [itemId, navigate, selectedTask, workspace.inboxItems]);

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

  const resolvedProjectKey = selectedTask.projectKey ?? null;
  const project =
    workspace.projects.find((entry) => entry.key === resolvedProjectKey) ?? null;
  const resolvedAssigneeId = selectedTaskRecord?.assigneeId ?? null;
  const assignee =
    workspace.contacts.find((entry) => entry.id === resolvedAssigneeId) ?? null;
  const deleteEntityLabel = displayId
    ? `task ${displayId}`
    : "task";

  const workingDirectory = project?.localWorkingDirectory ?? null;

  return (
    <>
      <RegisterEntityDeleteAction
        entityLabel={deleteEntityLabel}
        onDelete={handleDeleteTask}
      />
      <DesktopTaskWorkbench
        taskId={selectedTask.id}
        projectId={project?.id ?? null}
        projectLabel={project?.name ?? selectedTask.projectName ?? "Task"}
        taskDisplayId={displayId}
        cwd={workingDirectory?.trim() || "~"}
        agentChatId={selectedTaskRecord?.agentChatId ?? null}
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
        patchTaskValues={(values) =>
          workspace.patchTask(selectedTask.id, values)
        }
      >
      <TaskDetailView
        sectionLabel="Inbox"
        task={{
          id: selectedTask.id,
          title: selectedTask.title,
          status: selectedTask.status,
          priority: selectedTask.priority,
          dueDate: selectedTask.dueDate,
          assigneeId: resolvedAssigneeId,
          assigneeName: assignee?.name ?? null,
          projectKey: resolvedProjectKey,
          projectName: project?.name ?? selectedTask.projectName ?? null,
          description:
            workspace.taskDescriptions[selectedTask.id] ??
            selectedTask.description ??
            "",
          links: workspace.taskLinks[selectedTask.id] ?? [],
          displayId: getInboxItemDisplayId(selectedTask),
        }}
        onStatusChange={(next) => {
          void workspace.patchTask(selectedTask.id, { status: next });
        }}
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
        onProjectChange={(next) => {
          const nextProject = next
            ? workspace.projects.find((entry) => entry.key === next) ?? null
            : null;
          void workspace.patchTask(selectedTask.id, {
            projectId: nextProject?.id ?? null,
          });
        }}
        onSaveDescription={(description) => {
          void workspace.patchTask(selectedTask.id, { description });
        }}
        onChangeLinks={(links) => {
          void workspace.patchTask(selectedTask.id, { links });
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
          resolvedProjectKey ? `/projects/${resolvedProjectKey}` : null
        }
        onCreateAssigneeFromQuery={(query) => {
          void workspace.createContact({ name: query }).then((created) => {
            void workspace.patchTask(selectedTask.id, {
              assigneeId: created.id,
            });
          });
        }}
        belowDescription={
          <DesktopTaskActivityPanel
            taskId={selectedTask.id}
            taskUpdatedAt={selectedTaskRecord?.updatedAt ?? null}
            contacts={workspace.contacts}
            contactAvatarSrc={contactAvatarSrc}
            patchTaskValues={(values) =>
              workspace.patchTask(selectedTask.id, values)
            }
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
      </DesktopTaskWorkbench>
    </>
  );
}
