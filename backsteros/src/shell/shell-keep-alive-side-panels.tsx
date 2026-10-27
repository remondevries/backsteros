import { useCallback, useEffect, useMemo, useRef, type Dispatch, type ReactNode, type SetStateAction } from "react";

import { primeTabTitle } from "@backsteros/ui/shell";
import {
  defaultNewMeetingTimes,
  withCalendarMeetingSearch,
  readCalendarViewModeFromSearch,
  unscheduledCalendarTasks,
  withCalendarViewSearch,
  type CalendarSidePanelHabitItem,
} from "@backsteros/ui/calendar";
import {
  filterDocumentsForHelpArticleScope,
  filterDocumentsForSpaceRoot,
  findHelpArticleIndividualRoot,
  getContactsGroupHref,
  getJournalHref,
  getOrganizationsGroupHref,
  getSelectedSpaceRootFromPathname,
  getSocialHref,
  getUniqueListItemRouteParam,
  groupItemsByAlphaLetter,
  HELP_ARTICLE_AUDIENCE_INDIVIDUAL,
  HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG,
  helpArticleIndividualRootPath,
  isSupportCenterDocumentPath,
  normalizeContactSocialAccounts,
  parseCrmGroupId,
  resolveLetterDetailHref,
  useHelpArticleAudienceMap,
  useHelpArticleListScope,
  useWriteHelpArticleAudience,
  type SocialContactListItem,
} from "@backsteros/ui";
import {
  getKnowledgeHref,
  getTodayJournalDateSlug,
} from "@backsteros/ui/navigation";

import { panePathnameWithFirstItem } from "../lib/keep-alive-list-selection";
import { firstLetterHref } from "../lib/section-entry-hrefs";
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
import {
  useKeepAliveFrozen,
  useShellLocation,
} from "../lib/shell-route-keep-alive";
import type { PendingPageSurface as Surface } from "../lib/pending-navigation-routes";
import { useCrmGroupsCatalog } from "../lib/use-crm-data";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceDocuments,
  useDesktopWorkspaceMeta,
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
  DesktopSocialSidePanel,
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
  _pathname = "",
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
    case "projects":
      // Documents / letters lists are embedded in project content.
      return null;
    case "contacts":
      return <ContactsKeepAliveSidePanel onNavigate={onNavigate} />;
    case "organizations":
      return <OrganizationsKeepAliveSidePanel onNavigate={onNavigate} />;
    case "social":
      return <SocialKeepAliveSidePanel onNavigate={onNavigate} />;
    case "communication":
      // Unified chat list is embedded in the page — no shell side panel.
      return null;
    case "letters":
      return <LettersKeepAliveSidePanel onNavigate={onNavigate} />;
    case "tasks-list":
      return null;
    default:
      return null;
  }
}

export function InboxKeepAliveSidePanel({ onNavigate }: { onNavigate: PanelNav }) {
  const { allTasks } = useDesktopWorkspaceTasks();
  const agentStatus = useDesktopAgentStatusOptional();
  const allTasksById = useMemo(() => {
    const map = new Map<string, (typeof allTasks)[number]>();
    for (const task of allTasks) map.set(task.id, task);
    return map;
  }, [allTasks]);

  return (
    <DesktopInboxSidePanel
      onNavigate={onNavigate}
      isItemAgentWorking={(item) => {
        if (item.kind !== "task") return false;
        const task = allTasksById.get(item.id);
        return isTaskAgentWorkingForUi(
          {
            id: item.id,
            status: task?.status ?? item.status,
            agentWorkingContactId: task?.agentWorkingContactId,
            agentCreatedAt:
              task?.agentCreatedAt ?? item.agentCreatedAt ?? null,
            agentInboxApprovedAt:
              task?.agentInboxApprovedAt ?? item.agentInboxApprovedAt ?? null,
          },
          agentStatus,
        );
      }}
      renderTitleTrailing={(item) => {
        if (item.kind !== "task") return null;
        const task = allTasksById.get(item.id);
        return renderTaskAgentTitleTrailing({
          taskId: item.id,
          agentChatId: task?.agentChatId,
          agentWorkingContactId: task?.agentWorkingContactId,
          agentWorkingContactName: task?.agentWorkingContactName,
          agentWorkingKind: task?.agentWorkingKind,
          taskStatus: task?.status,
          agentStatus,
          workingShownOnStatusIcon: true,
          agentCreatedAt:
            task?.agentCreatedAt ?? item.agentCreatedAt ?? null,
          agentInboxApprovedAt:
            task?.agentInboxApprovedAt ?? item.agentInboxApprovedAt ?? null,
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
  const workspaceActions = useDesktopWorkspaceActions();

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
      tasks={calendarSidePanelTasks}
      meetings={meetings}
      habits={calendarSidePanelHabits}
      loading={!calendarReady}
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
  const [listScope, setListScope] = useHelpArticleListScope();
  const audienceById = useHelpArticleAudienceMap();
  const writeArticleAudience = useWriteHelpArticleAudience();
  const ensuringIndividualRootRef = useRef(false);

  const spaceRoot = useMemo(
    () => getSelectedSpaceRootFromPathname(pathname, knowledgeDocuments),
    [knowledgeDocuments, pathname],
  );

  const isSupportSpace = isSupportCenterDocumentPath(spaceRoot?.path);

  // Ensure Support center has the reserved Individual folder (hidden from Group).
  useEffect(() => {
    if (!isSupportSpace || !spaceRoot) return;
    if (findHelpArticleIndividualRoot(knowledgeDocuments)) {
      ensuringIndividualRootRef.current = false;
      return;
    }
    if (ensuringIndividualRootRef.current) return;
    ensuringIndividualRootRef.current = true;
    const parentPath = spaceRoot.path ?? "support";
    void workspaceActions
      .createKnowledgeFolder({
        title: HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG,
        parentId: spaceRoot.id,
        parentPath,
        path: helpArticleIndividualRootPath(parentPath),
      })
      .catch(() => {
        // Retry on next render if create failed (offline / race).
        ensuringIndividualRootRef.current = false;
      });
  }, [isSupportSpace, knowledgeDocuments, spaceRoot, workspaceActions]);

  const scopedDocuments = useMemo(() => {
    if (!spaceRoot) return [];
    return filterDocumentsForSpaceRoot(knowledgeDocuments, spaceRoot.id);
  }, [knowledgeDocuments, spaceRoot]);

  const individualRoot = useMemo(
    () =>
      isSupportSpace ? findHelpArticleIndividualRoot(scopedDocuments) : null,
    [isSupportSpace, scopedDocuments],
  );

  const panelDocuments = useMemo(() => {
    if (!isSupportSpace) return scopedDocuments;
    return filterDocumentsForHelpArticleScope(
      scopedDocuments,
      listScope,
      audienceById,
    );
  }, [audienceById, isSupportSpace, listScope, scopedDocuments]);

  const firstInSpaceHref = useMemo(() => {
    const first = panelDocuments.find((doc) => doc.kind !== "folder");
    if (first) return getKnowledgeHref(first.path ?? first.id);
    if (spaceRoot) return getKnowledgeHref(spaceRoot.path ?? spaceRoot.id);
    return null;
  }, [panelDocuments, spaceRoot]);

  const resolveCreateParent = useCallback(
    (parentFolderId: string | null | undefined) => {
      const wantsIndividual =
        isSupportSpace && listScope === HELP_ARTICLE_AUDIENCE_INDIVIDUAL;
      const requestedId = parentFolderId ?? null;
      // Individual list: root creates land under `_individual`.
      if (wantsIndividual && (requestedId == null || requestedId === spaceRoot?.id)) {
        if (individualRoot) {
          return {
            parentId: individualRoot.id,
            parentPath: individualRoot.path ?? null,
          };
        }
      }
      const parentId = requestedId ?? spaceRoot?.id ?? null;
      const parent =
        parentId == null
          ? null
          : (knowledgeDocuments.find((doc) => doc.id === parentId) ??
            (parentId === spaceRoot?.id ? spaceRoot : null));
      return {
        parentId,
        parentPath: parent?.path ?? spaceRoot?.path ?? null,
      };
    },
    [
      individualRoot,
      isSupportSpace,
      knowledgeDocuments,
      listScope,
      spaceRoot,
    ],
  );

  return (
    <DesktopKnowledgeSidePanel
      onNavigate={onNavigate}
      pathname={panePathnameWithFirstItem(
        pathname,
        firstInSpaceHref,
        pathname.startsWith("/spaces/"),
      )}
      items={panelDocuments}
      loading={!knowledgeReady}
      title={spaceRoot?.title ?? "Spaces"}
      listScope={isSupportSpace ? listScope : null}
      onListScopeChange={isSupportSpace ? setListScope : undefined}
      onAdd={(parentFolderId) => {
        const { parentId, parentPath } = resolveCreateParent(parentFolderId);
        void workspaceActions
          .createKnowledgeDocument({
            title: "Untitled",
            parentId,
            folderPath: parentPath ?? spaceRoot?.path ?? undefined,
          })
          .then((created) => {
            if (isSupportSpace) {
              writeArticleAudience(created.id, listScope);
            }
            onNavigate(getKnowledgeHref(created.path || created.id));
          });
      }}
      onCreateFolder={async ({ title, parentId }) => {
        try {
          const resolved = resolveCreateParent(parentId);
          await workspaceActions.createKnowledgeFolder({
            title,
            parentId: resolved.parentId,
            parentPath: resolved.parentPath,
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
          scopedDocuments.map((item) => ({
            id: item.id,
            title: item.title,
            path: item.path ?? item.id,
            kind: item.kind === "folder" ? "folder" : "document",
            // Restore real parent for root-level items when reordering.
            parentId:
              item.parentId ?? spaceRoot?.id ?? null,
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
  const frozen = useKeepAliveFrozen();
  const { searchStr } = useShellLocation();
  const catalog = useCrmGroupsCatalog(!frozen);
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
  const frozen = useKeepAliveFrozen();
  const { searchStr } = useShellLocation();
  const catalog = useCrmGroupsCatalog(!frozen);
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
