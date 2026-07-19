import { useCallback, useEffect, useMemo, useState } from "react";
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
  type TaskStatus,
} from "@backsteros/ui";

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
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [priority, setPriority] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<Date | null | undefined>(undefined);
  const [assigneeId, setAssigneeId] = useState<string | null | undefined>(
    undefined,
  );
  const [projectKey, setProjectKey] = useState<string | null>(null);

  const selected = itemId
    ? findInboxItemBySlugOrId(workspace.inboxItems, itemId) ?? null
    : null;

  const selectedTask =
    selected?.kind === "task" ? selected : null;

  // Inbox list items omit assignee; join full task row for detail chrome.
  const selectedTaskRecord = selectedTask
    ? (workspace.tasks.find((entry) => entry.id === selectedTask.id) ?? null)
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
    setStatus(null);
    setPriority(null);
    setDueDate(undefined);
    setAssigneeId(undefined);
    setProjectKey(selectedTask?.projectKey ?? null);
  }, [selectedTask?.id, selectedTask?.projectKey]);

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

  const resolvedProjectKey = projectKey ?? selectedTask.projectKey ?? null;
  const project =
    workspace.projects.find((entry) => entry.key === resolvedProjectKey) ?? null;
  const resolvedAssigneeId =
    assigneeId === undefined
      ? (selectedTaskRecord?.assigneeId ?? null)
      : assigneeId;
  const assignee =
    workspace.contacts.find((entry) => entry.id === resolvedAssigneeId) ?? null;
  const deleteEntityLabel = displayId
    ? `task ${displayId}`
    : "task";

  return (
    <>
      <RegisterEntityDeleteAction
        entityLabel={deleteEntityLabel}
        onDelete={handleDeleteTask}
      />
      <TaskDetailView
        sectionLabel="Inbox"
        task={{
          id: selectedTask.id,
          title: selectedTask.title,
          status: status ?? selectedTask.status,
          priority: priority ?? selectedTask.priority,
          dueDate:
            dueDate === undefined
              ? selectedTask.dueDate
              : dueDate
                ? dueDate.getTime()
                : null,
          assigneeId: resolvedAssigneeId,
          assigneeName: assignee?.name ?? null,
          projectKey: resolvedProjectKey,
          projectName: project?.name ?? selectedTask.projectName ?? null,
          description:
            workspace.taskDescriptions[selectedTask.id] ??
            selectedTask.description ??
            "",
          displayId: getInboxItemDisplayId(selectedTask),
        }}
        onStatusChange={(next) => {
          setStatus(next);
          void workspace.patchTask(selectedTask.id, { status: next });
        }}
        onPriorityChange={(next) => {
          setPriority(next);
          void workspace.patchTask(selectedTask.id, { priority: next });
        }}
        onDueDateChange={(next) => {
          setDueDate(next);
          void workspace.patchTask(selectedTask.id, {
            dueDate: next ? next.toISOString() : null,
          });
        }}
        onAssigneeChange={(next) => {
          setAssigneeId(next);
          void workspace.patchTask(selectedTask.id, { assigneeId: next });
        }}
        onProjectChange={(next) => {
          setProjectKey(next);
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
            setAssigneeId(created.id);
            void workspace.patchTask(selectedTask.id, {
              assigneeId: created.id,
            });
          });
        }}
      />
    </>
  );
}
