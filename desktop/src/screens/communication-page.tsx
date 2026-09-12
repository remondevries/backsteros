import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import {
  TaskDetailView,
  buildAssigneeDropdownOptions,
  buildInboxTaskListItem,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  buildTaskRelatedDropdownOptions,
  encodeTaskSlug,
  findCommunicationItemBySlugOrId,
  getCommunicationHref,
  getFirstCommunicationItemHref,
  getInboxItemDisplayId,
  getInboxTaskRouteSlugForTask,
  routeCopy,
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
import {
  buildDocumentLinkOptions,
  buildEmailLinkOptions,
} from "../lib/task-link-picker-options";
import { useAgentMail } from "../lib/agentmail-context";
import {
  useKeepAliveActive,
  useKeepAliveFrozen,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import { useCommunicationListItems } from "../lib/communication/use-communication-list-items";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { parseTaskLinks } from "../lib/workspace/row-mappers";

export function CommunicationPage() {
  const active = useKeepAliveActive();
  if (!active) return null;
  return <CommunicationPageBody />;
}

function CommunicationPageBody() {
  const navigate = useNavigate();
  const location = useShellLocation();
  const { itemId: routeItemId } = useShellParams() as { itemId?: string };
  const keepAliveActive = useKeepAliveActive();
  const keepAliveFrozen = useKeepAliveFrozen();
  const workspace = useDesktopWorkspaceData();
  const agentMail = useAgentMail();
  const communicationItems = useCommunicationListItems();

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? [] : workspace.contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    keepAliveFrozen ? [] : workspace.organizations,
  );

  const supportTask = useMemo((): InboxTaskListItem | null => {
    if (!routeItemId) return null;
    const fromList = findCommunicationItemBySlugOrId(
      communicationItems,
      routeItemId,
    );
    if (fromList?.kind === "task") return fromList;

    const normalized = routeItemId.trim().toLowerCase();
    const full = workspace.allTasks.find((task) => {
      if (!task.support) return false;
      if (task.id === routeItemId) return true;
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
      description: null,
      projectId: full.projectId,
      projectKey: full.projectKey ?? null,
      projectName: full.projectName ?? null,
      assigneeId: full.assigneeId ?? null,
      inbox: full.inbox ?? false,
      support: full.support ?? null,
      notification: full.notification ?? null,
    });
  }, [communicationItems, routeItemId, workspace.allTasks]);

  const selectedTaskRecord = useMemo(
    () =>
      supportTask
        ? (workspace.allTasks.find((task) => task.id === supportTask.id) ??
          null)
        : null,
    [supportTask, workspace.allTasks],
  );

  useEffect(() => {
    if (!keepAliveActive) return;
    if (routeItemId) return;
    if (location.pathname.startsWith("/email/")) return;
    const firstHref = getFirstCommunicationItemHref(communicationItems);
    if (firstHref) {
      navigateToHref(navigate, firstHref, { replace: true });
    }
  }, [
    communicationItems,
    keepAliveActive,
    location.pathname,
    navigate,
    routeItemId,
  ]);

  const displayId = supportTask ? getInboxItemDisplayId(supportTask) : null;
  useDesktopSectionBreadcrumb(
    supportTask
      ? [
          {
            label: routeCopy.communication.title,
            href: getCommunicationHref(),
          },
          {
            label: displayId
              ? `${displayId} ${supportTask.title}`
              : supportTask.title,
          },
        ]
      : [{ label: routeCopy.communication.title }],
    { enabled: keepAliveActive },
  );

  const { description: fetchedDescription, rememberDescription } =
    useDesktopTaskDescription(supportTask?.id, {
      enabled: keepAliveActive && Boolean(supportTask?.id),
    });
  const {
    attachments: fileAttachments,
    uploading: fileUploading,
    uploadFile,
    remove: removeFileAttachment,
    open: openFileAttachment,
  } = useTaskFileAttachments(supportTask?.id, {
    enabled: keepAliveActive && Boolean(supportTask?.id),
  });
  const { resolveImageSrc, onUploadImages } = useTaskDescriptionImages(
    supportTask?.id ?? "",
  );
  const [activityFeedBump, setActivityFeedBump] = useState(0);
  const bumpActivityFeed = useCallback(() => {
    setActivityFeedBump((n) => n + 1);
  }, []);
  const postTimerActivity = usePostTaskTimerActivity(
    supportTask?.id,
    bumpActivityFeed,
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(workspace.contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, workspace.contacts],
  );
  const projectOptions = useMemo(
    () => buildProjectDropdownOptions(workspace.projects),
    [workspace.projects],
  );
  const relatedOptions = useMemo(
    () =>
      buildTaskRelatedDropdownOptions({
        contactOptions: assigneeOptions,
        organizationOptions: buildOrganizationDropdownOptions(
          withAvatarSrc(workspace.organizations, organizationAvatarSrc),
          { includeNone: false },
        ),
      }),
    [assigneeOptions, organizationAvatarSrc, workspace.organizations],
  );
  const documentLinkOptions = useMemo(
    () => buildDocumentLinkOptions(workspace.documents),
    [workspace.documents],
  );
  const emailLinkOptions = useMemo(
    () => buildEmailLinkOptions(agentMail.messages),
    [agentMail.messages],
  );

  const assignee = useMemo(() => {
    const id = selectedTaskRecord?.assigneeId ?? supportTask?.assigneeId;
    if (!id) return null;
    return workspace.contacts.find((contact) => contact.id === id) ?? null;
  }, [
    selectedTaskRecord?.assigneeId,
    supportTask?.assigneeId,
    workspace.contacts,
  ]);

  const patchTask = useCallback(
    (patch: Record<string, unknown>) => {
      if (!supportTask) return;
      void workspace.patchTask(supportTask.id, patch);
    },
    [supportTask, workspace],
  );

  if (location.pathname.startsWith("/email/")) {
    return null;
  }

  if (!supportTask) {
    return (
      <div className="app-empty-state">
        <p>Select a support ticket or email from Communication.</p>
        <Link to="/communication">Back to Communication</Link>
      </div>
    );
  }

  return (
    <DesktopTaskLayout
      key={`communication-task-layout-${supportTask.id}`}
      taskId={supportTask.id}
    >
      <TaskDetailView
        sectionLabel="Communication"
        task={{
          id: supportTask.id,
          title: supportTask.title,
          status: selectedTaskRecord?.status ?? supportTask.status,
          priority: selectedTaskRecord?.priority ?? supportTask.priority,
          dueDate: selectedTaskRecord?.dueDate ?? supportTask.dueDate ?? null,
          assigneeId: selectedTaskRecord?.assigneeId ?? supportTask.assigneeId,
          assigneeName: assignee?.name ?? null,
          relatedContactIds: selectedTaskRecord?.relatedContactIds ?? [],
          relatedOrganizationIds:
            selectedTaskRecord?.relatedOrganizationIds ?? [],
          projectKey: supportTask.projectKey,
          projectName: supportTask.projectName,
          agentCreatedAt:
            selectedTaskRecord?.agentCreatedAt ??
            supportTask.agentCreatedAt ??
            null,
          agentInboxApprovedAt:
            selectedTaskRecord?.agentInboxApprovedAt ??
            supportTask.agentInboxApprovedAt ??
            null,
          trackedMinutes: selectedTaskRecord?.trackedMinutes ?? null,
          trackedDurationSeconds:
            selectedTaskRecord?.trackedDurationSeconds ?? null,
          support: selectedTaskRecord?.support ?? supportTask.support ?? false,
          description: fetchedDescription,
          links: parseTaskLinks(
            workspace.taskDetails[supportTask.id]?.links,
          ),
          displayId: getInboxItemDisplayId(supportTask),
        }}
        assigneeOptions={assigneeOptions}
        projectOptions={projectOptions}
        relatedOptions={relatedOptions}
        documentLinkOptions={documentLinkOptions}
        emailLinkOptions={emailLinkOptions}
        fileAttachments={fileAttachments}
        fileUploading={fileUploading}
        onUploadFile={async (file) => {
          await uploadFile(file);
        }}
        onRemoveFile={removeFileAttachment}
        onOpenFile={openFileAttachment}
        onStatusChange={(next) => patchTask({ status: next })}
        onPriorityChange={(next) => patchTask({ priority: next })}
        onDueDateChange={(next) =>
          patchTask({ dueDate: next ? next.toISOString() : null })
        }
        onAssigneeChange={(next) => patchTask({ assigneeId: next })}
        onRelatedChange={(related) =>
          patchTask({
            relatedContactIds: related.contactIds,
            relatedOrganizationIds: related.organizationIds,
          })
        }
        onProjectChange={(projectKey) => patchTask({ projectKey })}
        onSaveDescription={(description) => {
          rememberDescription(description);
          patchTask({ description });
        }}
        onUploadImages={onUploadImages}
        resolveImageSrc={resolveImageSrc}
        onChangeLinks={(links) => patchTask({ links })}
        onTimerSessionChange={postTimerActivity}
        timerSession={{
          kind: "task",
          entityId: supportTask.id,
          title: supportTask.title,
          subtitle: getInboxItemDisplayId(supportTask),
          statusKey: selectedTaskRecord?.status ?? supportTask.status,
          href: location.pathname,
        }}
        belowDescription={
          <DesktopTaskActivityPanel
            taskId={supportTask.id}
            taskUpdatedAt={selectedTaskRecord?.updatedAt ?? null}
            contacts={workspace.contacts}
            contactAvatarSrc={contactAvatarSrc}
            patchTaskValues={async (values) => {
              await workspace.patchTask(supportTask.id, values);
            }}
            activityFeedBump={activityFeedBump}
            commentResolveMode="ticket"
            taskSummary={{
              number: supportTask.number ?? 0,
              title: supportTask.title,
              description: fetchedDescription || null,
              status: selectedTaskRecord?.status ?? supportTask.status,
              projectKey: supportTask.projectKey,
              projectId: selectedTaskRecord?.projectId ?? null,
              projectName: supportTask.projectName ?? null,
              displayId: getInboxItemDisplayId(supportTask),
            }}
          />
        }
      />
    </DesktopTaskLayout>
  );
}
