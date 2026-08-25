import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
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
  TaskLink,
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
  fillMissingLongTextFromApi,
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
import {
  AREAS_LIST_SQL,
  CONTACTS_LIST_SQL,
  DOCUMENTS_LIST_SQL,
  HABITS_LIST_SQL,
  INBOX_TASKS_LIST_SQL,
  LETTERS_LIST_SQL,
  MEETINGS_LIST_SQL,
  ORGANIZATIONS_LIST_SQL,
  PROJECTS_LIST_SQL,
  TASKS_LIST_SQL,
} from "./workspace-sql";

/** Meta + readiness — changes infrequently relative to entity rows. */
export type DesktopWorkspaceMeta = Pick<
  DesktopWorkspaceData,
  "source" | "ready" | "habits" | "meetings" | "inboxItems" | "areas"
>;

export type DesktopWorkspaceTasks = Pick<
  DesktopWorkspaceData,
  | "tasks"
  | "inboxTasks"
  | "allTasks"
  | "taskDescriptions"
  | "taskLinks"
  | "taskDetails"
>;

export type DesktopWorkspaceProjects = Pick<
  DesktopWorkspaceData,
  | "projects"
  | "letters"
  | "projectSummaries"
  | "projectDescriptions"
  | "letterBodies"
  | "letterRecords"
  | "projectDetails"
>;

export type DesktopWorkspacePeople = Pick<
  DesktopWorkspaceData,
  "contacts" | "organizations" | "contactDetails" | "organizationDetails"
>;

export type DesktopWorkspaceDocuments = Pick<
  DesktopWorkspaceData,
  | "documents"
  | "knowledgeDocuments"
  | "projectDocuments"
  | "journalItems"
  | "journalDocumentIdsByDate"
>;

export type DesktopWorkspaceActions = Omit<
  DesktopWorkspaceData,
  | keyof DesktopWorkspaceMeta
  | keyof DesktopWorkspaceTasks
  | keyof DesktopWorkspaceProjects
  | keyof DesktopWorkspacePeople
  | keyof DesktopWorkspaceDocuments
>;

const DesktopWorkspaceMetaContext = createContext<DesktopWorkspaceMeta | null>(
  null,
);
const DesktopWorkspaceTasksContext =
  createContext<DesktopWorkspaceTasks | null>(null);
const DesktopWorkspaceProjectsContext =
  createContext<DesktopWorkspaceProjects | null>(null);
const DesktopWorkspacePeopleContext =
  createContext<DesktopWorkspacePeople | null>(null);
const DesktopWorkspaceDocumentsContext =
  createContext<DesktopWorkspaceDocuments | null>(null);
const DesktopWorkspaceActionsContext =
  createContext<DesktopWorkspaceActions | null>(null);

/**
 * Prefer PowerSync rows when ready. Soft-revalidate from the API after sync
 * checkpoints so newer remote columns can merge in.
 *
 * Prefer {@link DesktopWorkspaceDataProvider} + domain hooks so navigations
 * share one hydrated snapshot (avoids not-found flashes) without every
 * consumer re-rendering on unrelated table updates.
 */
function useDesktopWorkspaceDataImpl(): {
  meta: DesktopWorkspaceMeta;
  tasks: DesktopWorkspaceTasks;
  projects: DesktopWorkspaceProjects;
  people: DesktopWorkspacePeople;
  documents: DesktopWorkspaceDocuments;
  actions: DesktopWorkspaceActions;
} {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const clerkKey = getDesktopPublicEnvironment().clerkPublishableKey;
  const authenticated =
    Boolean(clerkKey) && powerSync.status !== "unauthenticated";

  const localTasks = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? TASKS_LIST_SQL : null,
  );
  const localInboxTasks = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? INBOX_TASKS_LIST_SQL : null,
  );
  const localProjects = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? PROJECTS_LIST_SQL : null,
  );
  const localLetters = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? LETTERS_LIST_SQL : null,
  );
  const localContacts = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? CONTACTS_LIST_SQL : null,
  );
  const localOrganizations = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? ORGANIZATIONS_LIST_SQL : null,
  );
  const localAreas = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? AREAS_LIST_SQL : null,
  );
  const localDocuments = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? DOCUMENTS_LIST_SQL : null,
  );
  const localHabits = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? HABITS_LIST_SQL : null,
  );
  const localMeetings = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? MEETINGS_LIST_SQL : null,
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

  const rawProjects = useMemo(
    () =>
      fillMissingLongTextFromApi(
        fillMissingCodebaseFieldsFromApi(
          fillMissingTypeFromApi(
            mergeLocalAndApiByUpdatedAt(
              localProjects.data?.map((row) => snakeRow(row) as ApiProject),
              apiProjects,
            ),
            apiProjects,
          ),
          apiProjects,
        ),
        apiProjects,
        ["summary", "description"],
      ),
    [apiProjects, localProjects.data],
  );

  const projectsById = useMemo(() => {
    const map = new Map<string, ApiProject>();
    for (const project of rawProjects) map.set(project.id, project);
    return map;
  }, [rawProjects]);

  const rawOrganizations = useMemo(
    () =>
      fillMissingLongTextFromApi(
        fillMissingMoneybirdContactIdFromApi(
          mergeLocalAndApiByUpdatedAt(
            localOrganizations.data?.map(
              (row) => snakeRow(row) as ApiOrganization,
            ),
            apiOrganizations,
          ),
          apiOrganizations,
        ),
        apiOrganizations,
        ["summary", "notes"],
      ),
    [apiOrganizations, localOrganizations.data],
  );

  const organizationsById = useMemo(() => {
    const map = new Map<string, ApiOrganization>();
    for (const organization of rawOrganizations) {
      map.set(organization.id, organization);
    }
    return map;
  }, [rawOrganizations]);

  const rawTasks = useMemo(
    () =>
      fillMissingLongTextFromApi(
        dropStaleLocalHabitTasks(
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
        ),
        apiTasks,
        ["description"],
      ),
    [apiTasks, localTasks.data],
  );

  const rawInboxTasks = useMemo(
    () =>
      fillMissingLongTextFromApi(
        dropStaleLocalHabitTasks(
          fillMissingDueDatesFromApi(
            fillMissingHabitIdFromApi(
              fillMissingAgentChatIdFromApi(
                fillMissingLinksFromApi(
                  mergeLocalAndApiByUpdatedAt(
                    localInboxTasks.data?.map(
                      (row) => snakeRow(row) as ApiTask,
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
          ),
          apiInboxTasks,
        ),
        apiInboxTasks,
        ["description"],
      ),
    [apiInboxTasks, localInboxTasks.data],
  );

  const rawLetters = useMemo(
    () =>
      fillMissingLongTextFromApi(
        mergeLocalAndApiByUpdatedAt(
          localLetters.data?.map((row) => snakeRow(row) as ApiLetter),
          apiLetters,
        ),
        apiLetters,
        ["context"],
      ),
    [apiLetters, localLetters.data],
  );

  const rawMeetings = useMemo(
    () =>
      fillMissingLongTextFromApi(
        fillMissingMeetingPropertiesFromApi(
          mergeLocalAndApiByUpdatedAt(
            localMeetings.data?.map((row) => snakeRow(row) as ApiMeeting),
            apiMeetings,
          ),
          apiMeetings,
        ),
        apiMeetings,
        ["summary", "notes", "transcription"],
      ),
    [apiMeetings, localMeetings.data],
  );

  const rawContacts = useMemo(
    () =>
      fillMissingLongTextFromApi(
        mergeLocalAndApiByUpdatedAt(
          localContacts.data?.map((row) => snakeRow(row) as ApiContact),
          apiContacts,
        ),
        apiContacts,
        ["summary", "notes"],
      ),
    [apiContacts, localContacts.data],
  );

  const rawAreas = useMemo(
    () =>
      fillMissingParentFromApi(
        mergeLocalAndApiByUpdatedAt(
          localAreas.data?.map((row) => snakeRow(row) as ApiArea),
          apiAreas,
        ),
        apiAreas,
      ),
    [apiAreas, localAreas.data],
  );

  const rawDocuments = useMemo(
    () =>
      mergeLocalAndApiByUpdatedAt(
        localDocuments.data?.map((row) => snakeRow(row) as ApiDocument),
        apiDocuments,
      ),
    [apiDocuments, localDocuments.data],
  );

  const habits = useMemo((): ApiHabit[] => {
    const localMapped =
      localHabits.data?.map((row) => {
        const local = snakeRow(row) as ApiHabit;
        const createdYmd =
          typeof local.createdAt === "string" && local.createdAt.length >= 10
            ? local.createdAt.slice(0, 10)
            : undefined;
        const cadence: ApiHabit["cadence"] =
          local.cadence === "every_2_days" ||
          local.cadence === "weekly" ||
          local.cadence === "monthly"
            ? local.cadence
            : "daily";
        return {
          ...local,
          description:
            typeof local.description === "string" ? local.description : null,
          projectId:
            typeof local.projectId === "string" && local.projectId.trim()
              ? local.projectId
              : "",
          cadence,
          cadenceAnchorYmd:
            typeof local.cadenceAnchorYmd === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(local.cadenceAnchorYmd)
              ? local.cadenceAnchorYmd
              : (createdYmd ?? local.cadenceAnchorYmd),
          todayTaskId: local.todayTaskId ?? null,
          todayTaskStatus: local.todayTaskStatus ?? null,
        } satisfies ApiHabit;
      }) ?? null;
    return fillMissingLongTextFromApi(
      mergeLocalAndApiByUpdatedAt(localMapped, apiHabits),
      apiHabits,
      ["description"],
    );
  }, [apiHabits, localHabits.data]);

  const source: DesktopWorkspaceData["source"] = localTasks.data
    ? "powersync"
    : "empty";

  const documents = useMemo(
    () => rawDocuments.map(mapDocument),
    [rawDocuments],
  );
  const knowledgeDocuments = useMemo(
    () =>
      rawDocuments
        .filter((document) => document.type === "knowledge")
        .map(mapDocument),
    [rawDocuments],
  );
  const projectDocuments = useMemo(
    () =>
      rawDocuments
        .filter((document) => document.type === "project")
        .map(mapDocument),
    [rawDocuments],
  );
  const journalItems: JournalListItem[] = useMemo(
    () =>
      rawDocuments
        .filter(
          (document) =>
            document.type === "journal" && Boolean(document.journalDate),
        )
        .map((document) => ({ dateSlug: document.journalDate as string }))
        .sort((a, b) => b.dateSlug.localeCompare(a.dateSlug)),
    [rawDocuments],
  );

  const inboxItems = useMemo(() => {
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
    const inboxTaskItems: InboxListItem[] = [...byId.values()].map((task) => {
      const project = task.projectId
        ? (projectsById.get(task.projectId) ?? null)
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
    return sortInboxItemsByAttentionStatus(inboxTaskItems);
  }, [projectsById, rawInboxTasks, rawTasks]);

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

  const mappedTasks = useMemo(
    () => rawTasks.map((task) => mapTask(task, projectsById)),
    [projectsById, rawTasks],
  );
  const mappedInboxTasks = useMemo(
    () => rawInboxTasks.map((task) => mapTask(task, projectsById)),
    [projectsById, rawInboxTasks],
  );
  const allTasks = useMemo(() => {
    const allTasksById = new Map<string, TaskItemRowTask>();
    for (const task of mappedTasks) allTasksById.set(task.id, task);
    for (const task of mappedInboxTasks) {
      if (!allTasksById.has(task.id)) allTasksById.set(task.id, task);
    }
    return [...allTasksById.values()];
  }, [mappedInboxTasks, mappedTasks]);

  rememberProjectTypes(
    rawProjects.map((project) => ({
      id: project.id,
      key: project.key,
      type: project.type,
    })),
  );

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

  const ready =
    !authenticated ||
    apiHydrated ||
    restHydrateSettled ||
    (powerSync.ready && !queriesHydrating) ||
    powerSync.status === "error";

  const projects = useMemo(
    () => rawProjects.map(mapProject),
    [rawProjects],
  );
  const letters = useMemo(
    () =>
      rawLetters
        .filter((letter) => letter.number != null)
        .map((letter) => mapLetter(letter, projectsById)),
    [projectsById, rawLetters],
  );
  const meetings = useMemo(
    () => rawMeetings.map((meeting) => mapMeeting(meeting, projectsById)),
    [projectsById, rawMeetings],
  );
  const contacts = useMemo(
    () =>
      rawContacts.map((contact) => mapContact(contact, organizationsById)),
    [organizationsById, rawContacts],
  );
  const organizations = useMemo(
    () => rawOrganizations.map(mapOrganization),
    [rawOrganizations],
  );

  const taskDetails = useMemo(() => {
    const details: Record<string, ApiTask> = {};
    for (const task of [...rawTasks, ...rawInboxTasks]) {
      details[task.id] = task;
    }
    return details;
  }, [rawInboxTasks, rawTasks]);

  const projectDetails = useMemo(() => {
    const details: Record<string, ApiProject> = {};
    for (const project of rawProjects) details[project.id] = project;
    return details;
  }, [rawProjects]);

  // Lazy detail maps: only include entries that have text so the global
  // snapshot does not retain empty string entries for every row.
  const taskDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const task of Object.values(taskDetails)) {
      if (task.description) map[task.id] = task.description;
    }
    return map;
  }, [taskDetails]);

  const taskLinks = useMemo(() => {
    const map: Record<string, TaskLink[]> = {};
    for (const task of Object.values(taskDetails)) {
      map[task.id] = parseTaskLinks(task.links);
    }
    return map;
  }, [taskDetails]);

  const projectSummaries = useMemo(() => {
    const map: Record<string, string> = {};
    for (const project of rawProjects) {
      if (project.summary) map[project.id] = project.summary;
    }
    return map;
  }, [rawProjects]);

  const projectDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const project of rawProjects) {
      if (project.description) map[project.id] = project.description;
    }
    return map;
  }, [rawProjects]);

  const letterBodies = useMemo(() => {
    const map: Record<string, string> = {};
    for (const letter of rawLetters) {
      if (letter.context) map[letter.id] = letter.context;
    }
    return map;
  }, [rawLetters]);

  const journalDocumentIdsByDate = useMemo(
    () =>
      Object.fromEntries(
        rawDocuments
          .filter(
            (document) =>
              document.type === "journal" && Boolean(document.journalDate),
          )
          .map((document) => [document.journalDate as string, document.id]),
      ),
    [rawDocuments],
  );

  const contactDetails = useMemo(
    () =>
      Object.fromEntries(rawContacts.map((contact) => [contact.id, contact])),
    [rawContacts],
  );
  const organizationDetails = useMemo(
    () =>
      Object.fromEntries(rawOrganizations.map((org) => [org.id, org])),
    [rawOrganizations],
  );
  const letterRecords = useMemo(
    () =>
      Object.fromEntries(rawLetters.map((letter) => [letter.id, letter])),
    [rawLetters],
  );

  const patchTask = useCallback(
    async (id: string, values: Record<string, unknown>) => {
      if (typeof values.status === "string") {
        noteLocalTaskStatusPatch(id);
      }
      const result = await patchViaPowerSyncOrApi("tasks", id, values);
      nudgeDynamicIslandTasksRefresh();
      window.setTimeout(() => nudgeDynamicIslandTasksRefresh(), 600);
      return result;
    },
    [patchViaPowerSyncOrApi],
  );
  const patchProject = useCallback(
    async (id: string, values: Record<string, unknown>) => {
      await patchViaPowerSyncOrApi("projects", id, values);
    },
    [patchViaPowerSyncOrApi],
  );
  const patchLetter = useCallback(
    async (id: string, values: Record<string, unknown>) => {
      await patchViaPowerSyncOrApi("letters", id, values);
    },
    [patchViaPowerSyncOrApi],
  );
  const patchMeeting = useCallback(
    async (id: string, values: Record<string, unknown>) => {
      await patchViaPowerSyncOrApi("meetings", id, values);
    },
    [patchViaPowerSyncOrApi],
  );
  const patchContact = useCallback(
    async (id: string, values: Record<string, unknown>) => {
      await patchViaPowerSyncOrApi("contacts", id, values);
    },
    [patchViaPowerSyncOrApi],
  );
  const patchOrganization = useCallback(
    async (id: string, values: Record<string, unknown>) => {
      await patchViaPowerSyncOrApi("organizations", id, values);
    },
    [patchViaPowerSyncOrApi],
  );
  const softDeleteTask = useCallback(
    (id: string) => softDeleteViaPowerSyncOrApi("tasks", id),
    [softDeleteViaPowerSyncOrApi],
  );
  const softDeleteProject = useCallback(
    (id: string) => softDeleteViaPowerSyncOrApi("projects", id),
    [softDeleteViaPowerSyncOrApi],
  );
  const softDeleteLetter = useCallback(
    (id: string) => softDeleteViaPowerSyncOrApi("letters", id),
    [softDeleteViaPowerSyncOrApi],
  );
  const softDeleteMeeting = useCallback(
    (id: string) => softDeleteViaPowerSyncOrApi("meetings", id),
    [softDeleteViaPowerSyncOrApi],
  );
  const softDeleteContact = useCallback(
    (id: string) => softDeleteViaPowerSyncOrApi("contacts", id),
    [softDeleteViaPowerSyncOrApi],
  );
  const softDeleteOrganization = useCallback(
    (id: string) => softDeleteViaPowerSyncOrApi("organizations", id),
    [softDeleteViaPowerSyncOrApi],
  );
  const softDeleteDocument = useCallback(
    (id: string) => softDeleteViaPowerSyncOrApi("documents", id),
    [softDeleteViaPowerSyncOrApi],
  );

  const meta = useMemo<DesktopWorkspaceMeta>(
    () => ({
      source,
      ready,
      habits,
      meetings,
      inboxItems,
      areas: rawAreas,
    }),
    [habits, inboxItems, meetings, rawAreas, ready, source],
  );

  const tasksSlice = useMemo<DesktopWorkspaceTasks>(
    () => ({
      tasks: mappedTasks,
      inboxTasks: mappedInboxTasks,
      allTasks,
      taskDescriptions,
      taskLinks,
      taskDetails,
    }),
    [
      allTasks,
      mappedInboxTasks,
      mappedTasks,
      taskDescriptions,
      taskDetails,
      taskLinks,
    ],
  );

  const projectsSlice = useMemo<DesktopWorkspaceProjects>(
    () => ({
      projects,
      letters,
      projectSummaries,
      projectDescriptions,
      letterBodies,
      letterRecords,
      projectDetails,
    }),
    [
      letterBodies,
      letterRecords,
      letters,
      projectDescriptions,
      projectDetails,
      projectSummaries,
      projects,
    ],
  );

  const peopleSlice = useMemo<DesktopWorkspacePeople>(
    () => ({
      contacts,
      organizations,
      contactDetails,
      organizationDetails,
    }),
    [contactDetails, contacts, organizationDetails, organizations],
  );

  const documentsSlice = useMemo<DesktopWorkspaceDocuments>(
    () => ({
      documents,
      knowledgeDocuments,
      projectDocuments,
      journalItems,
      journalDocumentIdsByDate,
    }),
    [
      documents,
      journalDocumentIdsByDate,
      journalItems,
      knowledgeDocuments,
      projectDocuments,
    ],
  );

  const actions = useMemo<DesktopWorkspaceActions>(
    () => ({
      patchTask,
      patchProject,
      patchLetter,
      patchMeeting,
      patchContact,
      patchOrganization,
      softDeleteTask,
      softDeleteProject,
      softDeleteLetter,
      softDeleteMeeting,
      softDeleteContact,
      softDeleteOrganization,
      softDeleteDocument,
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
    }),
    [
      createArea,
      createContact,
      createHabit,
      createInboxTask,
      createKnowledgeDocument,
      createKnowledgeFolder,
      createLetter,
      createMeeting,
      createOrganization,
      createProject,
      createProjectDocument,
      createProjectFolder,
      createProjectTask,
      deleteDocument,
      duplicateProject,
      duplicateTask,
      moveDocument,
      patchContact,
      patchLetter,
      patchMeeting,
      patchOrganization,
      patchProject,
      patchTask,
      recordHabitDay,
      reloadHabits,
      renameDocument,
      reorderDocuments,
      softDeleteArea,
      softDeleteContact,
      softDeleteDocument,
      softDeleteLetter,
      softDeleteMeeting,
      softDeleteOrganization,
      softDeleteProject,
      softDeleteTask,
      updateDocumentIcon,
      updateHabit,
    ],
  );

  return {
    meta,
    tasks: tasksSlice,
    projects: projectsSlice,
    people: peopleSlice,
    documents: documentsSlice,
    actions,
  };
}

/** Single shared workspace snapshot for the signed-in desktop shell. */
export function DesktopWorkspaceDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { meta, tasks, projects, people, documents, actions } =
    useDesktopWorkspaceDataImpl();
  return (
    <DesktopWorkspaceActionsContext.Provider value={actions}>
      <DesktopWorkspaceMetaContext.Provider value={meta}>
        <DesktopWorkspaceTasksContext.Provider value={tasks}>
          <DesktopWorkspaceProjectsContext.Provider value={projects}>
            <DesktopWorkspacePeopleContext.Provider value={people}>
              <DesktopWorkspaceDocumentsContext.Provider value={documents}>
                {children}
              </DesktopWorkspaceDocumentsContext.Provider>
            </DesktopWorkspacePeopleContext.Provider>
          </DesktopWorkspaceProjectsContext.Provider>
        </DesktopWorkspaceTasksContext.Provider>
      </DesktopWorkspaceMetaContext.Provider>
    </DesktopWorkspaceActionsContext.Provider>
  );
}

function requireWorkspaceSlice<T>(value: T | null, hookName: string): T {
  if (!value) {
    throw new Error(`${hookName} must be used within DesktopWorkspaceDataProvider`);
  }
  return value;
}

export function useDesktopWorkspaceMeta(): DesktopWorkspaceMeta {
  return requireWorkspaceSlice(
    useContext(DesktopWorkspaceMetaContext),
    "useDesktopWorkspaceMeta",
  );
}

export function useDesktopWorkspaceTasks(): DesktopWorkspaceTasks {
  return requireWorkspaceSlice(
    useContext(DesktopWorkspaceTasksContext),
    "useDesktopWorkspaceTasks",
  );
}

export function useDesktopWorkspaceProjects(): DesktopWorkspaceProjects {
  return requireWorkspaceSlice(
    useContext(DesktopWorkspaceProjectsContext),
    "useDesktopWorkspaceProjects",
  );
}

export function useDesktopWorkspacePeople(): DesktopWorkspacePeople {
  return requireWorkspaceSlice(
    useContext(DesktopWorkspacePeopleContext),
    "useDesktopWorkspacePeople",
  );
}

export function useDesktopWorkspaceDocuments(): DesktopWorkspaceDocuments {
  return requireWorkspaceSlice(
    useContext(DesktopWorkspaceDocumentsContext),
    "useDesktopWorkspaceDocuments",
  );
}

export function useDesktopWorkspaceActions(): DesktopWorkspaceActions {
  return requireWorkspaceSlice(
    useContext(DesktopWorkspaceActionsContext),
    "useDesktopWorkspaceActions",
  );
}

/**
 * Reads the full shared workspace snapshot. Prefer domain hooks
 * ({@link useDesktopWorkspaceTasks}, etc.) when a consumer only needs one slice.
 */
export function useDesktopWorkspaceData(): DesktopWorkspaceData {
  const meta = useDesktopWorkspaceMeta();
  const tasks = useDesktopWorkspaceTasks();
  const projects = useDesktopWorkspaceProjects();
  const people = useDesktopWorkspacePeople();
  const documents = useDesktopWorkspaceDocuments();
  const actions = useDesktopWorkspaceActions();
  return useMemo(
    () => ({
      ...meta,
      ...tasks,
      ...projects,
      ...people,
      ...documents,
      ...actions,
    }),
    [actions, documents, meta, people, projects, tasks],
  );
}
