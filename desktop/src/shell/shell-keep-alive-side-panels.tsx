import { useCallback, useEffect, useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";

import { primeTabTitle } from "@backsteros/ui/shell";
import {
  buildAssigneeDropdownOptions,
  buildProjectDropdownOptions,
  buildTaskDueDatePatch,
} from "@backsteros/ui/tasks";
import {
  buildInboxEmailListItem,
  emailBelongsInInbox,
  isInboxPath,
  sortInboxItemsByAttentionStatus,
  taskBelongsInInbox,
  type InboxListItem,
} from "@backsteros/ui/inbox";
import {
  defaultNewMeetingTimes,
  withCalendarMeetingSearch,
  readCalendarViewModeFromSearch,
  unscheduledCalendarTasks,
  withCalendarViewSearch,
  type CalendarSidePanelHabitItem,
} from "@backsteros/ui/calendar";
import {
  getContactsGroupHref,
  getFirstInboxItemHref,
  getJournalHref,
  getOrganizationsGroupHref,
  getScopedProjectSectionHref,
  getSocialHref,
  getUniqueListItemRouteParam,
  groupItemsByAlphaLetter,
  normalizeContactSocialAccounts,
  parseCrmGroupId,
  resolveLetterDetailHref,
  type SocialContactListItem,
} from "@backsteros/ui";
import {
  getKnowledgeHref,
  getProjectRouteParamFromPathname,
  getProjectRouteScopeFromPathname,
  getScopedProjectDocumentHref,
  getTodayJournalDateSlug,
  isProjectLettersSectionPath,
} from "@backsteros/ui/navigation";

import { useDesktopApi } from "../lib/api-context";
import { useAgentMail } from "../lib/agentmail-context";
import { panePathnameWithFirstItem } from "../lib/keep-alive-list-selection";
import {
  firstKnowledgeHref,
  firstLetterHref,
} from "../lib/section-entry-hrefs";
import { buildMailboxByIdMap } from "../lib/email-list-tasks";
import { agentMailMessagesSignature } from "../lib/agentmail-list-cache";
import { dispatchEmailListPatch } from "../lib/use-agentmail-mailboxes";
import { habitsWithTodayTasks } from "../lib/habit-today-tasks";
import {
  isTaskAgentWorkingForUi,
  renderTaskAgentTitleTrailing,
} from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { buildInboxAttentionGroupOverrides } from "../lib/inbox/build-inbox-session-list";
import { useInboxListSessionPin } from "../lib/inbox/inbox-list-session-context";
import { useInboxSessionList } from "../lib/inbox/use-inbox-session-list";
import { useInboxTriageNotifications } from "../lib/inbox/use-inbox-triage-notifications";
import { useInboxUpdatedNotifications } from "../lib/inbox/use-inbox-updated-notifications";
import {
  useKeepAliveAfterPaint,
  useKeepAliveFrozen,
  useShellLocation,
} from "../lib/shell-route-keep-alive";
import type { PendingPageSurface as Surface } from "../lib/pending-navigation-routes";
import { useCrmGroupsCatalog } from "../lib/use-crm-data";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceDocuments,
  useDesktopWorkspaceMeta,
  useDesktopWorkspaceInboxItems,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
  useDesktopWorkspaceTasks,
  useWorkspaceSurfaceReady,
} from "../lib/workspace-data";
import {
  DesktopCalendarSidePanel,
  DesktopContactsSidePanel,
  DesktopFinanceSidePanel,
  DesktopHabitSidePanel,
  DesktopJournalSidePanel,
  DesktopKnowledgeSidePanel,
  DesktopLettersSidePanel,
  DesktopProjectDocumentsSidePanel,
  DesktopSocialSidePanel,
} from "./app-shell-side-panels-lazy";
import { DesktopInboxSidePanel } from "./app-shell-inbox-side-panel";
import { DesktopCommunicationSidePanel } from "./side-panels/communication-side-panel";
import { RouterLink } from "./app-shell-links";
import { handleDocumentTreeReorder } from "./document-tree-reorder";
import type { LeftSidePanelDest } from "../lib/left-side-panel-dest";
import { useCommunicationListItems } from "../lib/communication/use-communication-list-items";
import {
  getEmailComposeHref,
  getFirstCommunicationItemHref,
} from "@backsteros/ui";
import { rememberSectionEntryHrefs } from "../lib/section-entry-store";

const NO_ENTITIES: [] = [];

type PanelNav = (href: string) => void;

export type { LeftSidePanelDest } from "../lib/left-side-panel-dest";
export {
  isKeepAliveLeftSidePanelDest,
  resolveLeftSidePanelDest,
} from "../lib/left-side-panel-dest";

/**
 * One tree builder for the host. Keep-alive dests and finance both go here.
 */
export function resolveSidePanelTree(
  dest: LeftSidePanelDest,
  onNavigate: PanelNav,
  options: {
    pathname?: string;
    sidePanelCollapsed?: boolean;
    setSidePanelCollapsed?: Dispatch<SetStateAction<boolean>>;
  } = {},
): ReactNode {
  if (dest === "finance") {
    const setCollapsed = options.setSidePanelCollapsed;
    return (
      <DesktopFinanceSidePanel
        pathname={options.pathname ?? ""}
        Link={RouterLink}
        collapsed={options.sidePanelCollapsed ?? false}
        onToggleCollapse={() => setCollapsed?.((current) => !current)}
        onExpand={() => setCollapsed?.(false)}
      />
    );
  }
  return keepAliveSidePanelTree(dest, onNavigate, options.pathname ?? "");
}

export function keepAliveSidePanelTree(
  surface: Surface,
  onNavigate: PanelNav,
  pathname = "",
): ReactNode {
  switch (surface) {
    case "inbox":
      return <InboxKeepAliveSidePanel onNavigate={onNavigate} />;
    case "calendar":
      return <CalendarKeepAliveSidePanel onNavigate={onNavigate} />;
    case "journal-day":
      return <JournalKeepAliveSidePanel onNavigate={onNavigate} />;
    case "journal-habits":
      return <HabitsKeepAliveSidePanel onNavigate={onNavigate} />;
    case "knowledge":
      return <KnowledgeKeepAliveSidePanel onNavigate={onNavigate} />;
    case "projects": {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length < 2) return null;
      return <ProjectKeepAliveSidePanel onNavigate={onNavigate} />;
    }
    case "contacts":
      return <ContactsKeepAliveSidePanel onNavigate={onNavigate} />;
    case "organizations":
      return <OrganizationsKeepAliveSidePanel onNavigate={onNavigate} />;
    case "social":
      return <SocialKeepAliveSidePanel onNavigate={onNavigate} />;
    case "communication":
      return <CommunicationKeepAliveSidePanel onNavigate={onNavigate} />;
    case "letters":
      return <LettersKeepAliveSidePanel onNavigate={onNavigate} />;
    case "tasks-list":
      return null;
    default:
      return null;
  }
}

export function InboxKeepAliveSidePanel({ onNavigate }: { onNavigate: PanelNav }) {
  const painted = useKeepAliveAfterPaint();
  const { pathname } = useShellLocation();
  const inboxItems = useDesktopWorkspaceInboxItems();
  if (!painted) {
    return (
      <DesktopInboxSidePanel
        onNavigate={onNavigate}
        pathname={panePathnameWithFirstItem(
          pathname,
          getFirstInboxItemHref(inboxItems),
          pathname.startsWith("/inbox/") || pathname.startsWith("/email/"),
        )}
        items={inboxItems}
        loading={false}
        Link={RouterLink}
        groupByAttentionStatus
      />
    );
  }
  return <InboxKeepAliveSidePanelLive onNavigate={onNavigate} />;
}

function InboxKeepAliveSidePanelLive({ onNavigate }: { onNavigate: PanelNav }) {
  const frozen = useKeepAliveFrozen();
  const inboxReady = useWorkspaceSurfaceReady("inbox");
  const { pathname } = useShellLocation();
  const { client } = useDesktopApi();
  const inboxItems = useDesktopWorkspaceInboxItems();
  const { projects } = useDesktopWorkspaceProjects();
  const { contacts, organizations } = useDesktopWorkspacePeople();
  const { allTasks } = useDesktopWorkspaceTasks();
  const workspaceActions = useDesktopWorkspaceActions();
  const agentStatus = useDesktopAgentStatusOptional();
  const agentMail = useAgentMail();
  const { pinnedItems } = useInboxListSessionPin();

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    frozen ? NO_ENTITIES : contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    frozen ? NO_ENTITIES : organizations,
  );

  const composeContacts = useMemo(
    () => (frozen ? [] : withAvatarSrc(contacts, contactAvatarSrc)),
    [contactAvatarSrc, contacts, frozen],
  );

  const inboxNotificationsReady = inboxReady;
  const inboxNotificationsActive = !frozen && isInboxPath(pathname);

  const workspaceInboxItems = useMemo(
    () => {
      const liveTaskById = new Map(allTasks.map((task) => [task.id, task]));
      const next: InboxListItem[] = [];
      for (const item of inboxItems) {
        if (item.kind === "meeting") {
          if (!item.organizationId) {
            next.push(item);
            continue;
          }
          next.push({
            ...item,
            organizationAvatarSrc:
              organizationAvatarSrc[item.organizationId] ?? null,
          });
          continue;
        }
        if (item.kind !== "task") {
          next.push(item);
          continue;
        }
        const live = liveTaskById.get(item.id);
        const merged = live
          ? {
              ...item,
              // Side panel + detail must show the same scheduling fields.
              status: live.status ?? item.status,
              priority: live.priority ?? item.priority,
              dueDate:
                typeof live.dueDate === "number"
                  ? live.dueDate
                  : live.dueDate
                    ? live.dueDate.getTime()
                    : item.dueDate,
              assigneeId: live.assigneeId ?? item.assigneeId,
            }
          : item;
        // Live due-date overlays can move a row onto today/tomorrow — drop it.
        if (
          !taskBelongsInInbox({
            inbox: merged.inbox,
            status: merged.status,
            dueDate: merged.dueDate,
            agentCreatedAt: merged.agentCreatedAt,
            agentInboxApprovedAt: merged.agentInboxApprovedAt,
            inboxUpdatedAt: merged.inboxUpdatedAt,
          })
        ) {
          continue;
        }
        next.push(merged);
      }
      return next;
    },
    [allTasks, inboxItems, organizationAvatarSrc],
  );

  const agentMailListSignature = useMemo(
    () => agentMailMessagesSignature(agentMail.messages),
    [agentMail.messages],
  );

  const emailInboxItems = useMemo((): InboxListItem[] => {
    if (frozen) return [];
    const mailboxById = buildMailboxByIdMap(agentMail.mailboxes);
    return agentMail.messages
      .filter((item) =>
        emailBelongsInInbox({
          status: item.status,
          dueDate: item.dueDate,
          inboxUpdatedAt: item.inboxUpdatedAt,
        }),
      )
      .map((item) => {
        const mailbox = mailboxById.get(item.inboxId) ?? null;
        return buildInboxEmailListItem({
          inboxId: item.inboxId,
          messageId: item.id,
          draftId: item.kind === "draft" ? item.id : null,
          threadId: item.threadId,
          title: item.subject,
          from: item.from,
          status: item.status,
          inboxUpdatedAt: item.inboxUpdatedAt,
          priority: item.priority,
          dueDate: item.dueDate,
          updatedAt: item.receivedAt,
          assigneeId: item.assigneeId,
          projectId: item.projectId,
          projectKey: item.projectKey,
          projectName: item.projectName,
          organizationId: item.organizationId,
          organizationName: item.organizationName,
          contactId: item.contactId,
          contactName: item.contactName,
          emailThreadId: item.emailThreadId,
          number: item.number,
          displayId: item.displayId,
          mailboxLabel: mailbox
            ? mailbox.contactName?.trim() ||
              mailbox.displayName?.trim() ||
              mailbox.email ||
              mailbox.inboxId
            : null,
          mailboxAvatarSrc: mailbox?.contactId
            ? contactAvatarSrc[mailbox.contactId] ?? null
            : null,
        });
      });
  }, [
    agentMail.mailboxes,
    agentMailListSignature,
    contactAvatarSrc,
    frozen,
  ]);

  const baseInboxItems = useMemo(() => {
    if (frozen) {
      return sortInboxItemsByAttentionStatus(workspaceInboxItems);
    }
    return sortInboxItemsByAttentionStatus([
      ...workspaceInboxItems,
      ...emailInboxItems,
    ]);
  }, [emailInboxItems, frozen, workspaceInboxItems]);

  const inboxItemsWithEmail = useInboxSessionList(
    !frozen,
    inboxNotificationsReady,
    baseInboxItems,
    pinnedItems,
  );

  const inboxAttentionGroupOverrides = useMemo(
    () => buildInboxAttentionGroupOverrides(pinnedItems),
    [pinnedItems],
  );

  useInboxTriageNotifications(inboxItemsWithEmail, inboxNotificationsActive);
  useInboxUpdatedNotifications(
    inboxItemsWithEmail,
    inboxNotificationsReady,
    inboxNotificationsActive,
  );

  const patchEmailThreadFromInbox = useCallback(
    (
      itemId: string,
      patch: {
        status?: string;
        priority?: number;
        dueDate?: string | null;
        projectId?: string | null;
        assigneeId?: string | null;
      },
      listExtras?: {
        projectName?: string | null;
        projectKey?: string | null;
        assigneeName?: string | null;
      },
    ) => {
      const item = inboxItemsWithEmail.find(
        (entry) => entry.id === itemId && entry.kind === "email",
      );
      if (!item || item.kind !== "email") return;
      const threadKey = item.threadId?.trim() || item.messageId;
      dispatchEmailListPatch({
        inboxId: item.inboxId,
        messageId: item.messageId,
        threadId: item.threadId ?? null,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
        ...(patch.projectId !== undefined
          ? { projectId: patch.projectId }
          : {}),
        ...(patch.assigneeId !== undefined
          ? { assigneeId: patch.assigneeId }
          : {}),
        ...(listExtras?.projectName !== undefined
          ? { projectName: listExtras.projectName }
          : {}),
        ...(listExtras?.projectKey !== undefined
          ? { projectKey: listExtras.projectKey }
          : {}),
        ...(listExtras?.assigneeName !== undefined
          ? { assigneeName: listExtras.assigneeName }
          : {}),
      });
      void client
        .requestJson(
          `/api/v1/email/inboxes/${encodeURIComponent(item.inboxId)}/threads/${encodeURIComponent(threadKey)}/metadata`,
          {
            method: "PATCH",
            body: JSON.stringify(patch),
          },
        )
        .catch((error) => {
          console.warn("[inbox] email metadata patch failed:", error);
        });
    },
    [client, inboxItemsWithEmail],
  );

  const inboxProjectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
        })),
        { includeNone: true },
      ),
    [projects],
  );

  const inboxAssigneeOptions = useMemo(
    () => buildAssigneeDropdownOptions(composeContacts),
    [composeContacts],
  );

  const allTasksById = useMemo(() => {
    const map = new Map<string, (typeof allTasks)[number]>();
    for (const task of allTasks) {
      map.set(task.id, task);
    }
    return map;
  }, [allTasks]);

  return (
    <DesktopInboxSidePanel
      onNavigate={onNavigate}
      pathname={panePathnameWithFirstItem(
        pathname,
        getFirstInboxItemHref(inboxItemsWithEmail),
        pathname.startsWith("/inbox/") || pathname.startsWith("/email/"),
      )}
      items={inboxItemsWithEmail}
      attentionGroupOverrides={inboxAttentionGroupOverrides}
      loading={!inboxReady && inboxItemsWithEmail.length === 0}
      Link={RouterLink}
      projectOptions={inboxProjectOptions}
      assigneeOptions={inboxAssigneeOptions}
      onStatusChange={(itemId, status) => {
        const item = inboxItemsWithEmail.find((entry) => entry.id === itemId);
        if (item?.kind === "meeting") return;
        if (item?.kind === "email") {
          void patchEmailThreadFromInbox(itemId, { status });
          return;
        }
        void workspaceActions.patchTask(itemId, { status });
      }}
      onPriorityChange={(itemId, priority) => {
        const item = inboxItemsWithEmail.find((entry) => entry.id === itemId);
        if (item?.kind === "meeting") return;
        if (item?.kind === "email") {
          void patchEmailThreadFromInbox(itemId, { priority });
          return;
        }
        void workspaceActions.patchTask(itemId, { priority });
      }}
      onDueDateChange={(itemId, dueDate) => {
        const item = inboxItemsWithEmail.find((entry) => entry.id === itemId);
        if (item?.kind === "meeting") return;
        if (item?.kind === "email") {
          void patchEmailThreadFromInbox(itemId, {
            dueDate: dueDate ? dueDate.toISOString() : null,
          });
          return;
        }
        void workspaceActions.patchTask(
          itemId,
          buildTaskDueDatePatch(dueDate),
        );
      }}
      onProjectChange={(itemId, projectKey) => {
        const item = inboxItemsWithEmail.find((entry) => entry.id === itemId);
        if (item?.kind === "meeting") return;
        const project = projectKey
          ? (projects.find((entry) => entry.key === projectKey) ?? null)
          : null;
        if (item?.kind === "email") {
          void patchEmailThreadFromInbox(
            itemId,
            { projectId: project?.id ?? null },
            {
              projectName: project?.name ?? null,
              projectKey: project?.key ?? null,
            },
          );
          return;
        }
        void workspaceActions.patchTask(itemId, {
          projectId: project?.id ?? null,
          inbox: !project,
          ...(project ? {} : { status: "triage" }),
        });
      }}
      onAssigneeChange={(itemId, assigneeId) => {
        const item = inboxItemsWithEmail.find((entry) => entry.id === itemId);
        if (item?.kind === "meeting") return;
        if (item?.kind === "email") {
          const assignee = assigneeId
            ? (contacts.find((entry) => entry.id === assigneeId) ?? null)
            : null;
          void patchEmailThreadFromInbox(
            itemId,
            { assigneeId },
            { assigneeName: assignee?.name ?? null },
          );
          return;
        }
        void workspaceActions.patchTask(itemId, { assigneeId });
      }}
      groupByAttentionStatus
      isItemAgentWorking={(item) => {
        if (item.kind !== "task") return false;
        const task = allTasksById.get(item.id);
        return isTaskAgentWorkingForUi(
          { id: item.id, status: task?.status ?? item.status },
          agentStatus,
        );
      }}
      renderTitleTrailing={(item) => {
        if (item.kind !== "task") return null;
        const task = allTasksById.get(item.id);
        return renderTaskAgentTitleTrailing({
          taskId: item.id,
          agentChatId: task?.agentChatId,
          taskStatus: task?.status,
          agentStatus,
          workingShownOnStatusIcon: true,
        });
      }}
    />
  );
}

export function CalendarKeepAliveSidePanel({
  onNavigate,
}: {
  onNavigate: PanelNav;
}) {
  const frozen = useKeepAliveFrozen();
  const { pathname, searchStr } = useShellLocation();
  const search = searchStr ?? "";
  const calendarReady = useWorkspaceSurfaceReady("calendar");
  const { habits, meetings } = useDesktopWorkspaceMeta();
  const { tasks, allTasks } = useDesktopWorkspaceTasks();
  const { organizations } = useDesktopWorkspacePeople();
  const workspaceActions = useDesktopWorkspaceActions();

  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    frozen ? NO_ENTITIES : organizations,
  );

  const calendarMeetings = useMemo(
    () =>
      frozen
        ? meetings
        : meetings.map((meeting) =>
            meeting.organizationId
              ? {
                  ...meeting,
                  organizationAvatarSrc:
                    organizationAvatarSrc[meeting.organizationId] ?? null,
                }
              : meeting,
          ),
    [frozen, meetings, organizationAvatarSrc],
  );

  const calendarSidePanelTasks = useMemo(
    () => unscheduledCalendarTasks(tasks),
    [tasks],
  );

  const calendarSidePanelHabits = useMemo((): CalendarSidePanelHabitItem[] => {
    const enriched = habitsWithTodayTasks(habits, allTasks, {
      enabled: !frozen,
      fallback: [],
    });
    const items: CalendarSidePanelHabitItem[] = [];
    for (const habit of enriched) {
      if (!habit.todayTaskId || habit.todayTaskStatus == null) continue;
      items.push({
        id: habit.id,
        title: habit.title,
        icon: habit.icon ?? null,
        todayTaskId: habit.todayTaskId,
        todayTaskStatus: habit.todayTaskStatus,
        checked: habit.checked,
      });
    }
    items.sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });
    return items;
  }, [allTasks, frozen, habits]);

  const calendarViewMode = readCalendarViewModeFromSearch(search);

  return (
    <DesktopCalendarSidePanel
      pathname={pathname}
      search={search}
      meetings={calendarMeetings}
      tasks={calendarSidePanelTasks}
      habits={calendarSidePanelHabits}
      loading={!calendarReady}
      panelVariant="calendar"
      onCreateMeeting={() => {
        const { startAt, endAt } = defaultNewMeetingTimes();
        void workspaceActions
          .createMeeting({
            title: "New meeting",
            status: "triage",
            startAt,
            endAt,
          })
          .then((created) => {
            onNavigate(withCalendarMeetingSearch(created.id, search));
          });
      }}
      onMeetingOpen={(meetingId) =>
        onNavigate(withCalendarMeetingSearch(meetingId, search))
      }
      onTaskOpen={(taskId) =>
        onNavigate(
          withCalendarViewSearch(
            `/calendar/tasks/${taskId}`,
            search,
            calendarViewMode,
          ),
        )
      }
      onToggleHabit={(habit, checked) => {
        if (!habit.todayTaskId) return;
        void workspaceActions.patchTask(habit.todayTaskId, {
          status: checked ? "completed" : "canceled",
        });
      }}
    />
  );
}

export function JournalKeepAliveSidePanel({
  onNavigate,
}: {
  onNavigate: PanelNav;
}) {
  const { pathname } = useShellLocation();
  const { journalItems } = useDesktopWorkspaceDocuments();
  const todayHref = getJournalHref(getTodayJournalDateSlug());
  return (
    <DesktopJournalSidePanel
      onNavigate={onNavigate}
      pathname={panePathnameWithFirstItem(
        pathname,
        todayHref,
        Boolean(pathname.match(/^\/journal\/\d{4}-\d{2}-\d{2}/)),
      )}
      items={journalItems}
    />
  );
}

export function HabitsKeepAliveSidePanel({
  onNavigate,
}: {
  onNavigate: PanelNav;
}) {
  const { pathname } = useShellLocation();
  return (
    <DesktopHabitSidePanel onNavigate={onNavigate} pathname={pathname} />
  );
}

export function KnowledgeKeepAliveSidePanel({
  onNavigate,
}: {
  onNavigate: PanelNav;
}) {
  const { pathname } = useShellLocation();
  const knowledgeReady = useWorkspaceSurfaceReady("knowledge");
  const { knowledgeDocuments } = useDesktopWorkspaceDocuments();
  const workspaceActions = useDesktopWorkspaceActions();

  useEffect(() => {
    void workspaceActions.softRefreshApiDocuments();
  }, [workspaceActions.softRefreshApiDocuments]);

  return (
    <DesktopKnowledgeSidePanel
      onNavigate={onNavigate}
      pathname={panePathnameWithFirstItem(
        pathname,
        firstKnowledgeHref(knowledgeDocuments),
        pathname.startsWith("/knowledge/"),
      )}
      items={knowledgeDocuments}
      loading={!knowledgeReady}
      onAdd={(parentFolderId) => {
        void workspaceActions
          .createKnowledgeDocument({
            title: "Untitled",
            parentId: parentFolderId,
          })
          .then((created) => {
            onNavigate(getKnowledgeHref(created.path || created.id));
          });
      }}
      onCreateFolder={async ({ title, parentId }) => {
        try {
          await workspaceActions.createKnowledgeFolder({ title, parentId });
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not create folder.",
          };
        }
      }}
      onRename={(id, title) => workspaceActions.renameDocument(id, title)}
      onDelete={(id) => workspaceActions.deleteDocument(id)}
      onReorderTreeItem={(request) =>
        handleDocumentTreeReorder(
          request,
          knowledgeDocuments.map((item) => ({
            id: item.id,
            title: item.title,
            path: item.path ?? item.id,
            kind: item.kind === "folder" ? "folder" : "document",
            parentId: item.parentId ?? null,
            sortOrder: item.sortOrder ?? 0,
            icon: item.icon ?? null,
          })),
          workspaceActions,
        )
      }
    />
  );
}

export function ProjectKeepAliveSidePanel({
  onNavigate,
}: {
  onNavigate: PanelNav;
}) {
  const { pathname } = useShellLocation();
  const lettersReady = useWorkspaceSurfaceReady("letters");
  const { projectDocuments } = useDesktopWorkspaceDocuments();
  const { letters, projects } = useDesktopWorkspaceProjects();
  const workspaceActions = useDesktopWorkspaceActions();
  const projectRouteParam = getProjectRouteParamFromPathname(pathname);
  const projectRouteScope = getProjectRouteScopeFromPathname(pathname);
  const activeProject = projectRouteParam
    ? (projects.find(
        (project) =>
          project.id === projectRouteParam ||
          project.key.toLowerCase() === projectRouteParam.toLowerCase(),
      ) ?? null)
    : null;

  const projectDocumentsForPanel = useMemo(() => {
    if (!activeProject) return [];
    return projectDocuments.filter(
      (document) => document.projectId === activeProject.id,
    );
  }, [activeProject, projectDocuments]);

  useEffect(() => {
    if (!activeProject) return;
    if (!pathname.includes("/documents")) return;
    void workspaceActions.softRefreshApiDocuments();
  }, [
    activeProject?.id,
    pathname,
    workspaceActions.softRefreshApiDocuments,
  ]);

  const projectLettersForPanel = useMemo(() => {
    if (!activeProject) return [];
    return letters.filter(
      (letter) =>
        letter.projectId === activeProject.id ||
        (letter.projectKey &&
          letter.projectKey.toLowerCase() === activeProject.key.toLowerCase()),
    );
  }, [activeProject, letters]);

  if (!activeProject) return null;
  const projectKey = activeProject.key;

  if (isProjectLettersSectionPath(pathname)) {
    return (
      <DesktopLettersSidePanel
        onNavigate={onNavigate}
        pathname={pathname}
        items={projectLettersForPanel}
        loading={!lettersReady}
        getLetterHref={(letter) =>
          resolveLetterDetailHref({
            id: letter.id,
            number: letter.number,
            listBaseHref: getScopedProjectSectionHref(
              projectKey,
              "letters",
              projectRouteScope,
            ),
          })
        }
        onAdd={() => {
          void workspaceActions
            .createLetter({
              title: "New letter",
              projectId: activeProject.id,
            })
            .then((created) => {
              const href = resolveLetterDetailHref({
                id: created.id,
                number: created.number,
                listBaseHref: getScopedProjectSectionHref(
                  projectKey,
                  "letters",
                  projectRouteScope,
                ),
              });
              primeTabTitle(href, "New letter");
              onNavigate(href);
            });
        }}
      />
    );
  }

  return (
    <DesktopProjectDocumentsSidePanel
      onNavigate={onNavigate}
      pathname={pathname}
      items={projectDocumentsForPanel}
      getDocumentHref={(pathOrId) =>
        getScopedProjectDocumentHref(projectKey, pathOrId, projectRouteScope)
      }
      onAdd={(parentFolderId) => {
        void workspaceActions
          .createProjectDocument({
            projectId: activeProject.id,
            title: "Untitled",
            parentId: parentFolderId,
          })
          .then((created) => {
            onNavigate(
              getScopedProjectDocumentHref(
                projectKey,
                created.path || created.id,
                projectRouteScope,
              ),
            );
          });
      }}
      onCreateFolder={async ({ title, parentId }) => {
        try {
          await workspaceActions.createProjectFolder({
            projectId: activeProject.id,
            title,
            parentId,
          });
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not create folder.",
          };
        }
      }}
      onRename={(id, title) => workspaceActions.renameDocument(id, title)}
      onDelete={(id) => workspaceActions.deleteDocument(id)}
      onReorderTreeItem={(request) =>
        handleDocumentTreeReorder(
          request,
          projectDocumentsForPanel.map((item) => ({
            id: item.id,
            title: item.title,
            path: item.path ?? item.id,
            kind: item.kind === "folder" ? "folder" : "document",
            parentId: item.parentId ?? null,
            sortOrder: item.sortOrder ?? 0,
            icon: item.icon ?? null,
          })),
          workspaceActions,
        )
      }
    />
  );
}

export function ContactsKeepAliveSidePanel({
  onNavigate,
}: {
  onNavigate: PanelNav;
}) {
  const { searchStr } = useShellLocation();
  const catalog = useCrmGroupsCatalog(true);
  const selectedGroupId = parseCrmGroupId(searchStr ?? "");

  return (
    <DesktopContactsSidePanel
      onNavigate={onNavigate}
      selectedGroupId={selectedGroupId}
      groups={catalog.groups.map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color,
      }))}
      Link={RouterLink}
      onCreateGroup={(input) => {
        void catalog.createGroup(input);
      }}
      onUpdateGroup={(groupId, input) => {
        void catalog.updateGroup(groupId, input);
      }}
      onDeleteGroup={(groupId) => {
        void catalog.deleteGroup(groupId).then(() => {
          if (selectedGroupId === groupId) {
            onNavigate(getContactsGroupHref(null));
          }
        });
      }}
    />
  );
}

export function OrganizationsKeepAliveSidePanel({
  onNavigate,
}: {
  onNavigate: PanelNav;
}) {
  const { searchStr } = useShellLocation();
  const catalog = useCrmGroupsCatalog(true);
  const selectedGroupId = parseCrmGroupId(searchStr ?? "");

  return (
    <DesktopContactsSidePanel
      onNavigate={onNavigate}
      selectedGroupId={selectedGroupId}
      groups={catalog.groups.map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color,
      }))}
      Link={RouterLink}
      getGroupHref={getOrganizationsGroupHref}
      onCreateGroup={(input) => {
        void catalog.createGroup(input);
      }}
      onUpdateGroup={(groupId, input) => {
        void catalog.updateGroup(groupId, input);
      }}
      onDeleteGroup={(groupId) => {
        void catalog.deleteGroup(groupId).then(() => {
          if (selectedGroupId === groupId) {
            onNavigate(getOrganizationsGroupHref(null));
          }
        });
      }}
    />
  );
}

export function SocialKeepAliveSidePanel({
  onNavigate,
}: {
  onNavigate: PanelNav;
}) {
  const frozen = useKeepAliveFrozen();
  const { pathname } = useShellLocation();
  const { contacts, contactDetails } = useDesktopWorkspacePeople();
  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    frozen ? NO_ENTITIES : contacts,
  );
  const items = useMemo((): SocialContactListItem[] => {
    const withAvatars = frozen
      ? contacts
      : withAvatarSrc(contacts, contactAvatarSrc);
    const rows: SocialContactListItem[] = [];
    for (const contact of withAvatars) {
      const details = contactDetails[contact.id];
      const socialAccounts = normalizeContactSocialAccounts(
        details?.socialAccounts,
      );
      if (socialAccounts.length === 0) continue;
      rows.push({ ...contact, socialAccounts });
    }
    return rows;
  }, [contactAvatarSrc, contactDetails, contacts, frozen]);

  const first =
    groupItemsByAlphaLetter(items).flatMap(([, entries]) => entries)[0] ??
    null;
  const firstHref = first
    ? getSocialHref(getUniqueListItemRouteParam(first, items))
    : null;

  return (
    <DesktopSocialSidePanel
      onNavigate={onNavigate}
      pathname={panePathnameWithFirstItem(
        pathname,
        firstHref,
        pathname.startsWith("/social/"),
      )}
      items={items}
      Link={RouterLink}
    />
  );
}

export function CommunicationKeepAliveSidePanel({
  onNavigate,
}: {
  onNavigate: PanelNav;
}) {
  const { pathname } = useShellLocation();
  const items = useCommunicationListItems();
  const firstHref = getFirstCommunicationItemHref(items);
  const { contacts } = useDesktopWorkspacePeople();
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);

  useEffect(() => {
    if (!firstHref) return;
    rememberSectionEntryHrefs({ communication: firstHref });
  }, [firstHref]);

  return (
    <DesktopCommunicationSidePanel
      onNavigate={onNavigate}
      pathname={panePathnameWithFirstItem(
        pathname,
        firstHref,
        pathname.startsWith("/communication/") || pathname.startsWith("/email/"),
      )}
      items={items}
      Link={RouterLink}
      groupByAttentionStatus
      // Display-only meta (avatars / labels). No property dropdowns — full card
      // navigates, matching the non-interactive feel of triage list selection.
      assigneeOptions={buildAssigneeDropdownOptions(
        withAvatarSrc(contacts, contactAvatarSrc),
      )}
      onComposeEmail={() =>
        onNavigate(getEmailComposeHref({ list: "communication" }))
      }
    />
  );
}

export function LettersKeepAliveSidePanel({
  onNavigate,
}: {
  onNavigate: PanelNav;
}) {
  const { pathname } = useShellLocation();
  const lettersReady = useWorkspaceSurfaceReady("letters");
  const { letters } = useDesktopWorkspaceProjects();
  const workspaceActions = useDesktopWorkspaceActions();

  return (
    <DesktopLettersSidePanel
      onNavigate={onNavigate}
      pathname={panePathnameWithFirstItem(
        pathname,
        firstLetterHref(letters),
        pathname.startsWith("/letters/"),
      )}
      items={letters}
      loading={!lettersReady}
      onAdd={() => {
        void workspaceActions
          .createLetter({ title: "New letter" })
          .then((created) => {
            const href = resolveLetterDetailHref({
              id: created.id,
              number: created.number,
              listBaseHref: "/letters",
            });
            primeTabTitle(href, "New letter");
            onNavigate(href);
          });
      }}
    />
  );
}
