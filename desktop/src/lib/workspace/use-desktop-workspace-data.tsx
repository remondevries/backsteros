import { createContext, useContext, useMemo, type ReactNode } from "react";
import type {
  Area as ApiArea,
  Contact as ApiContact,
  Document as ApiDocument,
  Letter as ApiLetter,
  Organization as ApiOrganization,
  Project as ApiProject,
  Habit as ApiHabit,
  Meeting as ApiMeeting,
  Task as ApiTask,
} from "@backsteros/contracts";
import {
  buildInboxTaskListItem,
  sortInboxItemsByAttentionStatus,
  taskBelongsInInbox,
  type InboxListItem,
  type JournalListItem,
  type TaskItemRowTask,
} from "@backsteros/ui";

import { useDesktopApi } from "../api-context";
import {
  fillMissingAgentChatIdFromApi,
  fillMissingDueDatesFromApi,
  fillMissingHabitIdFromApi,
  dropStaleLocalHabitTasks,
  fillMissingCodebaseFieldsFromApi,
  fillMissingLinksFromApi,
  fillMissingMeetingPropertiesFromApi,
  fillMissingMoneybirdContactIdFromApi,
  fillMissingParentFromApi,
  fillMissingTypeFromApi,
  mergeLocalAndApiByUpdatedAt,
} from "../merge-local-and-api";
import { useDesktopPowerSync, usePowerSyncQuery } from "../powersync-context";
import { getDesktopPublicEnvironment } from "../env";
import { rememberProjectTypes } from "../project-type-cache";
import { noteLocalTaskStatusPatch } from "../agent/agent-status-notifications";
import { nudgeDynamicIslandTasksRefresh } from "../dynamic-island-nudge";
import {
  asEpoch,
  mapContact,
  mapDocument,
  mapLetter,
  mapMeeting,
  mapOrganization,
  mapProject,
  mapTask,
  parseTaskLinks,
  snakeRow,
} from "./row-mappers";
import type { DesktopWorkspaceData } from "./workspace-data-types";
import { useWorkspaceApiRows } from "./use-workspace-api-rows";
import { useWorkspaceEntityPatching } from "./use-entity-patching";
import { useWorkspaceEntityCreation } from "./use-entity-creation";
import { useWorkspaceHabitActions } from "./use-habit-actions";
import { useWorkspaceTaskActions } from "./use-task-actions";
import { useWorkspaceLetterMeetingActions } from "./use-letter-meeting-actions";
import { useWorkspaceDocumentActions } from "./use-document-actions";

const DesktopWorkspaceDataContext = createContext<DesktopWorkspaceData | null>(
  null,
);

/**
 * Prefer PowerSync rows when ready. Soft-revalidate from the API after sync
 * checkpoints so newer remote columns can merge in.
 *
 * Prefer {@link DesktopWorkspaceDataProvider} + {@link useDesktopWorkspaceData}
 * so navigations share one hydrated snapshot (avoids not-found flashes).
 */
function useDesktopWorkspaceDataImpl(): DesktopWorkspaceData {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const clerkKey = getDesktopPublicEnvironment().clerkPublishableKey;
  const authenticated =
    Boolean(clerkKey) && powerSync.status !== "unauthenticated";

  const localTasks = usePowerSyncQuery<Record<string, unknown>>(
    authenticated
      ? "SELECT * FROM tasks WHERE deleted_at IS NULL AND (inbox = 0 OR inbox IS NULL) ORDER BY sort_order, updated_at DESC"
      : null,
  );
  const localInboxTasks = usePowerSyncQuery<Record<string, unknown>>(
    authenticated
      ? `SELECT * FROM tasks WHERE deleted_at IS NULL AND (
           inbox = 1
           OR (
             status IN ('on_hold', 'in_review')
             AND (
               due_date IS NULL
               OR date(due_date) <= date('now', 'localtime')
             )
           )
           OR (
             due_date IS NOT NULL
             AND date(due_date) < date('now', 'localtime')
             AND status NOT IN ('completed', 'canceled', 'duplicated')
           )
         ) ORDER BY sort_order, updated_at DESC`
      : null,
  );
  const localProjects = usePowerSyncQuery<Record<string, unknown>>(
    authenticated
      ? "SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC"
      : null,
  );
  const localLetters = usePowerSyncQuery<Record<string, unknown>>(
    authenticated
      ? "SELECT * FROM letters WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC"
      : null,
  );
  const localContacts = usePowerSyncQuery<Record<string, unknown>>(
    authenticated
      ? "SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC"
      : null,
  );
  const localOrganizations = usePowerSyncQuery<Record<string, unknown>>(
    authenticated
      ? "SELECT * FROM organizations WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC"
      : null,
  );
  const localAreas = usePowerSyncQuery<Record<string, unknown>>(
    authenticated
      ? "SELECT * FROM areas WHERE deleted_at IS NULL ORDER BY sort_order, name"
      : null,
  );
  const localDocuments = usePowerSyncQuery<Record<string, unknown>>(
    authenticated
      ? "SELECT * FROM documents WHERE deleted_at IS NULL ORDER BY sort_order, path, updated_at DESC"
      : null,
  );
  const localHabits = usePowerSyncQuery<Record<string, unknown>>(
    authenticated
      ? "SELECT * FROM habits WHERE deleted_at IS NULL ORDER BY sort_order, created_at"
      : null,
  );
  const localMeetings = usePowerSyncQuery<Record<string, unknown>>(
    authenticated
      ? "SELECT * FROM meetings WHERE deleted_at IS NULL ORDER BY start_at, number"
      : null,
  );

  const {
    apiTasks,
    setApiTasks,
    apiInboxTasks,
    setApiInboxTasks,
    apiProjects,
    setApiProjects,
    apiLetters,
    setApiLetters,
    apiContacts,
    setApiContacts,
    apiOrganizations,
    setApiOrganizations,
    apiAreas,
    setApiAreas,
    apiDocuments,
    setApiDocuments,
    apiHabits,
    setApiHabits,
    apiMeetings,
    setApiMeetings,
    restHydrateSettled,
    queriesGracePeriodExpired,
  } = useWorkspaceApiRows({ authenticated, client, powerSync });

  const projectsById = useMemo(() => {
    const map = new Map<string, ApiProject>();
    const rows = fillMissingCodebaseFieldsFromApi(
      fillMissingTypeFromApi(
        mergeLocalAndApiByUpdatedAt(
          localProjects.data?.map((row) => snakeRow(row) as ApiProject),
          apiProjects,
        ),
        apiProjects,
      ),
      apiProjects,
    );
    for (const project of rows) map.set(project.id, project);
    return map;
  }, [apiProjects, localProjects.data]);

  const organizationsById = useMemo(() => {
    const map = new Map<string, ApiOrganization>();
    const rows = fillMissingMoneybirdContactIdFromApi(
      mergeLocalAndApiByUpdatedAt(
        localOrganizations.data?.map(
          (row) => snakeRow(row) as ApiOrganization,
        ),
        apiOrganizations,
      ),
      apiOrganizations,
    );
    for (const organization of rows) map.set(organization.id, organization);
    return map;
  }, [apiOrganizations, localOrganizations.data]);

  const rawProjects = fillMissingCodebaseFieldsFromApi(
    fillMissingTypeFromApi(
      mergeLocalAndApiByUpdatedAt(
        localProjects.data?.map((row) => snakeRow(row) as ApiProject),
        apiProjects,
      ),
      apiProjects,
    ),
    apiProjects,
  );
  const rawTasks = dropStaleLocalHabitTasks(
    fillMissingDueDatesFromApi(
      fillMissingHabitIdFromApi(
        fillMissingAgentChatIdFromApi(
          fillMissingLinksFromApi(
            mergeLocalAndApiByUpdatedAt(
              localTasks.data?.map((row) => snakeRow(row) as ApiTask),
              apiTasks,
            ),
            apiTasks,
          ),
          apiTasks,
        ),
        apiTasks,
      ),
      apiTasks,
    ),
    apiTasks,
  );
  const rawInboxTasks = dropStaleLocalHabitTasks(
    fillMissingDueDatesFromApi(
      fillMissingHabitIdFromApi(
        fillMissingAgentChatIdFromApi(
          fillMissingLinksFromApi(
            mergeLocalAndApiByUpdatedAt(
              localInboxTasks.data?.map((row) => snakeRow(row) as ApiTask),
              apiInboxTasks,
            ),
            apiInboxTasks,
          ),
          apiInboxTasks,
        ),
        apiInboxTasks,
      ),
      apiInboxTasks,
    ),
    apiInboxTasks,
  );
  // Merge like contacts/projects — an empty PowerSync snapshot must not hide
  // REST letters (create then navigate used to vanish from the side list).
  const rawLetters = mergeLocalAndApiByUpdatedAt(
    localLetters.data?.map((row) => snakeRow(row) as ApiLetter),
    apiLetters,
  );
  const rawMeetings = fillMissingMeetingPropertiesFromApi(
    mergeLocalAndApiByUpdatedAt(
      localMeetings.data?.map((row) => snakeRow(row) as ApiMeeting),
      apiMeetings,
    ),
    apiMeetings,
  );
  const rawContacts = mergeLocalAndApiByUpdatedAt(
    localContacts.data?.map((row) => snakeRow(row) as ApiContact),
    apiContacts,
  );
  const rawOrganizations = fillMissingMoneybirdContactIdFromApi(
    mergeLocalAndApiByUpdatedAt(
      localOrganizations.data?.map(
        (row) => snakeRow(row) as ApiOrganization,
      ),
      apiOrganizations,
    ),
    apiOrganizations,
  );
  const rawAreas = fillMissingParentFromApi(
    mergeLocalAndApiByUpdatedAt(
      localAreas.data?.map((row) => snakeRow(row) as ApiArea),
      apiAreas,
    ),
    apiAreas,
  );
  const rawDocuments = mergeLocalAndApiByUpdatedAt(
    localDocuments.data?.map((row) => snakeRow(row) as ApiDocument),
    apiDocuments,
  );

  const source: DesktopWorkspaceData["source"] = localTasks.data
    ? "powersync"
    : "empty";

  const documents = rawDocuments.map(mapDocument);
  const knowledgeDocuments = rawDocuments
    .filter((document) => document.type === "knowledge")
    .map(mapDocument);
  const projectDocuments = rawDocuments
    .filter((document) => document.type === "project")
    .map(mapDocument);
  const journalItems: JournalListItem[] = rawDocuments
    .filter(
      (document) =>
        document.type === "journal" && Boolean(document.journalDate),
    )
    .map((document) => ({ dateSlug: document.journalDate as string }))
    .sort((a, b) => b.dateSlug.localeCompare(a.dateSlug));

  const inboxTaskItems: InboxListItem[] = (() => {
    const byId = new Map<string, ApiTask>();
    for (const task of [...rawTasks, ...rawInboxTasks]) {
      if (
        !taskBelongsInInbox({
          inbox: task.inbox,
          status: task.status,
          dueDate: task.dueDate,
          agentCreatedAt: task.agentCreatedAt,
          agentInboxApprovedAt: task.agentInboxApprovedAt,
        })
      ) {
        continue;
      }
      byId.set(task.id, task);
    }
    return [...byId.values()].map((task) => {
      const project = task.projectId
        ? projectsById.get(task.projectId) ?? null
        : null;
      return buildInboxTaskListItem({
        id: task.id,
        title: task.title,
        number: task.number ?? 0,
        status: task.status,
        priority: task.priority,
        dueDate: asEpoch(task.dueDate),
        updatedAt: asEpoch(task.updatedAt) ?? Date.now(),
        description: task.description,
        projectId: task.projectId,
        projectKey: project?.key ?? null,
        projectName: project?.name ?? null,
        projectIcon: project?.icon ?? null,
        assigneeId: task.assigneeId ?? null,
        inbox: task.inbox ?? null,
        agentCreatedAt: task.agentCreatedAt,
        agentInboxApprovedAt: task.agentInboxApprovedAt,
      });
    });
  })();

  // Inbox is tasks-only (parity with Next). Letters live under /letters.
  // Order matches the attention-grouped side panel (agents → overdue → triage → …).
  const inboxItems = sortInboxItemsByAttentionStatus(inboxTaskItems);

  const {
    toSnakeFields,
    seedDocumentLocal,
    patchViaPowerSyncOrApi,
    softDeleteViaPowerSyncOrApi,
    softRefreshApiTasks,
  } = useWorkspaceEntityPatching({
    authenticated,
    client,
    powerSync,
    setApiTasks,
    setApiInboxTasks,
    setApiProjects,
    setApiLetters,
    setApiContacts,
    setApiOrganizations,
    setApiMeetings,
    setApiDocuments,
  });

  const {
    createOrganization,
    createContact,
    createProject,
    createArea,
    softDeleteArea,
  } = useWorkspaceEntityCreation({
    authenticated,
    client,
    powerSync,
    toSnakeFields,
    patchViaPowerSyncOrApi,
    rawProjects,
    setApiOrganizations,
    setApiContacts,
    setApiProjects,
    setApiAreas,
  });

  const { reloadHabits, createHabit, updateHabit, recordHabitDay } =
    useWorkspaceHabitActions({
      authenticated,
      client,
      powerSync,
      toSnakeFields,
      softRefreshApiTasks,
      setApiHabits,
      setApiTasks,
    });

  const { createInboxTask, createProjectTask, duplicateTask, duplicateProject } =
    useWorkspaceTaskActions({
      authenticated,
      client,
      powerSync,
      toSnakeFields,
      rawTasks,
      rawInboxTasks,
      rawProjects,
      setApiTasks,
      setApiInboxTasks,
      setApiProjects,
    });

  const { createLetter, createMeeting } = useWorkspaceLetterMeetingActions({
    authenticated,
    client,
    powerSync,
    toSnakeFields,
    setApiLetters,
    setApiMeetings,
  });

  const {
    createKnowledgeDocument,
    createProjectDocument,
    createKnowledgeFolder,
    createProjectFolder,
    renameDocument,
    updateDocumentIcon,
    moveDocument,
    reorderDocuments,
    deleteDocument,
  } = useWorkspaceDocumentActions({
    authenticated,
    client,
    powerSync,
    seedDocumentLocal,
    patchViaPowerSyncOrApi,
    softDeleteViaPowerSyncOrApi,
  });

  const mappedTasks = rawTasks.map((task) => mapTask(task, projectsById));
  const mappedInboxTasks = rawInboxTasks.map((task) =>
    mapTask(task, projectsById),
  );
  // REST `/api/v1/tasks` may already include inbox rows; dedupe by id.
  const allTasksById = new Map<string, TaskItemRowTask>();
  for (const task of mappedTasks) allTasksById.set(task.id, task);
  for (const task of mappedInboxTasks) {
    if (!allTasksById.has(task.id)) allTasksById.set(task.id, task);
  }
  const allTasks = [...allTasksById.values()];

  rememberProjectTypes(
    rawProjects.map((project) => ({
      id: project.id,
      key: project.key,
      type: project.type,
    })),
  );

  // PowerSync `ready` only means the DB handle is up. Until the first watch
  // emission, merged lists can still be empty — prefer skeletons over "not found".
  const queriesHydrating =
    authenticated &&
    powerSync.ready &&
    !queriesGracePeriodExpired &&
    (localTasks.loading ||
      localInboxTasks.loading ||
      localProjects.loading ||
      localLetters.loading ||
      localMeetings.loading ||
      localContacts.loading ||
      localOrganizations.loading ||
      localAreas.loading ||
      localDocuments.loading);

  // Packaged WKWebView data-store resets (and slow/failed PowerSync connects)
  // must not leave Projects/Tasks on an endless skeleton when REST already
  // returned rows.
  const apiHydrated =
    apiProjects !== null ||
    apiTasks !== null ||
    apiInboxTasks !== null ||
    apiOrganizations !== null ||
    apiAreas !== null ||
    apiContacts !== null ||
    apiDocuments !== null ||
    apiLetters !== null ||
    apiMeetings !== null;

  return {
    source,
    ready:
      !authenticated ||
      apiHydrated ||
      restHydrateSettled ||
      (powerSync.ready && !queriesHydrating) ||
      powerSync.status === "error",
    tasks: mappedTasks,
    inboxTasks: mappedInboxTasks,
    allTasks,
    projects: rawProjects.map(mapProject),
    letters: rawLetters
      .filter((letter) => letter.number != null)
      .map((letter) => mapLetter(letter, projectsById)),
    meetings: rawMeetings.map((meeting) => mapMeeting(meeting, projectsById)),
    documents,
    knowledgeDocuments,
    projectDocuments,
    journalItems,
    habits: mergeLocalAndApiByUpdatedAt(
      localHabits.data?.map((row) => {
        const local = snakeRow(row) as ApiHabit;
        const createdYmd =
          typeof local.createdAt === "string" && local.createdAt.length >= 10
            ? local.createdAt.slice(0, 10)
            : undefined;
        return {
          ...local,
          description:
            typeof local.description === "string" ? local.description : null,
          projectId:
            typeof local.projectId === "string" && local.projectId.trim()
              ? local.projectId
              : "",
          cadence:
            local.cadence === "every_2_days" ||
            local.cadence === "weekly" ||
            local.cadence === "monthly"
              ? local.cadence
              : "daily",
          cadenceAnchorYmd:
            typeof local.cadenceAnchorYmd === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(local.cadenceAnchorYmd)
              ? local.cadenceAnchorYmd
              : (createdYmd ?? local.cadenceAnchorYmd),
          todayTaskId: local.todayTaskId ?? null,
          todayTaskStatus: local.todayTaskStatus ?? null,
        };
      }),
      apiHabits,
    ),
    inboxItems,
    contacts: rawContacts.map((contact) =>
      mapContact(contact, organizationsById),
    ),
    organizations: rawOrganizations.map(mapOrganization),
    areas: rawAreas,
    projectSummaries: Object.fromEntries(
      rawProjects
        .filter((project) => project.summary)
        .map((project) => [project.id, project.summary as string]),
    ),
    projectDescriptions: Object.fromEntries(
      rawProjects
        .filter((project) => project.description)
        .map((project) => [project.id, project.description as string]),
    ),
    taskDescriptions: Object.fromEntries(
      [...rawTasks, ...rawInboxTasks]
        .filter((task) => task.description)
        .map((task) => [task.id, task.description as string]),
    ),
    taskLinks: Object.fromEntries(
      [...rawTasks, ...rawInboxTasks].map((task) => [
        task.id,
        parseTaskLinks(task.links),
      ]),
    ),
    letterBodies: Object.fromEntries(
      rawLetters
        .filter((letter) => letter.context)
        .map((letter) => [letter.id, letter.context as string]),
    ),
    journalDocumentIdsByDate: Object.fromEntries(
      rawDocuments
        .filter(
          (document) =>
            document.type === "journal" && Boolean(document.journalDate),
        )
        .map((document) => [document.journalDate as string, document.id]),
    ),
    contactDetails: Object.fromEntries(
      rawContacts.map((contact) => [contact.id, contact]),
    ),
    organizationDetails: Object.fromEntries(
      rawOrganizations.map((org) => [org.id, org]),
    ),
    letterRecords: Object.fromEntries(
      rawLetters.map((letter) => [letter.id, letter]),
    ),
    patchTask: async (id, values) => {
      if (typeof values.status === "string") {
        noteLocalTaskStatusPatch(id);
      }
      const result = await patchViaPowerSyncOrApi("tasks", id, values);
      nudgeDynamicIslandTasksRefresh();
      window.setTimeout(() => nudgeDynamicIslandTasksRefresh(), 600);
      return result;
    },
    patchProject: async (id, values) => {
      await patchViaPowerSyncOrApi("projects", id, values);
    },
    patchLetter: async (id, values) => {
      await patchViaPowerSyncOrApi("letters", id, values);
    },
    patchMeeting: async (id, values) => {
      await patchViaPowerSyncOrApi("meetings", id, values);
    },
    patchContact: async (id, values) => {
      await patchViaPowerSyncOrApi("contacts", id, values);
    },
    patchOrganization: async (id, values) => {
      await patchViaPowerSyncOrApi("organizations", id, values);
    },
    softDeleteTask: (id) => softDeleteViaPowerSyncOrApi("tasks", id),
    softDeleteProject: (id) => softDeleteViaPowerSyncOrApi("projects", id),
    softDeleteLetter: (id) => softDeleteViaPowerSyncOrApi("letters", id),
    softDeleteMeeting: (id) => softDeleteViaPowerSyncOrApi("meetings", id),
    softDeleteContact: (id) => softDeleteViaPowerSyncOrApi("contacts", id),
    softDeleteOrganization: (id) =>
      softDeleteViaPowerSyncOrApi("organizations", id),
    softDeleteDocument: (id) => softDeleteViaPowerSyncOrApi("documents", id),
    createOrganization,
    createContact,
    createProject,
    createArea,
    softDeleteArea,
    reloadHabits,
    createHabit,
    updateHabit,
    recordHabitDay,
    createInboxTask,
    createProjectTask,
    duplicateTask,
    duplicateProject,
    createLetter,
    createMeeting,
    createKnowledgeDocument,
    createProjectDocument,
    createKnowledgeFolder,
    createProjectFolder,
    renameDocument,
    updateDocumentIcon,
    moveDocument,
    reorderDocuments,
    deleteDocument,
  };
}

/** Single shared workspace snapshot for the signed-in desktop shell. */
export function DesktopWorkspaceDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useDesktopWorkspaceDataImpl();
  return (
    <DesktopWorkspaceDataContext.Provider value={value}>
      {children}
    </DesktopWorkspaceDataContext.Provider>
  );
}

/**
 * Reads the shared workspace snapshot. Must be used under
 * {@link DesktopWorkspaceDataProvider}.
 */
export function useDesktopWorkspaceData(): DesktopWorkspaceData {
  const value = useContext(DesktopWorkspaceDataContext);
  if (!value) {
    throw new Error(
      "useDesktopWorkspaceData must be used within DesktopWorkspaceDataProvider",
    );
  }
  return value;
}
