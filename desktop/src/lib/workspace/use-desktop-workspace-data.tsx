import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
} from "@backsteros/contracts";
import { formatContactDisplayName } from "@backsteros/contracts";
import {
  buildInboxTaskListItem,
  coerceTaskDisplayNumber,
  sortInboxItemsByAttentionStatus,
  taskBelongsInInbox,
  type InboxListItem,
  type JournalListItem,
  type TaskItemRowTask,
} from "@backsteros/ui";

import { useDesktopApi } from "../api-context";
import {
  apiFillSourceForColdStart,
  fillMissingAgentChatIdFromApi,
  fillMissingAgentInboxApprovedAtFromApi,
  fillMissingDueDatesFromApi,
  fillMissingHabitIdFromApi,
  dropStaleLocalHabitTasks,
  fillMissingCodebaseFieldsFromApi,
  fillMissingLinksFromApi,
  fillMissingLinkedCommitShasFromApi,
  fillMissingLongTextFromApi,
  fillMissingMeetingPropertiesFromApi,
  fillMissingMoneybirdContactIdFromApi,
  fillMissingNumberFromApi,
  fillMissingParentFromApi,
  fillMissingTypeFromApi,
  mergeLocalDocumentsWithLiveApi,
  mergeLocalWithPendingApiCreates,
  preferNewerByUpdatedAt,
  resolveLocalOrApiRows,
} from "../merge-local-and-api";
import { useDesktopPowerSync, usePowerSyncQuery } from "../powersync-context";
import { WORKSPACE_LIST_ROW_COMPARATOR } from "../powersync-row-comparators";
import { getDesktopPublicEnvironment } from "../env";
import { rememberProjectTypes } from "../project-type-cache";
import { noteLocalTaskStatusPatch } from "../agent/agent-status-notifications";
import { nudgeDynamicIslandTasksRefresh } from "../dynamic-island-nudge";
import { rememberWorkspaceSectionEntries } from "../section-entry-hrefs";
import { backfillLocalEntityNumbersFromApi } from "./backfill-local-entity-numbers";
import { rescueUnuploadedLocalTasks } from "./rescue-unuploaded-local-tasks";
import {
  asEpoch,
  mapContact,
  mapDocument,
  mapLetter,
  mapMeeting,
  mapOrganization,
  mapProject,
  mapTask,
  parseStringIdArray,
  snakeRow,
} from "./row-mappers";
import {
  computeWorkspaceGlobalReady,
  computeWorkspaceSurfaceReady,
} from "./workspace-ready";
import type { DesktopWorkspaceData } from "./workspace-data-types";
import {
  DesktopWorkspaceActionsContext,
  DesktopWorkspaceDocumentsContext,
  DesktopWorkspaceInboxItemsContext,
  DesktopWorkspaceMetaContext,
  DesktopWorkspacePeopleContext,
  DesktopWorkspaceProjectsContext,
  DesktopWorkspaceTasksContext,
  type DesktopWorkspaceActions,
  type DesktopWorkspaceDocuments,
  type DesktopWorkspaceMeta,
  type DesktopWorkspacePeople,
  type DesktopWorkspaceProjects,
  type DesktopWorkspaceTasks,
  type WorkspaceSurface,
} from "./workspace-contexts";
import { useWorkspaceApiRows } from "./use-workspace-api-rows";
import { useWorkspaceEntityPatching } from "./use-entity-patching";
import { useWorkspaceEntityCreation } from "./use-entity-creation";
import { useWorkspaceHabitActions } from "./use-habit-actions";
import { useWorkspaceTaskActions } from "./use-task-actions";
import { useWorkspaceLetterMeetingActions } from "./use-letter-meeting-actions";
import { useWorkspaceDocumentActions } from "./use-document-actions";
import {
  ALL_TASKS_LIST_SQL,
  AREAS_LIST_SQL,
  CONTACTS_LIST_SQL,
  DOCUMENTS_LIST_SQL,
  HABITS_LIST_SQL,
  LETTERS_LIST_SQL,
  MEETINGS_LIST_SQL,
  ORGANIZATIONS_LIST_SQL,
  PROJECTS_LIST_SQL,
} from "./workspace-sql";

export type {
  DesktopWorkspaceActions,
  DesktopWorkspaceDocuments,
  DesktopWorkspaceMeta,
  DesktopWorkspacePeople,
  DesktopWorkspaceProjects,
  DesktopWorkspaceTasks,
  WorkspaceSurface,
  WorkspaceSurfaceReady,
} from "./workspace-contexts";

function isTasksListTask(task: ApiTask): boolean {
  return !task.inbox;
}

function splitLocalTaskRows(rows: Record<string, unknown>[] | null | undefined): {
  listTasks: ApiTask[] | null;
  inboxTasks: ApiTask[] | null;
} {
  if (rows == null) return { listTasks: null, inboxTasks: null };
  const mapped = rows.map((row) => {
    const task = snakeRow(row) as ApiTask;
    return {
      ...task,
      number: coerceTaskDisplayNumber(task.number),
      relatedContactIds: parseStringIdArray(task.relatedContactIds),
      relatedOrganizationIds: parseStringIdArray(task.relatedOrganizationIds),
    };
  });
  return {
    listTasks: mapped.filter(isTasksListTask),
    inboxTasks: mapped.filter((task) =>
      taskBelongsInInbox({
        inbox: task.inbox,
        status: task.status,
        dueDate: task.dueDate,
        agentCreatedAt: task.agentCreatedAt,
        agentInboxApprovedAt: task.agentInboxApprovedAt,
        habitId: task.habitId,
      }),
    ),
  };
}

/**
 * Prefer PowerSync rows when ready. Cold-start REST rescue only when SQLite
 * is empty — no soft-revalidate on sync checkpoints (Linear-shaped).
 *
 * Prefer {@link DesktopWorkspaceDataProvider} + domain hooks so navigations
 * share one hydrated snapshot (avoids not-found flashes) without every
 * consumer re-rendering on unrelated table updates.
 */
function useDesktopWorkspaceDataImpl(): {
  meta: DesktopWorkspaceMeta;
  inboxItems: InboxListItem[];
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

  const localAllTasks = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? ALL_TASKS_LIST_SQL : null,
    [],
    { rowComparator: WORKSPACE_LIST_ROW_COMPARATOR },
  );
  const localTaskSplits = useMemo(
    () => splitLocalTaskRows(localAllTasks.data),
    [localAllTasks.data],
  );
  const localTasks = localTaskSplits.listTasks;
  const localInboxTasks = localTaskSplits.inboxTasks;
  const localProjects = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? PROJECTS_LIST_SQL : null,
    [],
    { rowComparator: WORKSPACE_LIST_ROW_COMPARATOR },
  );
  const localLetters = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? LETTERS_LIST_SQL : null,
    [],
    { rowComparator: WORKSPACE_LIST_ROW_COMPARATOR },
  );
  const localContacts = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? CONTACTS_LIST_SQL : null,
    [],
    { rowComparator: WORKSPACE_LIST_ROW_COMPARATOR },
  );
  const localOrganizations = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? ORGANIZATIONS_LIST_SQL : null,
    [],
    { rowComparator: WORKSPACE_LIST_ROW_COMPARATOR },
  );
  const localAreas = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? AREAS_LIST_SQL : null,
    [],
    { rowComparator: WORKSPACE_LIST_ROW_COMPARATOR },
  );
  const localDocuments = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? DOCUMENTS_LIST_SQL : null,
    [],
    { rowComparator: WORKSPACE_LIST_ROW_COMPARATOR },
  );
  const localHabits = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? HABITS_LIST_SQL : null,
    [],
    { rowComparator: WORKSPACE_LIST_ROW_COMPARATOR },
  );
  const localMeetings = usePowerSyncQuery<Record<string, unknown>>(
    authenticated ? MEETINGS_LIST_SQL : null,
    [],
    { rowComparator: WORKSPACE_LIST_ROW_COMPARATOR },
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
    liveDeletedDocumentIds,
    apiHabits,
    setApiHabits,
    apiMeetings,
    setApiMeetings,
    restHydrateSettled,
    queriesGracePeriodExpired,
  } = useWorkspaceApiRows({ authenticated, client, powerSync });

  // Copy REST numbers into SQLite when local rows still have null/0
  // (create/scope-move lag). Re-runs when the missing set changes. Also rescue
  // local-only orphans whose PowerSync PUT never reached Postgres — including
  // rows that already exist on REST but still lack a local number.
  const taskNumberBackfillKeyRef = useRef<string>("");
  useEffect(() => {
    if (!powerSync.ready || !authenticated) return;
    const localMapped = [
      ...(localTasks ?? []),
      ...(localInboxTasks ?? []),
    ];
    if (localMapped.length === 0) return;
    const missingIds = localMapped
      .filter(
        (row) =>
          row.number == null ||
          (typeof row.number === "number" &&
            (!Number.isFinite(row.number) || row.number <= 0)),
      )
      .map((row) => row.id)
      .sort();
    if (missingIds.length === 0) {
      taskNumberBackfillKeyRef.current = "";
      return;
    }
    const key = missingIds.join(",");
    if (taskNumberBackfillKeyRef.current === key) return;
    taskNumberBackfillKeyRef.current = key;
    void (async () => {
      try {
        const rescued = await rescueUnuploadedLocalTasks(
          client,
          powerSync,
          localMapped,
          [setApiTasks, setApiInboxTasks],
        );
        let backfilled = 0;
        if (apiTasks?.length) {
          backfilled = await backfillLocalEntityNumbersFromApi(
            powerSync,
            "tasks",
            localMapped,
            [...apiTasks, ...(apiInboxTasks ?? [])],
          );
        }
        // Auth/network blips: don't permanently lock this missing set.
        if (rescued === 0 && backfilled === 0) {
          taskNumberBackfillKeyRef.current = "";
        }
      } catch (error) {
        if (taskNumberBackfillKeyRef.current === key) {
          taskNumberBackfillKeyRef.current = "";
        }
        console.warn("[desktop] task number rescue/backfill failed", error);
      }
    })();
  }, [
    apiInboxTasks,
    apiTasks,
    authenticated,
    client,
    localInboxTasks,
    localTasks,
    powerSync,
    setApiInboxTasks,
    setApiTasks,
  ]);

  const rawProjects = useMemo(() => {
    const localMapped =
      localProjects.data?.map((row) => snakeRow(row) as ApiProject) ?? null;
    const fillFrom = apiFillSourceForColdStart(localMapped, apiProjects);
    return fillMissingLongTextFromApi(
      fillMissingCodebaseFieldsFromApi(
        fillMissingTypeFromApi(
          resolveLocalOrApiRows(localMapped, apiProjects),
          fillFrom,
        ),
        fillFrom,
      ),
      apiProjects,
      ["summary", "description"],
    );
  }, [apiProjects, localProjects.data]);

  const projectsById = useMemo(() => {
    const map = new Map<string, ApiProject>();
    for (const project of rawProjects) map.set(project.id, project);
    // Local-primary project membership can omit a row (sync lag) while tasks
    // still reference it — keep API projects in the lookup so KEY-N resolves.
    for (const project of apiProjects ?? []) {
      if (!map.has(project.id)) map.set(project.id, project);
    }
    return map;
  }, [apiProjects, rawProjects]);

  const rawOrganizations = useMemo(() => {
    const localMapped =
      localOrganizations.data?.map(
        (row) => snakeRow(row) as ApiOrganization,
      ) ?? null;
    const fillFrom = apiFillSourceForColdStart(localMapped, apiOrganizations);
    return fillMissingLongTextFromApi(
      fillMissingMoneybirdContactIdFromApi(
        resolveLocalOrApiRows(localMapped, apiOrganizations),
        fillFrom,
      ),
      apiOrganizations,
      [
        "summary",
        "notes",
        "size",
        "socialAccounts",
        "region",
        "chamberOfCommerce",
        "taxNumber",
        // Coords may lag in SQLite after schema adds / Moneybird geocode writes
        // to Postgres; fill from REST so the Details map can render.
        "latitude",
        "longitude",
        "address",
        "city",
        "postalCode",
        "country",
        "emails",
        "phones",
      ],
    );
  }, [apiOrganizations, localOrganizations.data]);

  const organizationsById = useMemo(() => {
    const map = new Map<string, ApiOrganization>();
    for (const organization of rawOrganizations) {
      map.set(organization.id, organization);
    }
    return map;
  }, [rawOrganizations]);

  const rawTasks = useMemo(() => {
    const localMapped = localTasks;
    const fillFrom = apiFillSourceForColdStart(localMapped, apiTasks);
    const resolved = dropStaleLocalHabitTasks(
      fillMissingNumberFromApi(
        fillMissingDueDatesFromApi(
          fillMissingHabitIdFromApi(
            fillMissingLinkedCommitShasFromApi(
              fillMissingAgentChatIdFromApi(
                fillMissingLinksFromApi(
                  mergeLocalWithPendingApiCreates(
                    resolveLocalOrApiRows(localMapped, apiTasks),
                    apiTasks,
                  ),
                  fillFrom,
                ),
                fillFrom,
              ),
              // Prefer live REST when PowerSync lags (CLI-linked commits, etc.).
              apiTasks,
            ),
            fillFrom,
          ),
          fillFrom,
        ),
        // Live API: server number after create / project scope move.
        apiTasks,
      ),
      fillFrom,
    );
    return fillMissingAgentInboxApprovedAtFromApi(resolved, apiTasks);
  }, [apiTasks, localTasks]);

  const rawInboxTasks = useMemo(() => {
    const localMapped = localInboxTasks;
    const fillFrom = apiFillSourceForColdStart(localMapped, apiInboxTasks);
    const resolved = dropStaleLocalHabitTasks(
      fillMissingNumberFromApi(
        fillMissingDueDatesFromApi(
          fillMissingHabitIdFromApi(
            fillMissingLinkedCommitShasFromApi(
              fillMissingAgentChatIdFromApi(
                fillMissingLinksFromApi(
                  mergeLocalWithPendingApiCreates(
                    resolveLocalOrApiRows(localMapped, apiInboxTasks),
                    apiInboxTasks,
                  ),
                  fillFrom,
                ),
                fillFrom,
              ),
              apiInboxTasks,
            ),
            fillFrom,
          ),
          fillFrom,
        ),
        apiInboxTasks,
      ),
      fillFrom,
    );
    return fillMissingAgentInboxApprovedAtFromApi(resolved, apiInboxTasks);
  }, [apiInboxTasks, localInboxTasks]);

  const rawLetters = useMemo(() => {
    const localMapped =
      localLetters.data?.map((row) => snakeRow(row) as ApiLetter) ?? null;
    return fillMissingLongTextFromApi(
      resolveLocalOrApiRows(localMapped, apiLetters),
      apiLetters,
      ["context"],
    );
  }, [apiLetters, localLetters.data]);

  const rawMeetings = useMemo(() => {
    // On a broken local watch (e.g. SELECT of a column not yet in SQLite),
    // ignore local and fall back to REST so the calendar side panel stays populated.
    const localMapped =
      localMeetings.error != null
        ? null
        : (localMeetings.data?.map((row) => snakeRow(row) as ApiMeeting) ??
          null);
    return fillMissingLongTextFromApi(
      fillMissingMeetingPropertiesFromApi(
        resolveLocalOrApiRows(localMapped, apiMeetings),
        apiMeetings,
      ),
      apiMeetings,
      ["summary", "notes", "transcription"],
    );
  }, [apiMeetings, localMeetings.data, localMeetings.error]);

  const rawContacts = useMemo(() => {
    const localMapped =
      localContacts.data?.map((row) => snakeRow(row) as ApiContact) ?? null;
    return fillMissingLongTextFromApi(
      resolveLocalOrApiRows(localMapped, apiContacts),
      apiContacts,
      // birthday / names / emails: fill when local SQLite is still missing new CRM columns
      ["summary", "notes", "birthday", "firstName", "lastName", "emails", "phones", "languages", "socialAccounts", "latitude", "longitude", "address", "city", "postalCode", "country", "region"],
    );
  }, [apiContacts, localContacts.data]);

  const rawAreas = useMemo(() => {
    const localMapped =
      localAreas.data?.map((row) => snakeRow(row) as ApiArea) ?? null;
    const fillFrom = apiFillSourceForColdStart(localMapped, apiAreas);
    return fillMissingParentFromApi(
      resolveLocalOrApiRows(localMapped, apiAreas),
      fillFrom,
    );
  }, [apiAreas, localAreas.data]);

  const rawDocuments = useMemo(() => {
    const localMapped =
      localDocuments.data?.map((row) => snakeRow(row) as ApiDocument) ?? null;
    // Overlay newer API metadata (agent move/rename) + pending creates; hide
    // live deletes until PowerSync drops the SQLite row.
    return mergeLocalDocumentsWithLiveApi(
      resolveLocalOrApiRows(localMapped, apiDocuments),
      apiDocuments,
      { deletedIds: liveDeletedDocumentIds },
    );
  }, [apiDocuments, liveDeletedDocumentIds, localDocuments.data]);

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
      resolveLocalOrApiRows(localMapped, apiHabits),
      apiHabits,
      ["description"],
    );
  }, [apiHabits, localHabits.data]);

  const source: DesktopWorkspaceData["source"] = localAllTasks.data
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
          inboxUpdatedAt: task.inboxUpdatedAt,
          habitId: task.habitId,
        })
      ) {
        continue;
      }
      const existing = byId.get(task.id);
      byId.set(
        task.id,
        existing ? preferNewerByUpdatedAt(existing, task) : task,
      );
    }
    const inboxTaskItems: InboxListItem[] = [...byId.values()].map((task) => {
      const project = task.projectId
        ? (projectsById.get(task.projectId) ?? null)
        : null;
      return buildInboxTaskListItem({
        id: task.id,
        title: task.title,
        number: coerceTaskDisplayNumber(task.number) ?? 0,
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
        inboxUpdatedAt: task.inboxUpdatedAt,
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
    softRefreshApiDocuments,
  } = useWorkspaceEntityPatching({
    authenticated,
    client,
    powerSync,
    setApiTasks,
    setApiInboxTasks,
    setApiProjects,
    setApiAreas,
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
    softDeleteViaPowerSyncOrApi,
  });

  const { reloadHabits, createHabit, updateHabit, recordHabitDay } =
    useWorkspaceHabitActions({
      authenticated,
      client,
      powerSync,
      toSnakeFields,
      softRefreshApiTasks,
      rawHabits: habits,
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
    toSnakeFields,
    seedDocumentLocal,
    patchViaPowerSyncOrApi,
    softDeleteViaPowerSyncOrApi,
    setApiDocuments,
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
      const existing = allTasksById.get(task.id);
      allTasksById.set(
        task.id,
        existing ? preferNewerByUpdatedAt(existing, task) : task,
      );
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

  const readyInput = useMemo(
    () => ({
      authenticated,
      restHydrateSettled,
      queriesGracePeriodExpired,
      powerSyncReady: powerSync.ready,
      powerSyncStatus: powerSync.status,
      localLoaded: {
        tasks: localAllTasks.data !== null,
        inboxTasks: localAllTasks.data !== null,
        projects: localProjects.data !== null,
        documents: localDocuments.data !== null,
        letters: localLetters.data !== null,
        contacts: localContacts.data !== null,
        organizations: localOrganizations.data !== null,
        habits: localHabits.data !== null,
        meetings: localMeetings.data !== null,
        areas: localAreas.data !== null,
      },
      apiLoaded: {
        tasks: apiTasks !== null,
        inboxTasks: apiInboxTasks !== null,
        projects: apiProjects !== null,
        documents: apiDocuments !== null,
        letters: apiLetters !== null,
        contacts: apiContacts !== null,
        organizations: apiOrganizations !== null,
        habits: apiHabits !== null,
        meetings: apiMeetings !== null,
        areas: apiAreas !== null,
      },
    }),
    [
      apiAreas,
      apiContacts,
      apiDocuments,
      apiHabits,
      apiInboxTasks,
      apiLetters,
      apiMeetings,
      apiOrganizations,
      apiProjects,
      apiTasks,
      authenticated,
      localAreas.data,
      localContacts.data,
      localDocuments.data,
      localHabits.data,
      localAllTasks.data,
      localLetters.data,
      localMeetings.data,
      localOrganizations.data,
      localProjects.data,
      powerSync.ready,
      powerSync.status,
      queriesGracePeriodExpired,
      restHydrateSettled,
    ],
  );

  const readyBySurface = useMemo(
    () => computeWorkspaceSurfaceReady(readyInput),
    [readyInput],
  );

  const ready = computeWorkspaceGlobalReady(readyBySurface);

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
  rememberWorkspaceSectionEntries({
    inboxItems,
    contacts,
    organizations,
    letters,
    knowledgeDocuments,
  });

  const taskDetails = useMemo(() => {
    const details: Record<string, ApiTask> = {};
    for (const task of [...rawTasks, ...rawInboxTasks]) {
      const existing = details[task.id];
      details[task.id] = existing
        ? preferNewerByUpdatedAt(existing, task)
        : task;
    }
    return details;
  }, [rawInboxTasks, rawTasks]);

  const projectDetails = useMemo(() => {
    const details: Record<string, ApiProject> = {};
    for (const project of rawProjects) details[project.id] = project;
    return details;
  }, [rawProjects]);

  // Descriptions are not on list SQL — detail/calendar use one-row PowerSync
  // via useDesktopTaskDescription. Keep an empty map for API compat (do not
  // fillMissingLongTextFromApi description into list rows).
  const taskDescriptions = useMemo(() => ({} as Record<string, string>), []);

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
      // organizationName is display-only (joined from organizations); writing it
      // as organization_name fails SQLite and aborts the PowerSync upload path.
      const { organizationName: _organizationName, ...writable } = values;
      const touchesNames =
        writable.firstName !== undefined ||
        writable.lastName !== undefined ||
        writable.name !== undefined;
      let next = writable;
      if (touchesNames) {
        const existing = rawContacts.find((contact) => contact.id === id);
        if (existing) {
          if (
            writable.firstName === undefined &&
            writable.lastName === undefined &&
            writable.name !== undefined
          ) {
            const firstName = String(writable.name ?? "").trim();
            next = {
              ...writable,
              firstName,
              lastName: "",
              name: firstName,
            };
          } else {
            const firstName = String(
              writable.firstName !== undefined
                ? writable.firstName
                : (existing.firstName ?? existing.name ?? ""),
            ).trim();
            const lastName = String(
              writable.lastName !== undefined
                ? (writable.lastName ?? "")
                : (existing.lastName ?? ""),
            ).trim();
            next = {
              ...writable,
              firstName,
              lastName,
              name: formatContactDisplayName(firstName, lastName) || firstName,
            };
          }
        }
      }
      await patchViaPowerSyncOrApi("contacts", id, next);
    },
    [patchViaPowerSyncOrApi, rawContacts],
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
      readyBySurface,
      habits,
      meetings,
      areas: rawAreas,
    }),
    [habits, meetings, rawAreas, ready, readyBySurface, source],
  );

  const tasksSlice = useMemo<DesktopWorkspaceTasks>(
    () => ({
      tasks: mappedTasks,
      inboxTasks: mappedInboxTasks,
      allTasks,
      taskDescriptions,
      taskDetails,
    }),
    [
      allTasks,
      mappedInboxTasks,
      mappedTasks,
      taskDescriptions,
      taskDetails,
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
      softRefreshApiDocuments,
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
      softRefreshApiDocuments,
      softDeleteTask,
      updateDocumentIcon,
      updateHabit,
    ],
  );

  return {
    meta,
    inboxItems,
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
  const { meta, inboxItems, tasks, projects, people, documents, actions } =
    useDesktopWorkspaceDataImpl();
  return (
    <DesktopWorkspaceActionsContext.Provider value={actions}>
      <DesktopWorkspaceInboxItemsContext.Provider value={inboxItems}>
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
      </DesktopWorkspaceInboxItemsContext.Provider>
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

export function useDesktopWorkspaceInboxItems(): InboxListItem[] {
  return requireWorkspaceSlice(
    useContext(DesktopWorkspaceInboxItemsContext),
    "useDesktopWorkspaceInboxItems",
  );
}

/** Surface-scoped readiness — avoids waiting on unrelated PowerSync watches. */
export function useWorkspaceSurfaceReady(surface: WorkspaceSurface): boolean {
  return useDesktopWorkspaceMeta().readyBySurface[surface];
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
  const inboxItems = useDesktopWorkspaceInboxItems();
  const tasks = useDesktopWorkspaceTasks();
  const projects = useDesktopWorkspaceProjects();
  const people = useDesktopWorkspacePeople();
  const documents = useDesktopWorkspaceDocuments();
  const actions = useDesktopWorkspaceActions();
  const snapshot = useMemo(
    () => ({
      ...meta,
      inboxItems,
      ...tasks,
      ...projects,
      ...people,
      ...documents,
      ...actions,
    }),
    [actions, documents, inboxItems, meta, people, projects, tasks],
  );
  return snapshot;
}
