import { useCallback, useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";

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
import { getFirstInboxItemHref, getJournalHref, parseCrmGroupId } from "@backsteros/ui";
import {
  getKnowledgeHref,
  getLettersHref,
  getOrganizationsHref,
  getProjectRouteParamFromPathname,
  getProjectRouteScopeFromPathname,
  getScopedProjectDocumentHref,
  getScopedProjectLetterHref,
  getTodayJournalDateSlug,
  isProjectLettersSectionPath,
} from "@backsteros/ui/navigation";

import { useDesktopApi } from "../lib/api-context";
import { useAgentMail } from "../lib/agentmail-context";
import { panePathnameWithFirstItem } from "../lib/keep-alive-list-selection";
import {
  firstKnowledgeHref,
  firstLetterHref,
  firstOrganizationHref,
} from "../lib/section-entry-hrefs";
import { buildMailboxByIdMap } from "../lib/email-list-tasks";
import { agentMailMessagesSignature } from "../lib/agentmail-list-cache";
import { dispatchEmailListPatch } from "../lib/use-agentmail-mailboxes";
import { habitsWithTodayTasks } from "../lib/habit-today-tasks";
import { renderTaskAgentTitleTrailing } from "../lib/agent/agent-list-indicators";
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
  DesktopOrganizationsSidePanel,
  DesktopProjectDocumentsSidePanel,
} from "./app-shell-side-panels-lazy";
import { DesktopInboxSidePanel } from "./app-shell-inbox-side-panel";
import { RouterLink } from "./app-shell-links";
import { handleDocumentTreeReorder } from "./document-tree-reorder";
import type { LeftSidePanelDest } from "../lib/left-side-panel-dest";

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
    () =>
      inboxItems.map((item) => {
        if (item.kind !== "meeting" || !item.organizationId) return item;
        return {
          ...item,
          organizationAvatarSrc:
            organizationAvatarSrc[item.organizationId] ?? null,
        };
      }),
    [inboxItems, organizationAvatarSrc],
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
          organizationAvatarSrc: item.organizationId
            ? organizationAvatarSrc[item.organizationId] ?? null
            : null,
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
    organizationAvatarSrc,
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
      renderTitleTrailing={(item) => {
        if (item.kind !== "task") return null;
        const task = allTasksById.get(item.id);
        return renderTaskAgentTitleTrailing({
          taskId: item.id,
          agentChatId: task?.agentChatId,
          taskStatus: task?.status,
          agentStatus,
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
        void workspaceActions.patchTask(habit.todayTaskId, {
          status: checked ? "completed" : "ready_to_start",
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
          getScopedProjectLetterHref(projectKey, letter.number, projectRouteScope)
        }
        onAdd={() => {
          void workspaceActions
            .createLetter({
              title: "New letter",
              projectId: activeProject.id,
            })
            .then((created) => {
              if (created.number == null) return;
              const href = getScopedProjectLetterHref(
                projectKey,
                created.number,
                projectRouteScope,
              );
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
    />
  );
}

export function OrganizationsKeepAliveSidePanel({
  onNavigate,
}: {
  onNavigate: PanelNav;
}) {
  const frozen = useKeepAliveFrozen();
  const { pathname } = useShellLocation();
  const { organizations } = useDesktopWorkspacePeople();
  const workspaceActions = useDesktopWorkspaceActions();
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    frozen ? NO_ENTITIES : organizations,
  );
  const items = useMemo(
    () =>
      frozen
        ? organizations
        : withAvatarSrc(organizations, organizationAvatarSrc),
    [frozen, organizationAvatarSrc, organizations],
  );
  const firstHref = firstOrganizationHref(organizations);

  return (
    <DesktopOrganizationsSidePanel
      onNavigate={onNavigate}
      pathname={panePathnameWithFirstItem(
        pathname,
        firstHref,
        pathname.startsWith("/organizations/"),
      )}
      items={items}
      Link={RouterLink}
      onAdd={() => {
        void workspaceActions
          .createOrganization({ name: "New organization" })
          .then((created) => {
            onNavigate(getOrganizationsHref(created.id));
          });
      }}
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
            if (created.number == null) return;
            const href = getLettersHref(created.number);
            primeTabTitle(href, "New letter");
            onNavigate(href);
          });
      }}
    />
  );
}
