import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import {
  RegisterEntityDeleteAction,
  RegisterEntityDuplicateAction,
  TaskDetailView,
  buildAssigneeDropdownOptions,
  buildInboxTaskListItem,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  buildTaskRelatedDropdownOptions,
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
import { navigateToHref } from "../router/navigate-href";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useTaskFileAttachments } from "../lib/use-task-file-attachments";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { usePostTaskTimerActivity } from "../lib/use-post-task-timer-activity";
import { useTaskDescriptionImages } from "../lib/task-description-images";
import { useDesktopTaskDescription } from "../lib/use-task-description";
import { useEnsureProjectVault } from "../lib/use-ensure-project-vault";
import {
  buildDocumentLinkOptions,
  buildEmailLinkOptions,
  buildLetterLinkOptions,
} from "../lib/task-link-picker-options";
import { useAgentMail } from "../lib/agentmail-context";
import { useInboxListSessionPin } from "../lib/inbox/inbox-list-session-context";
import {
  useKeepAliveActive,
  useKeepAliveFrozen,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceDocuments,
  useDesktopWorkspaceInboxItems,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
  useDesktopWorkspaceTasks,
} from "../lib/workspace-data";
import { parseTaskLinks } from "../lib/workspace/row-mappers";

type MovedToProjectNotice = {
  projectKey: string;
  projectName: string;
  taskNumber: number;
};

function resolveInboxTaskFromWorkspace(
  inboxItems: ReturnType<typeof useDesktopWorkspaceInboxItems>,
  allTasks: ReturnType<typeof useDesktopWorkspaceTasks>["allTasks"],
  itemId: string): InboxTaskListItem | null {
  const fromList = findInboxItemBySlugOrId(inboxItems, itemId);
  if (fromList?.kind === "task") return fromList;

  const normalized = itemId.trim().toLowerCase();
  const full = allTasks.find((task) => {
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
    // List SQL omits description — useDesktopTaskDescription loads from SQLite.
    description: null,
    projectId: full.projectId,
    projectKey: full.projectKey ?? null,
    projectName: full.projectName ?? null,
    assigneeId: full.assigneeId ?? null,
    inbox: false,
  });
}

export function InboxPage() {
  return <InboxPageBody />;
}

function InboxPageBody() {
  const navigate = useNavigate();
  const location = useShellLocation();
  const { itemId: routeItemId } = useShellParams() as { itemId?: string };
  const keepAliveActive = useKeepAliveActive();
  const keepAliveFrozen = useKeepAliveFrozen();
  const inboxItems = useDesktopWorkspaceInboxItems();
  const { allTasks, taskDetails } =
    useDesktopWorkspaceTasks();
  const { knowledgeDocuments, projectDocuments } =
    useDesktopWorkspaceDocuments();
  const { contacts, organizations } = useDesktopWorkspacePeople();
  const { projects, letters } = useDesktopWorkspaceProjects();
  const workspace = useDesktopWorkspaceActions();
  const agentMail = useAgentMail();
  const { unpinInboxListItem } = useInboxListSessionPin();
  const documentLinkOptions = useMemo(
    () =>
      buildDocumentLinkOptions(
        [...knowledgeDocuments, ...projectDocuments],
        projects,
      ),
    [knowledgeDocuments, projectDocuments, projects]);
  const letterLinkOptions = useMemo(
    () => buildLetterLinkOptions(letters, projects),
    [letters, projects]);
  const emailLinkOptions = useMemo(
    () =>
      keepAliveFrozen ? [] : buildEmailLinkOptions(agentMail.messages),
    [agentMail.messages, keepAliveFrozen]);
  const [movedNotice, setMovedNotice] = useState<MovedToProjectNotice | null>(
    null);
  const [activityFeedBump, setActivityFeedBump] = useState(0);

  const firstInboxHref = getFirstInboxItemHref(inboxItems);
  const firstInboxItemId =
    !routeItemId && firstInboxHref?.startsWith("/inbox/")
      ? firstInboxHref.slice("/inbox/".length).split("/")[0]
      : undefined;
  const itemId = routeItemId ?? firstInboxItemId;

  // Match contacts: when the route is the section root, open the first row so
  // the side panel selection and detail stay in sync with the URL.
  useEffect(() => {
    if (!keepAliveActive || routeItemId || !firstInboxHref) return;
    if (!firstInboxHref.startsWith("/inbox/")) return;
    navigateToHref(navigate, firstInboxHref, { replace: true });
  }, [firstInboxHref, keepAliveActive, navigate, routeItemId]);

  const selectedTask = useMemo(() => {
    if (!itemId) return null;
    return resolveInboxTaskFromWorkspace(
      inboxItems,
      allTasks,
      itemId);
  }, [allTasks, inboxItems, itemId]);

  const inList = useMemo(
    () =>
      selectedTask
        ? inboxItems.some((item) => item.id === selectedTask.id)
        : false,
    [inboxItems, selectedTask],
  );

  // Inbox list items omit assignee; join full task row for detail chrome.
  const selectedTaskRecord = useMemo(
    () =>
      selectedTask
        ? (allTasks.find((entry) => entry.id === selectedTask.id) ?? null)
        : null,
    [allTasks, selectedTask],
  );

  useEnsureProjectVault(
    keepAliveActive ? selectedTaskRecord?.projectId : null);

  const bumpActivityFeed = useCallback(() => {
    setActivityFeedBump((n) => n + 1);
  }, []);
  const postTimerActivity = usePostTaskTimerActivity(
    selectedTask?.id,
    bumpActivityFeed,
  );

  const {
    description: fetchedDescription,
    rememberDescription,
  } = useDesktopTaskDescription(selectedTask?.id, {
    enabled: keepAliveActive && Boolean(selectedTask?.id),
  });

  const { onUploadImages, resolveImageSrc } = useTaskDescriptionImages(
    selectedTask?.id ?? "");

  const {
    attachments: fileAttachments,
    uploading: fileUploading,
    uploadFile,
    remove: removeFileAttachment,
    open: openFileAttachment,
  } = useTaskFileAttachments(selectedTask?.id, {
    enabled: keepAliveActive && Boolean(selectedTask?.id),
  });

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
    { enabled: keepAliveActive });

  useEffect(() => {
    setMovedNotice(null);
  }, [itemId]);

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? [] : contacts);

  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    keepAliveFrozen ? [] : organizations);

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(contacts, contactAvatarSrc)),
    [contactAvatarSrc, contacts]);

  const relatedOptions = useMemo(
    () =>
      buildTaskRelatedDropdownOptions({
        contactOptions: assigneeOptions,
        organizationOptions: buildOrganizationDropdownOptions(
          withAvatarSrc(organizations, organizationAvatarSrc),
          { includeNone: false },
        ),
      }),
    [assigneeOptions, organizationAvatarSrc, organizations],
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
        { includeNone: false }),
    [projects]);

  const handleDeleteTask = useCallback(async () => {
    if (!selectedTask) {
      return { ok: false as const, error: "Task is required." };
    }
    try {
      await workspace.softDeleteTask(selectedTask.id);
      navigateToHref(navigate, "/inbox", { replace: true });
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
          ? (projects.find((entry) => entry.key === projectKey) ??
            null)
          : selectedTask.projectId
            ? (projects.find(
                (entry) => entry.id === selectedTask.projectId) ?? null)
            : null;
      navigateToHref(
        navigate,
        resolveDuplicatedTaskHref({
          id: created.id,
          number: created.number,
          projectKey: project?.key ?? projectKey,
        }));
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to duplicate task.",
      };
    }
  }, [navigate, projects, selectedTask, workspace]);

  const handleProjectChange = useCallback(
    (next: string | null) => {
      if (!selectedTask) return;
      const nextProject = next
        ? projects.find((entry) => entry.key === next) ?? null
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
    [projects, selectedTask, workspace]);

  if (!selectedTask) {
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-empty">
          <p>{itemId ? "Item not found." : "Inbox is empty."}</p>
        </div>
      </div>
    );
  }

  const resolvedProjectKey =
    selectedTask.projectKey ??
    selectedTaskRecord?.projectKey ??
    null;
  const project =
    projects.find((entry) => entry.key === resolvedProjectKey) ??
    (selectedTaskRecord?.projectId
      ? projects.find(
          (entry) => entry.id === selectedTaskRecord.projectId) ?? null
      : null);
  const resolvedAssigneeId = selectedTaskRecord?.assigneeId ?? null;
  const assignee =
    contacts.find((entry) => entry.id === resolvedAssigneeId) ?? null;
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
      {keepAliveActive ? (
        <>
          <RegisterEntityDuplicateAction onDuplicate={handleDuplicateTask} />
          <RegisterEntityDeleteAction
            entityLabel={deleteEntityLabel}
            onDelete={handleDeleteTask}
          />
        </>
      ) : null}
      <DesktopTaskLayout>
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
          relatedContactIds: selectedTaskRecord?.relatedContactIds ?? [],
          relatedOrganizationIds:
            selectedTaskRecord?.relatedOrganizationIds ?? [],
          projectKey: project?.key ?? resolvedProjectKey,
          projectName: project?.name ?? selectedTask.projectName ?? null,
          agentCreatedAt: selectedTaskRecord?.agentCreatedAt ?? selectedTask.agentCreatedAt ?? null,
          agentInboxApprovedAt:
            selectedTaskRecord?.agentInboxApprovedAt ??
            selectedTask.agentInboxApprovedAt ??
            null,
          trackedMinutes: selectedTaskRecord?.trackedMinutes ?? null,
          trackedDurationSeconds:
            selectedTaskRecord?.trackedDurationSeconds ?? null,
          description: fetchedDescription,
          links: parseTaskLinks(
            taskDetails[selectedTask.id]?.links),
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
        onTrackedDurationSecondsChange={(seconds) => {
          const trackedMinutes =
            seconds != null && seconds >= 60 ? Math.floor(seconds / 60) : null;
          void workspace.patchTask(selectedTask.id, {
            trackedDurationSeconds: seconds,
            trackedMinutes,
          });
        }}
        onTimerSessionChange={postTimerActivity}
        timerSession={{
          kind: "task",
          entityId: selectedTask.id,
          title: selectedTask.title,
          subtitle: getInboxItemDisplayId(selectedTask),
          statusKey: selectedTaskRecord?.status ?? selectedTask.status,
          href: location.pathname,
        }}
        onDueDateChange={(next) => {
          void workspace.patchTask(selectedTask.id, {
            dueDate: next ? next.toISOString() : null,
          });
        }}
        onAssigneeChange={(next) => {
          void workspace.patchTask(selectedTask.id, { assigneeId: next });
        }}
        onRelatedChange={(related) => {
          void workspace.patchTask(selectedTask.id, {
            relatedContactIds: related.contactIds,
            relatedOrganizationIds: related.organizationIds,
          });
        }}
        onProjectChange={handleProjectChange}
        onSaveDescription={(description) => {
          rememberDescription(description);
          void workspace.patchTask(selectedTask.id, { description });
        }}
        onUploadImages={onUploadImages}
        resolveImageSrc={resolveImageSrc}
        onChangeLinks={(links) => {
          void workspace.patchTask(selectedTask.id, { links });
        }}
        fileAttachments={fileAttachments}
        fileUploading={fileUploading}
        onUploadFile={async (file) => {
          await uploadFile(file);
        }}
        onRemoveFile={removeFileAttachment}
        onOpenFile={openFileAttachment}
        documentLinkOptions={documentLinkOptions}
        letterLinkOptions={letterLinkOptions}
        emailLinkOptions={emailLinkOptions}
        onNavigateLink={(href) => {
          navigateToHref(navigate, href);
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
        relatedOptions={relatedOptions}
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
        onCreateRelatedContactFromQuery={(query) => {
          void workspace.createContact({ name: query }).then((created) => {
            const current = selectedTaskRecord?.relatedContactIds ?? [];
            if (current.includes(created.id)) return;
            void workspace.patchTask(selectedTask.id, {
              relatedContactIds: [...current, created.id],
            });
          });
        }}
        onAgentInboxApprove={() => {
          const nextHref = getInboxHrefAfterRemovingItem(
            inboxItems,
            selectedTask.id);
          unpinInboxListItem(selectedTask.id);
          void workspace.patchTask(selectedTask.id, {
            agentInboxApproved: true,
          });
          navigateToHref(navigate, nextHref ?? "/inbox", {
            replace: true,
          });
        }}
        belowDescription={
          <DesktopTaskActivityPanel
            taskId={selectedTask.id}
            taskUpdatedAt={selectedTaskRecord?.updatedAt ?? null}
            contacts={contacts}
            contactAvatarSrc={contactAvatarSrc}
            patchTaskValues={async (values) => {
              await workspace.patchTask(selectedTask.id, values);
            }}
            activityFeedBump={activityFeedBump}
            taskSummary={{
              number: selectedTask.number ?? 0,
              title: selectedTask.title,
              description: fetchedDescription || null,
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
