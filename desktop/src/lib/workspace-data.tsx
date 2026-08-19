import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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
  Task as ApiTask,
  TaskLink,
} from "@backsteros/contracts";
import {
  allocateUniqueProjectKey,
  buildInboxTaskListItem,
  sortInboxItemsByAttentionStatus,
  taskBelongsInInbox,
  toApiDueDateIso,
  type ContactListItem,
  type InboxListItem,
  type JournalListItem,
  type KnowledgeListItem,
  type LetterListItem,
  type OrganizationListItem,
  type ProjectOverviewRowProject,
  type TaskItemRowTask,
} from "@backsteros/ui";

import { useDesktopApi } from "./api-context";
import { createRequestAbortSignal } from "./request-timeout";
import { resolveCreateAssigneeId } from "./default-assignee";
import {
  fillMissingAgentChatIdFromApi,
  fillMissingHabitIdFromApi,
  dropStaleLocalHabitTasks,
  fillMissingCodebaseFieldsFromApi,
  fillMissingLinksFromApi,
  fillMissingMoneybirdContactIdFromApi,
  fillMissingParentFromApi,
  fillMissingTypeFromApi,
  mergeLocalAndApiByUpdatedAt,
  preservePendingApiRows,
} from "./merge-local-and-api";
import { useDesktopPowerSync, usePowerSyncQuery } from "./powersync-context";
import { getDesktopPublicEnvironment } from "./env";
import { rememberProjectTypes } from "./project-type-cache";
import { noteLocalTaskStatusPatch } from "./agent/agent-status-notifications";
import { nudgeDynamicIslandTasksRefresh } from "./dynamic-island-nudge";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
    ] = key === "inbox" ? Boolean(value) : value;
  }
  return output;
}

function asEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function parseTaskLinks(value: unknown): TaskLink[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is TaskLink =>
      item != null &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { url?: unknown }).url === "string" &&
      typeof (item as { createdAt?: unknown }).createdAt === "string",
  );
}

const TERMINAL_TASK_STATUSES = new Set([
  "completed",
  "canceled",
  "duplicated",
]);

function cloneTaskLinksForDuplicate(links: TaskLink[]): TaskLink[] {
  const createdAt = new Date().toISOString();
  return links.map((link) => ({
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    url: link.url,
    createdAt,
  }));
}

function resolveDuplicateTaskStatus(source: ApiTask): string {
  if (!TERMINAL_TASK_STATUSES.has(source.status)) {
    return source.status;
  }
  if (source.inbox || (!source.projectId && !source.contactId)) {
    return "triage";
  }
  return "ready_to_start";
}

function mapTask(
  task: ApiTask,
  projectsById: Map<string, ApiProject>,
): TaskItemRowTask {
  const project = task.projectId
    ? projectsById.get(task.projectId) ?? null
    : null;
  return {
    id: task.id,
    number: task.number,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: asEpoch(task.dueDate),
    projectId: task.projectId,
    projectKey: project?.key ?? null,
    projectName: project?.name ?? null,
    contactId: task.contactId,
    assigneeId: task.assigneeId,
    sortOrder: task.sortOrder,
    updatedAt: asEpoch(task.updatedAt) ?? undefined,
    agentChatId: task.agentChatId ?? null,
    habitId: task.habitId ?? null,
    agentCreatedAt: asEpoch(task.agentCreatedAt),
    agentInboxApprovedAt: asEpoch(task.agentInboxApprovedAt),
  };
}

function mapProject(project: ApiProject): ProjectOverviewRowProject & {
  organizationId?: string | null;
  type?: string;
  localWorkingDirectory?: string | null;
  githubRepository?: string | null;
} {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    status: project.status,
    priority: project.priority,
    areaId: project.areaId ?? null,
    area: project.area ?? null,
    type: project.type ?? "general",
    icon: project.icon ?? null,
    organizationId: project.organizationId ?? null,
    localWorkingDirectory: project.localWorkingDirectory ?? null,
    githubRepository: project.githubRepository ?? null,
    startDate: asEpoch(project.startDate),
    dueDate: asEpoch(project.dueDate),
    sortOrder: project.sortOrder,
    taskProgress: { total: 0, completed: 0 },
  };
}

function mapDocument(document: ApiDocument): KnowledgeListItem {
  return {
    id: document.id,
    title: document.title,
    path: document.path,
    kind: document.kind,
    parentId: document.parentId,
    sortOrder: document.sortOrder,
    icon: document.icon,
    projectId: document.projectId,
  };
}

function mapLetter(
  letter: ApiLetter,
  projectsById: Map<string, ApiProject>,
): LetterListItem {
  const project = letter.projectId
    ? projectsById.get(letter.projectId) ?? null
    : null;
  return {
    id: letter.id,
    title: letter.title,
    number: letter.number ?? 0,
    status: letter.status,
    sortOrder: letter.sortOrder,
    projectId: letter.projectId,
    projectKey: project?.key ?? null,
    organizationId: letter.organizationId,
    contactId: letter.contactId,
    dueDate: letter.dueDate ? new Date(letter.dueDate).getTime() : null,
  };
}

function mapContact(
  contact: ApiContact,
  organizationsById: Map<string, ApiOrganization>,
): ContactListItem {
  const organization = contact.organizationId
    ? organizationsById.get(contact.organizationId) ?? null
    : null;
  return {
    id: contact.id,
    name: contact.name,
    number: contact.number ?? undefined,
    key: contact.key ?? undefined,
    organizationId: contact.organizationId ?? undefined,
    organizationName: organization?.name,
    email: contact.email ?? null,
    title: contact.title ?? null,
    avatarStorageKey: contact.avatarStorageKey ?? null,
    avatarUpdatedAt: asEpoch(contact.updatedAt),
  };
}

function mapOrganization(org: ApiOrganization): OrganizationListItem {
  return {
    id: org.id,
    name: org.name,
    number: org.number ?? undefined,
    key: org.key ?? undefined,
    avatarStorageKey: org.avatarStorageKey ?? null,
    avatarUpdatedAt: asEpoch(org.updatedAt),
    moneybirdContactId: org.moneybirdContactId ?? null,
  };
}

export type DesktopWorkspaceData = {
  source: "empty" | "powersync";
  ready: boolean;
  /** Non-inbox tasks — use for the Tasks list (`/tasks`). */
  tasks: TaskItemRowTask[];
  /** Inbox tasks with full metadata (assigneeId, etc.) — not in `tasks`. */
  inboxTasks: TaskItemRowTask[];
  /**
   * Non-inbox + inbox, deduped by id.
   * Use for contact/project/journal filters and task id lookups.
   */
  allTasks: TaskItemRowTask[];
  projects: Array<
    ProjectOverviewRowProject & {
      organizationId?: string | null;
      type?: string;
      localWorkingDirectory?: string | null;
      githubRepository?: string | null;
    }
  >;
  letters: LetterListItem[];
  /** All documents (project + knowledge + journal metadata). */
  documents: KnowledgeListItem[];
  knowledgeDocuments: KnowledgeListItem[];
  projectDocuments: KnowledgeListItem[];
  journalItems: JournalListItem[];
  habits: ApiHabit[];
  inboxItems: InboxListItem[];
  contacts: ContactListItem[];
  organizations: OrganizationListItem[];
  areas: ApiArea[];
  projectSummaries: Record<string, string>;
  projectDescriptions: Record<string, string>;
  taskDescriptions: Record<string, string>;
  taskLinks: Record<string, TaskLink[]>;
  letterBodies: Record<string, string>;
  /** journalDate → document id for content load/save. */
  journalDocumentIdsByDate: Record<string, string>;
  contactDetails: Record<string, ApiContact>;
  organizationDetails: Record<string, ApiOrganization>;
  letterRecords: Record<string, ApiLetter>;
  patchTask: (
    id: string,
    values: Record<string, unknown>,
  ) => Promise<{ number?: number } | void>;
  patchProject: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchLetter: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchContact: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchOrganization: (
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  softDeleteTask: (id: string) => Promise<void>;
  softDeleteProject: (id: string) => Promise<void>;
  softDeleteLetter: (id: string) => Promise<void>;
  softDeleteContact: (id: string) => Promise<void>;
  softDeleteOrganization: (id: string) => Promise<void>;
  softDeleteDocument: (id: string) => Promise<void>;
  createOrganization: (input: {
    name: string;
  }) => Promise<{ id: string; key: string }>;
  createContact: (input: {
    name: string;
    organizationId?: string | null;
  }) => Promise<{ id: string; key: string }>;
  createProject: (input: {
    name: string;
    status?: string;
    area?: string | null;
    organizationId?: string | null;
    type?: string;
  }) => Promise<{ id: string; key: string }>;
  createArea: (input: {
    name: string;
    parent: "personal" | "business" | "clients";
  }) => Promise<{ id: string }>;
  softDeleteArea: (id: string) => Promise<void>;
  reloadHabits: () => Promise<ApiHabit[]>;
  createHabit: (input: {
    title: string;
    icon?: string | null;
  }) => Promise<ApiHabit>;
  updateHabit: (
    id: string,
    input: {
      title?: string;
      cadence?: ApiHabit["cadence"];
      icon?: string | null;
      description?: string | null;
      projectId?: string;
      nextDueYmd?: string;
    },
  ) => Promise<ApiHabit>;
  recordHabitDay: (
    habitId: string,
    input: { dueYmd: string; status: "completed" | "canceled" },
  ) => Promise<ApiTask>;
  createInboxTask: (input: {
    title: string;
    description?: string;
    status?: string;
    priority?: number;
    assigneeId?: string | null;
    dueDate?: string | null;
    links?: TaskLink[];
  }) => Promise<{ id: string; number: number | null }>;
  createProjectTask: (input: {
    projectId: string;
    title: string;
    description?: string;
    status?: string;
    priority?: number;
    assigneeId?: string | null;
    dueDate?: string | null;
    links?: TaskLink[];
  }) => Promise<{ id: string; number: number | null }>;
  /** Create a copy of an existing task (new id/number; no agent chat). */
  duplicateTask: (
    sourceId: string,
  ) => Promise<{ id: string; number: number | null }>;
  /**
   * Create a copy of an existing project (new id/key). Optionally copies
   * tasks; never copies agent chats, github repo, or local working directory.
   */
  duplicateProject: (
    sourceId: string,
    options?: { includeTasks?: boolean },
  ) => Promise<{ id: string; key: string }>;
  createLetter: (input: {
    title: string;
    body?: string;
    status?: string;
    organizationId?: string | null;
    contactId?: string | null;
    projectId?: string | null;
    dueDate?: string | null;
    receivedDate?: string | null;
  }) => Promise<{ id: string; number: number | null }>;
  createKnowledgeDocument: (input: {
    title: string;
    content?: string;
    folderPath?: string;
    parentId?: string | null;
  }) => Promise<{ id: string; path: string; contentVersion: number }>;
  createProjectDocument: (input: {
    projectId: string;
    title: string;
    content?: string;
    folderPath?: string;
    parentId?: string | null;
  }) => Promise<{ id: string; path: string; contentVersion: number }>;
  createKnowledgeFolder: (input: {
    title: string;
    parentId?: string | null;
  }) => Promise<{ id: string; path: string }>;
  createProjectFolder: (input: {
    projectId: string;
    title: string;
    parentId?: string | null;
  }) => Promise<{ id: string; path: string }>;
  renameDocument: (
    id: string,
    title: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateDocumentIcon: (
    id: string,
    icon: string | null,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  moveDocument: (
    id: string,
    parentId: string | null,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  reorderDocuments: (
    orderedIds: string[],
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  deleteDocument: (
    id: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

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

  const [apiTasks, setApiTasks] = useState<ApiTask[] | null>(null);
  const [apiInboxTasks, setApiInboxTasks] = useState<ApiTask[] | null>(null);
  const [apiProjects, setApiProjects] = useState<ApiProject[] | null>(null);
  const [apiLetters, setApiLetters] = useState<ApiLetter[] | null>(null);
  const [apiContacts, setApiContacts] = useState<ApiContact[] | null>(null);
  const [apiOrganizations, setApiOrganizations] = useState<
    ApiOrganization[] | null
  >(null);
  const [apiAreas, setApiAreas] = useState<ApiArea[] | null>(null);
  const [apiDocuments, setApiDocuments] = useState<ApiDocument[] | null>(null);
  const [apiHabits, setApiHabits] = useState<ApiHabit[] | null>(null);
  const [restHydrateSettled, setRestHydrateSettled] = useState(!authenticated);
  const [queriesGracePeriodExpired, setQueriesGracePeriodExpired] =
    useState(false);

  useEffect(() => {
    if (!authenticated) {
      setRestHydrateSettled(true);
      return;
    }
    setRestHydrateSettled(false);
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || !powerSync.ready) {
      setQueriesGracePeriodExpired(false);
      return;
    }
    const timeoutId = window.setTimeout(
      () => setQueriesGracePeriodExpired(true),
      12_000,
    );
    return () => window.clearTimeout(timeoutId);
  }, [authenticated, powerSync.ready]);

  useEffect(() => {
    if (!authenticated) {
      setApiTasks(null);
      setApiInboxTasks(null);
      setApiProjects(null);
      setApiLetters(null);
      setApiContacts(null);
      setApiOrganizations(null);
      setApiAreas(null);
      setApiDocuments(null);
      setApiHabits(null);
    }
  }, [authenticated]);

  const syncEpoch = powerSync.lastSyncedAt?.getTime() ?? 0;

  // Always hydrate lists from REST when signed in. PowerSync remains the
  // primary merge source once local rows exist, but packaged desktop builds
  // can be "ready" with an empty SQLite if the sync stream never connects
  // (e.g. Tailscale PowerSync endpoint from WKWebView) — without this, Projects
  // / Tasks / Inbox stay empty even though core has data.
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const signal = createRequestAbortSignal();
    const markHydrated = () => {
      setApiDocuments((current) => current ?? []);
      setApiTasks((current) => current ?? []);
      setApiInboxTasks((current) => current ?? []);
      setApiProjects((current) => current ?? []);
      setApiAreas((current) => current ?? []);
      setApiOrganizations((current) => current ?? []);
      setApiContacts((current) => current ?? []);
      setApiLetters((current) => current ?? []);
      setApiHabits((current) => current ?? []);
    };
    void (async () => {
      try {
        const [
          documentsBody,
          tasksBody,
          inboxTasksBody,
          projectsBody,
          areasBody,
          orgsBody,
          contactsBody,
          lettersBody,
        ] = await Promise.all([
          client.requestJson<{ documents: ApiDocument[] }>(
            "/api/v1/documents",
            { signal },
          ),
          client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks", { signal }),
          client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks/inbox", {
            signal,
          }),
          client.requestJson<{ projects: ApiProject[] }>("/api/v1/projects", {
            signal,
          }),
          client.requestJson<{ areas: ApiArea[] }>("/api/v1/areas", { signal }),
          client.requestJson<{ organizations: ApiOrganization[] }>(
            "/api/v1/organizations",
            { signal },
          ),
          client.requestJson<{ contacts: ApiContact[] }>("/api/v1/contacts", {
            signal,
          }),
          client.requestJson<{ letters: ApiLetter[] }>("/api/v1/letters", {
            signal,
          }),
        ]);
        if (cancelled) return;
        setApiDocuments(documentsBody.documents);
        setApiTasks(tasksBody.tasks);
        setApiInboxTasks(inboxTasksBody.tasks);
        setApiProjects(projectsBody.projects);
        setApiAreas(areasBody.areas);
        setApiOrganizations(orgsBody.organizations);
        setApiContacts(contactsBody.contacts);
        setApiLetters((current) =>
          preservePendingApiRows(current, lettersBody.letters),
        );
      } catch {
        if (cancelled) return;
        markHydrated();
      }

      try {
        const habitsBody = await client.requestJson<{ habits: ApiHabit[] }>(
          "/api/v1/habits",
          { signal },
        );
        if (cancelled) return;
        setApiHabits(habitsBody.habits);
        const tasksAfterHabits = await client.requestJson<{
          tasks: ApiTask[];
        }>("/api/v1/tasks", { signal });
        if (cancelled) return;
        setApiTasks(tasksAfterHabits.tasks);
      } catch {
        if (cancelled) return;
        setApiHabits((current) => current ?? []);
      } finally {
        if (!cancelled) {
          markHydrated();
          setRestHydrateSettled(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, client, syncEpoch]);

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
  );
  const rawInboxTasks = dropStaleLocalHabitTasks(
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
  );
  // Merge like contacts/projects — an empty PowerSync snapshot must not hide
  // REST letters (create then navigate used to vanish from the side list).
  const rawLetters = mergeLocalAndApiByUpdatedAt(
    localLetters.data?.map((row) => snakeRow(row) as ApiLetter),
    apiLetters,
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

  const toSnakeFields = useCallback((values: Record<string, unknown>) => {
    const snake: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`,
      );
      if (value === true) {
        snake[snakeKey] = 1;
      } else if (value === false) {
        snake[snakeKey] = 0;
      } else if (value !== null && typeof value === "object") {
        // PowerSync text columns (e.g. social_accounts) store JSON as text.
        snake[snakeKey] = JSON.stringify(value);
      } else {
        snake[snakeKey] = value;
      }
    }
    return snake;
  }, []);

  const seedDocumentLocal = useCallback(
    async (document: ApiDocument) => {
      if (!powerSync.ready || !powerSync.createMetadata) return;
      try {
        await powerSync.createMetadata(
          "documents",
          toSnakeFields({
            type: document.type,
            projectId: document.projectId ?? null,
            parentId: document.parentId ?? null,
            kind: document.kind ?? "document",
            icon: document.icon ?? null,
            sortOrder: document.sortOrder ?? 0,
            journalDate: document.journalDate ?? null,
            path: document.path,
            title: document.title,
            storageKey: document.storageKey ?? "",
            contentType: document.contentType ?? "text/markdown",
            byteSize: document.byteSize ?? 0,
            checksum: document.checksum ?? null,
            snippet: document.snippet ?? null,
            contentVersion: document.contentVersion ?? 1,
            contentEtag: document.contentEtag ?? null,
          }),
          document.id,
        );
      } catch {
        // Non-fatal: download sync will eventually bring the row in.
      }
    },
    [powerSync, toSnakeFields],
  );

  const entityPatchPath = useCallback((table: string, id: string) => {
    if (table === "tasks") return `/api/v1/tasks/${encodeURIComponent(id)}`;
    if (table === "projects")
      return `/api/v1/projects/${encodeURIComponent(id)}`;
    if (table === "letters")
      return `/api/v1/letters/${encodeURIComponent(id)}`;
    if (table === "contacts")
      return `/api/v1/contacts/${encodeURIComponent(id)}`;
    if (table === "documents")
      return `/api/v1/documents/${encodeURIComponent(id)}`;
    return `/api/v1/organizations/${encodeURIComponent(id)}`;
  }, []);

  const applyApiTaskPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      const patchRows = (rows: ApiTask[] | null): ApiTask[] | null => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({ ...row, ...values, updatedAt: nextUpdatedAt } as ApiTask)
            : row,
        );
      };
      setApiTasks(patchRows);
      setApiInboxTasks(patchRows);
    },
    [],
  );

  const applyApiProjectPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      setApiProjects((rows) => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({ ...row, ...values, updatedAt: nextUpdatedAt } as ApiProject)
            : row,
        );
      });
    },
    [],
  );

  const applyApiOrganizationPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      setApiOrganizations((rows) => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({
                ...row,
                ...values,
                updatedAt: nextUpdatedAt,
              } as ApiOrganization)
            : row,
        );
      });
    },
    [],
  );

  const applyApiContactPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      setApiContacts((rows) => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({ ...row, ...values, updatedAt: nextUpdatedAt } as ApiContact)
            : row,
        );
      });
    },
    [],
  );

  const applyApiLetterPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      setApiLetters((rows) => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({ ...row, ...values, updatedAt: nextUpdatedAt } as ApiLetter)
            : row,
        );
      });
    },
    [],
  );

  const softRefreshApiTasks = useCallback(async () => {
    if (!authenticated) return;
    try {
      const [tasksBody, inboxTasksBody] = await Promise.all([
        client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks"),
        client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks/inbox"),
      ]);
      setApiTasks(tasksBody.tasks);
      setApiInboxTasks(inboxTasksBody.tasks);
    } catch {
      // PowerSync remains the primary source.
    }
  }, [authenticated, client]);

  const softRefreshApiProjects = useCallback(async () => {
    if (!authenticated) return;
    try {
      const projectsBody = await client.requestJson<{ projects: ApiProject[] }>(
        "/api/v1/projects",
      );
      setApiProjects(projectsBody.projects);
    } catch {
      // PowerSync remains the primary source.
    }
  }, [authenticated, client]);

  const patchViaPowerSyncOrApi = useCallback(
    async (
      table: string,
      id: string,
      values: Record<string, unknown>,
    ): Promise<{ number?: number } | void> => {
      const path = entityPatchPath(table, id);

      const applyTaskServerRow = async (row: ApiTask | null | undefined) => {
        if (!row || table !== "tasks") return;
        const serverValues: Record<string, unknown> = {
          ...values,
          ...(typeof row.number === "number" ? { number: row.number } : {}),
          ...(row.projectId !== undefined ? { projectId: row.projectId } : {}),
        };
        applyApiTaskPatch(id, serverValues);
        // Scope moves renumber server-side; keep local SQLite in sync so the
        // display id / route slug match before PowerSync pull catches up.
        if (
          powerSync.ready &&
          powerSync.patchMetadata &&
          typeof row.number === "number" &&
          row.number !== values.number
        ) {
          try {
            await powerSync.patchMetadata("tasks", id, {
              number: row.number,
            });
          } catch (error) {
            console.warn("[desktop] local task number sync failed", error);
          }
        }
      };

      // Match Next.js: optimistic local SQLite + REST so other clients see
      // changes even when the PowerSync upload queue is slow or stalled.
      if (powerSync.ready && powerSync.patchMetadata) {
        try {
          await powerSync.patchMetadata(
            table as
              | "tasks"
              | "projects"
              | "letters"
              | "contacts"
              | "organizations"
              | "documents",
            id,
            toSnakeFields(values),
          );
        } catch (error) {
          // Local SQLite may lag schema (e.g. new columns). Still hit REST.
          console.warn("[desktop] local metadata patch failed", error);
        }
        // Optimistic API cache — REST-created orgs/contacts may not exist in
        // local SQLite yet, so side panels would stay stale without this.
        if (table === "organizations") {
          applyApiOrganizationPatch(id, values);
        }
        if (table === "contacts") {
          applyApiContactPatch(id, values);
        }
        if (table === "letters") {
          applyApiLetterPatch(id, values);
        }
        if (table === "tasks") {
          // Optimistic so agentChatId / status show in lists before REST returns.
          applyApiTaskPatch(id, values);
          if (typeof values.status === "string") {
            nudgeDynamicIslandTasksRefresh();
          }
        }
        if (!authenticated) return;
        try {
          const updated =
            table === "tasks"
              ? await client.requestJson<ApiTask>(path, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(values),
                })
              : await client.requestJson(path, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(values),
                });
          if (table === "tasks") {
            await applyTaskServerRow(updated as ApiTask);
            // Re-fetch when links / agent chat binding change so merge can fill
            // local SQLite gaps (stale schema often omits new columns).
            if ("links" in values || "agentChatId" in values) {
              void softRefreshApiTasks();
            }
            return typeof (updated as ApiTask)?.number === "number"
              ? { number: (updated as ApiTask).number }
              : undefined;
          }
          if (table === "projects") {
            applyApiProjectPatch(id, values);
            // Re-fetch when type / codebase binding changes so merge can fill
            // local SQLite gaps after restart.
            if (
              "type" in values ||
              "key" in values ||
              "githubRepository" in values ||
              "localWorkingDirectory" in values
            ) {
              void softRefreshApiProjects();
            }
          }
          if (table === "organizations") {
            applyApiOrganizationPatch(id, values);
          }
        } catch (error) {
          // Local write + upload queue remain the source of truth if REST fails —
          // except agent chat binding, which must land in Postgres.
          if ("agentChatId" in values) {
            throw error instanceof Error
              ? error
              : new Error("Could not persist agent chat on the task.");
          }
          if ("moneybirdContactId" in values) {
            throw error instanceof Error
              ? error
              : new Error("Could not link Moneybird contact on the organization.");
          }
        }
        return;
      }
      if (!authenticated) return;
      if (table === "tasks") {
        const updated = await client.requestJson<ApiTask>(path, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(values),
        });
        await applyTaskServerRow(updated);
        if ("links" in values || "agentChatId" in values) {
          void softRefreshApiTasks();
        }
        return typeof updated?.number === "number"
          ? { number: updated.number }
          : undefined;
      }
      await client.requestJson(path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (table === "projects") {
        applyApiProjectPatch(id, values);
        if (
          "type" in values ||
          "githubRepository" in values ||
          "localWorkingDirectory" in values
        ) {
          void softRefreshApiProjects();
        }
      }
      if (table === "organizations") {
        applyApiOrganizationPatch(id, values);
      }
      if (table === "contacts") {
        applyApiContactPatch(id, values);
      }
      if (table === "letters") {
        applyApiLetterPatch(id, values);
      }
    },
    [
      applyApiContactPatch,
      applyApiLetterPatch,
      applyApiOrganizationPatch,
      applyApiProjectPatch,
      applyApiTaskPatch,
      authenticated,
      client,
      entityPatchPath,
      powerSync,
      softRefreshApiProjects,
      softRefreshApiTasks,
      toSnakeFields,
    ],
  );

  type SoftDeletableTable =
    | "tasks"
    | "projects"
    | "letters"
    | "contacts"
    | "organizations"
    | "documents";

  const removeFromApiCache = useCallback((table: SoftDeletableTable, id: string) => {
    if (table === "tasks") {
      setApiTasks((rows) => rows?.filter((row) => row.id !== id) ?? null);
      setApiInboxTasks((rows) => rows?.filter((row) => row.id !== id) ?? null);
      return;
    }
    if (table === "projects") {
      setApiProjects((rows) => rows?.filter((row) => row.id !== id) ?? null);
      return;
    }
    if (table === "letters") {
      setApiLetters((rows) => rows?.filter((row) => row.id !== id) ?? null);
      return;
    }
    if (table === "contacts") {
      setApiContacts((rows) => rows?.filter((row) => row.id !== id) ?? null);
      return;
    }
    if (table === "organizations") {
      setApiOrganizations((rows) => rows?.filter((row) => row.id !== id) ?? null);
      return;
    }
    setApiDocuments((rows) => rows?.filter((row) => row.id !== id) ?? null);
  }, []);

  const softDeleteViaPowerSyncOrApi = useCallback(
    async (table: SoftDeletableTable, id: string) => {
      const path = entityPatchPath(table, id);
      if (powerSync.ready && powerSync.patchMetadata) {
        await powerSync.patchMetadata(table, id, {
          deleted_at: new Date().toISOString(),
        });
        if (!authenticated) {
          throw new Error("Sign in to delete.");
        }
        try {
          await client.requestJson(path, { method: "DELETE" });
          removeFromApiCache(table, id);
        } catch {
          // Soft-delete remains queued for PowerSync upload.
        }
        return;
      }
      if (!authenticated) {
        throw new Error("Sign in to delete.");
      }
      await client.requestJson(path, { method: "DELETE" });
      removeFromApiCache(table, id);
    },
    [authenticated, client, entityPatchPath, powerSync, removeFromApiCache],
  );

  const entityKeyFromName = useCallback((name: string, fallback: string) => {
    const base = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 6);
    return (base || fallback) + Math.floor(Math.random() * 90 + 10);
  }, []);

  const createOrganization = useCallback(
    async (input: { name: string }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Organization name is required.");
      if (!authenticated) throw new Error("Sign in to create organizations.");
      const key = entityKeyFromName(name, "org");
      // Prefer REST (same as areas). PowerSync-only inserts can appear briefly then
      // vanish when upload is skipped/fails and the next sync drops the local row.
      const organization = await client.requestJson<ApiOrganization>(
        "/api/v1/organizations",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            key,
            name,
            sortOrder: Date.now(),
          }),
        },
      );
      setApiOrganizations((rows) => {
        const next = rows ? [...rows] : [];
        if (!next.some((entry) => entry.id === organization.id)) {
          next.push(organization);
        }
        return next;
      });
      return { id: organization.id, key: organization.key };
    },
    [authenticated, client, entityKeyFromName],
  );

  const createContact = useCallback(
    async (input: { name: string; organizationId?: string | null }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Contact name is required.");
      if (!authenticated) throw new Error("Sign in to create contacts.");
      const key = entityKeyFromName(name, "person");
      const contact = await client.requestJson<ApiContact>("/api/v1/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          name,
          organizationId: input.organizationId ?? null,
          sortOrder: Date.now(),
        }),
      });
      setApiContacts((rows) => {
        const next = rows ? [...rows] : [];
        if (!next.some((entry) => entry.id === contact.id)) {
          next.push(contact);
        }
        return next;
      });
      return { id: contact.id, key: contact.key };
    },
    [authenticated, client, entityKeyFromName],
  );

  const createProject = useCallback(
    async (input: {
      name: string;
      status?: string;
      area?: string | null;
      organizationId?: string | null;
      type?: string;
    }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Project name is required.");
      if (!authenticated) throw new Error("Sign in to create projects.");
      const base = name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 3);
      const key = base.length >= 2 ? base : "PRJ";
      const body = {
        key,
        name,
        status: input.status ?? "backlog",
        area: input.area ?? null,
        sortOrder: -Date.now(),
        organizationId: input.organizationId ?? null,
        ...(input.type ? { type: input.type } : {}),
      };
      // API-first (same as tasks / orgs): PowerSync-only creates skip vault
      // setup and can vanish or 404 until upload succeeds.
      const project = await client.requestJson<ApiProject>("/api/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setApiProjects((rows) => {
        if (!rows) return [project];
        if (rows.some((entry) => entry.id === project.id)) return rows;
        return [project, ...rows];
      });
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "projects",
            toSnakeFields({
              key: project.key,
              name: project.name,
              status: project.status,
              area: input.area ?? null,
              sortOrder: body.sortOrder,
              organizationId: project.organizationId ?? null,
              ...(project.type ? { type: project.type } : {}),
            }),
            project.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      return { id: project.id, key: project.key };
    },
    [authenticated, client, powerSync, toSnakeFields],
  );

  const createArea = useCallback(
    async (input: {
      name: string;
      parent: "personal" | "business" | "clients";
    }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Area name is required.");
      if (!authenticated) throw new Error("Sign in to create areas.");
      const area = await client.requestJson<ApiArea>("/api/v1/areas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          parent: input.parent,
          sortOrder: Date.now(),
        }),
      });
      setApiAreas((rows) => {
        const next = rows ? [...rows] : [];
        if (!next.some((entry) => entry.id === area.id)) next.push(area);
        return next;
      });
      return { id: area.id };
    },
    [authenticated, client],
  );

  const softDeleteArea = useCallback(
    async (id: string) => {
      if (!authenticated) throw new Error("Sign in to delete areas.");
      // Reassign projects to the parent bucket before soft-deleting the area.
      const affected = rawProjects.filter((project) => project.areaId === id);
      await Promise.all(
        affected.map((project) =>
          patchViaPowerSyncOrApi("projects", project.id, { areaId: null }),
        ),
      );
      await client.requestJson(`/api/v1/areas/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setApiAreas((rows) => rows?.filter((area) => area.id !== id) ?? null);
    },
    [authenticated, client, patchViaPowerSyncOrApi, rawProjects],
  );

  const reloadHabits = useCallback(async () => {
    if (!authenticated) return [];
    const body = await client.requestJson<{ habits: ApiHabit[] }>(
      "/api/v1/habits",
    );
    const tasksBody = await client.requestJson<{ tasks: ApiTask[] }>(
      "/api/v1/tasks",
    );
    setApiHabits(body.habits);
    setApiTasks(tasksBody.tasks);
    return body.habits;
  }, [authenticated, client]);

  const createHabit = useCallback(
    async (input: { title: string; icon?: string | null }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Habit title is required.");
      if (!authenticated) throw new Error("Sign in to create habits.");
      const habit = await client.requestJson<ApiHabit>("/api/v1/habits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
        }),
      });
      setApiHabits((rows) => {
        if (!rows) return [habit];
        if (rows.some((entry) => entry.id === habit.id)) {
          return rows.map((entry) => (entry.id === habit.id ? habit : entry));
        }
        return [habit, ...rows];
      });
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "habits",
            toSnakeFields({
              title: habit.title,
              icon: habit.icon,
              projectId: habit.projectId,
              cadence: habit.cadence,
              cadenceAnchorYmd: habit.cadenceAnchorYmd,
              sortOrder: habit.sortOrder,
            }),
            habit.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      if (habit.todayTaskId) {
        try {
          const task = await client.requestJson<ApiTask>(
            `/api/v1/tasks/${encodeURIComponent(habit.todayTaskId)}`,
          );
          setApiTasks((rows) => {
            if (!rows) return [task];
            if (rows.some((entry) => entry.id === task.id)) return rows;
            return [task, ...rows];
          });
          if (powerSync.ready && powerSync.createMetadata) {
            try {
              await powerSync.createMetadata(
                "tasks",
                toSnakeFields({
                  title: task.title,
                  projectId: task.projectId,
                  contactId: task.contactId,
                  assigneeId: task.assigneeId,
                  number: task.number,
                  description: task.description,
                  status: task.status,
                  priority: task.priority,
                  sortOrder: task.sortOrder,
                  dueDate: task.dueDate,
                  inbox: task.inbox,
                  habitId: task.habitId,
                  completedAt: task.completedAt,
                }),
                task.id,
              );
            } catch {
              // Download sync will eventually bring the row in.
            }
          }
        } catch {
          // Habit row is enough; the task list will catch up on refresh.
        }
      }
      return habit;
    },
    [authenticated, client, powerSync, toSnakeFields],
  );

  const updateHabit = useCallback(
    async (
      id: string,
      input: {
        title?: string;
        cadence?: ApiHabit["cadence"];
        icon?: string | null;
        description?: string | null;
        projectId?: string;
        nextDueYmd?: string;
      },
    ) => {
      if (!authenticated) throw new Error("Sign in to update habits.");
      const habit = await client.requestJson<ApiHabit>(
        `/api/v1/habits/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      setApiHabits((rows) => {
        if (!rows) return [habit];
        return rows.map((entry) => (entry.id === habit.id ? habit : entry));
      });
      if (powerSync.ready && powerSync.patchMetadata) {
        try {
          await powerSync.patchMetadata(
            "habits",
            habit.id,
            toSnakeFields({
              title: habit.title,
              description: habit.description,
              cadence: habit.cadence,
              cadenceAnchorYmd: habit.cadenceAnchorYmd,
              icon: habit.icon,
              projectId: habit.projectId,
            }),
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      await reloadHabits();
      if (input.nextDueYmd !== undefined) {
        await softRefreshApiTasks();
      }
      return habit;
    },
    [
      authenticated,
      client,
      powerSync,
      reloadHabits,
      softRefreshApiTasks,
      toSnakeFields,
    ],
  );

  const recordHabitDay = useCallback(
    async (
      habitId: string,
      input: { dueYmd: string; status: "completed" | "canceled" },
    ) => {
      if (!authenticated) throw new Error("Sign in to record habit days.");
      const task = await client.requestJson<ApiTask>(
        `/api/v1/habits/${encodeURIComponent(habitId)}/days`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      setApiTasks((rows) => {
        if (!rows) return [task];
        if (rows.some((entry) => entry.id === task.id)) {
          return rows.map((entry) => (entry.id === task.id ? task : entry));
        }
        return [task, ...rows];
      });
      if (powerSync.ready) {
        const fields = toSnakeFields({
          title: task.title,
          status: task.status,
          priority: task.priority,
          sortOrder: task.sortOrder,
          projectId: task.projectId,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate,
          habitId: task.habitId,
          inbox: task.inbox,
          number: task.number,
          completedAt: task.completedAt,
        });
        try {
          if (powerSync.patchMetadata) {
            await powerSync.patchMetadata("tasks", task.id, {
              status: task.status,
              completed_at: task.completedAt,
              habit_id: task.habitId,
              due_date: task.dueDate,
            });
          }
        } catch {
          try {
            await powerSync.createMetadata?.("tasks", fields, task.id);
          } catch {
            // Download sync will eventually bring the row in.
          }
        }
      }
      await reloadHabits();
      return task;
    },
    [authenticated, client, powerSync, reloadHabits, toSnakeFields],
  );

  const createInboxTask = useCallback(
    async (input: {
      title: string;
      description?: string;
      status?: string;
      priority?: number;
      assigneeId?: string | null;
      dueDate?: string | null;
      links?: TaskLink[];
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Task title is required.");
      if (!authenticated) throw new Error("Sign in to create inbox tasks.");
      const body = {
        title,
        ...(input.description?.trim()
          ? { description: input.description.trim() }
          : {}),
        status: input.status ?? "triage",
        priority: input.priority ?? 0,
        sortOrder: Date.now(),
        assigneeId: resolveCreateAssigneeId(input.assigneeId),
        dueDate: toApiDueDateIso(input.dueDate),
        inbox: true,
        projectId: null,
        ...(input.links && input.links.length > 0 ? { links: input.links } : {}),
      };
      // API-first so the task has a durable id + number before navigation
      // (PowerSync-only creates raced the query and showed "Task not found").
      let task: ApiTask;
      try {
        task = await client.requestJson<ApiTask>("/api/v1/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        // Stale default assignee — retry unassigned once.
        if (
          body.assigneeId &&
          error instanceof Error &&
          (error.message.toLowerCase().includes("assignee") ||
            ("code" in error &&
              (error as { code?: string }).code === "assignee_not_found"))
        ) {
          task = await client.requestJson<ApiTask>("/api/v1/tasks", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, assigneeId: null }),
          });
        } else {
          throw error;
        }
      }
      setApiTasks((rows) => {
        if (!rows) return [task];
        if (rows.some((entry) => entry.id === task.id)) return rows;
        return [task, ...rows];
      });
      setApiInboxTasks((rows) => {
        if (!rows) return [task];
        if (rows.some((entry) => entry.id === task.id)) return rows;
        return [task, ...rows];
      });
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "tasks",
            toSnakeFields({ ...body, number: task.number }),
            task.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      return { id: task.id, number: task.number ?? null };
    },
    [authenticated, client, powerSync, toSnakeFields],
  );

  const createProjectTask = useCallback(
    async (input: {
      projectId: string;
      title: string;
      description?: string;
      status?: string;
      priority?: number;
      assigneeId?: string | null;
      dueDate?: string | null;
      links?: TaskLink[];
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Task title is required.");
      if (!input.projectId.trim()) throw new Error("Project is required.");
      if (!authenticated) throw new Error("Sign in to create tasks.");
      const body = {
        projectId: input.projectId,
        title,
        ...(input.description?.trim()
          ? { description: input.description.trim() }
          : {}),
        status: input.status ?? "ready_to_start",
        priority: input.priority ?? 0,
        sortOrder: Date.now(),
        assigneeId: resolveCreateAssigneeId(input.assigneeId),
        dueDate: toApiDueDateIso(input.dueDate),
        inbox: false,
        ...(input.links && input.links.length > 0 ? { links: input.links } : {}),
      };
      // API-first — same rationale as createInboxTask / createLetter.
      let task: ApiTask;
      try {
        task = await client.requestJson<ApiTask>("/api/v1/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        if (
          body.assigneeId &&
          error instanceof Error &&
          (error.message.toLowerCase().includes("assignee") ||
            ("code" in error &&
              (error as { code?: string }).code === "assignee_not_found"))
        ) {
          task = await client.requestJson<ApiTask>("/api/v1/tasks", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, assigneeId: null }),
          });
        } else {
          throw error;
        }
      }
      setApiTasks((rows) => {
        if (!rows) return [task];
        if (rows.some((entry) => entry.id === task.id)) return rows;
        return [task, ...rows];
      });
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "tasks",
            toSnakeFields({ ...body, number: task.number }),
            task.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      return { id: task.id, number: task.number ?? null };
    },
    [authenticated, client, powerSync, toSnakeFields],
  );

  const createTaskFromBody = useCallback(
    async (body: Record<string, unknown>) => {
      let task: ApiTask;
      try {
        task = await client.requestJson<ApiTask>("/api/v1/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        if (
          body.assigneeId &&
          error instanceof Error &&
          (error.message.toLowerCase().includes("assignee") ||
            ("code" in error &&
              (error as { code?: string }).code === "assignee_not_found"))
        ) {
          task = await client.requestJson<ApiTask>("/api/v1/tasks", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, assigneeId: null }),
          });
        } else {
          throw error;
        }
      }

      setApiTasks((rows) => {
        if (!rows) return [task];
        if (rows.some((entry) => entry.id === task.id)) return rows;
        return [task, ...rows];
      });
      if (task.inbox) {
        setApiInboxTasks((rows) => {
          if (!rows) return [task];
          if (rows.some((entry) => entry.id === task.id)) return rows;
          return [task, ...rows];
        });
      }
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "tasks",
            toSnakeFields({ ...body, number: task.number }),
            task.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      return task;
    },
    [client, powerSync, toSnakeFields],
  );

  const duplicateTask = useCallback(
    async (sourceId: string) => {
      if (!authenticated) throw new Error("Sign in to duplicate tasks.");
      const source =
        rawTasks.find((entry) => entry.id === sourceId) ??
        rawInboxTasks.find((entry) => entry.id === sourceId) ??
        null;
      if (!source) {
        throw new Error("Task not found.");
      }

      const title = source.title.trim();
      if (!title) throw new Error("Task title is required.");

      const links = cloneTaskLinksForDuplicate(parseTaskLinks(source.links));
      const body = {
        title,
        ...(source.description?.trim()
          ? { description: source.description.trim() }
          : {}),
        status: resolveDuplicateTaskStatus(source),
        priority: source.priority ?? 0,
        sortOrder: Date.now(),
        assigneeId: resolveCreateAssigneeId(source.assigneeId),
        dueDate: toApiDueDateIso(source.dueDate),
        projectId: source.projectId ?? null,
        contactId: source.contactId ?? null,
        inbox: Boolean(source.inbox),
        ...(links.length > 0 ? { links } : {}),
      };

      const task = await createTaskFromBody(body);
      return { id: task.id, number: task.number ?? null };
    },
    [
      authenticated,
      createTaskFromBody,
      rawInboxTasks,
      rawTasks,
    ],
  );

  const duplicateProject = useCallback(
    async (sourceId: string, options?: { includeTasks?: boolean }) => {
      if (!authenticated) throw new Error("Sign in to duplicate projects.");
      const source =
        rawProjects.find((entry) => entry.id === sourceId) ?? null;
      if (!source) {
        throw new Error("Project not found.");
      }

      const name = source.name.trim();
      if (!name) throw new Error("Project name is required.");

      const existingKeys = rawProjects.map((project) => project.key);
      const keyCandidates = [
        allocateUniqueProjectKey(source.key, existingKeys),
        ...Array.from({ length: 12 }, (_, index) =>
          allocateUniqueProjectKey(
            `${source.key}${index + 2}`,
            existingKeys,
          ),
        ),
      ];
      const uniqueCandidates = [...new Set(keyCandidates)];

      const bodyBase = {
        name: `${name} copy`,
        ...(source.summary?.trim() ? { summary: source.summary.trim() } : {}),
        ...(source.description?.trim()
          ? { description: source.description.trim() }
          : {}),
        organizationId: source.organizationId ?? null,
        areaId: source.areaId ?? null,
        area: source.area ?? null,
        startDate: source.startDate ?? null,
        dueDate: source.dueDate ?? null,
        icon: source.icon ?? null,
        color: source.color ?? null,
        type: source.type ?? "general",
        status: source.status ?? "backlog",
        priority: source.priority ?? 0,
        sortOrder: -Date.now(),
      };

      let project: ApiProject | null = null;
      let lastError: unknown = null;
      for (const key of uniqueCandidates) {
        try {
          project = await client.requestJson<ApiProject>("/api/v1/projects", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...bodyBase, key }),
          });
          break;
        } catch (error) {
          lastError = error;
          const isKeyConflict =
            error instanceof Error &&
            (error.message.toLowerCase().includes("project key") ||
              ("code" in error &&
                (error as { code?: string }).code === "project_key_exists"));
          if (!isKeyConflict) {
            throw error;
          }
          existingKeys.push(key);
        }
      }
      if (!project) {
        throw lastError instanceof Error
          ? lastError
          : new Error("Failed to duplicate project.");
      }
      const createdProject = project;

      setApiProjects((rows) => {
        if (!rows) return [createdProject];
        if (rows.some((entry) => entry.id === createdProject.id)) return rows;
        return [createdProject, ...rows];
      });
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "projects",
            toSnakeFields({
              key: createdProject.key,
              name: createdProject.name,
              status: createdProject.status,
              area: createdProject.area ?? null,
              sortOrder: bodyBase.sortOrder,
              organizationId: createdProject.organizationId ?? null,
              ...(createdProject.type ? { type: createdProject.type } : {}),
            }),
            createdProject.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }

      if (options?.includeTasks) {
        const sourceTasks = [...rawTasks, ...rawInboxTasks]
          .filter((task) => task.projectId === source.id && !task.deletedAt)
          .sort((a, b) => {
            const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
            if (order !== 0) return order;
            return (a.number ?? 0) - (b.number ?? 0);
          });

        // Deduplicate by id (task may appear in both lists).
        const seen = new Set<string>();
        let sortBase = Date.now();
        for (const sourceTask of sourceTasks) {
          if (seen.has(sourceTask.id)) continue;
          seen.add(sourceTask.id);
          const title = sourceTask.title.trim();
          if (!title) continue;
          const links = cloneTaskLinksForDuplicate(
            parseTaskLinks(sourceTask.links),
          );
          await createTaskFromBody({
            projectId: createdProject.id,
            title,
            ...(sourceTask.description?.trim()
              ? { description: sourceTask.description.trim() }
              : {}),
            status: resolveDuplicateTaskStatus(sourceTask),
            priority: sourceTask.priority ?? 0,
            sortOrder: sortBase++,
            assigneeId: resolveCreateAssigneeId(sourceTask.assigneeId),
            dueDate: toApiDueDateIso(sourceTask.dueDate),
            contactId: sourceTask.contactId ?? null,
            inbox: false,
            ...(links.length > 0 ? { links } : {}),
          });
        }
      }

      return { id: createdProject.id, key: createdProject.key };
    },
    [
      authenticated,
      client,
      createTaskFromBody,
      powerSync,
      rawInboxTasks,
      rawProjects,
      rawTasks,
      toSnakeFields,
    ],
  );

  const createLetter = useCallback(
    async (input: {
      title: string;
      body?: string;
      status?: string;
      organizationId?: string | null;
      contactId?: string | null;
      projectId?: string | null;
      dueDate?: string | null;
      receivedDate?: string | null;
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Letter title is required.");
      const body = {
        title,
        projectId: input.projectId ?? null,
        organizationId: input.organizationId ?? null,
        contactId: input.contactId ?? null,
        status: input.status ?? "triage",
        dueDate: input.dueDate ?? null,
        // Default Received Date to today so PDF filing has a date immediately;
        // callers can still override or clear it later.
        receivedDate: input.receivedDate ?? new Date().toISOString(),
        context: input.body?.trim() || null,
        sortOrder: -Date.now(),
      };
      if (!authenticated) throw new Error("Sign in to create letters.");
      // API-first (Next parity): PDF upload needs a server id immediately.
      const letter = await client.requestJson<ApiLetter>("/api/v1/letters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      // Optimistic list seed — same pattern as createInboxTask — so the side
      // panel shows the letter before PowerSync download catches up.
      setApiLetters((rows) => {
        if (!rows) return [letter];
        if (rows.some((entry) => entry.id === letter.id)) {
          return rows.map((entry) =>
            entry.id === letter.id ? letter : entry,
          );
        }
        return [letter, ...rows];
      });
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "letters",
            toSnakeFields(letter as unknown as Record<string, unknown>),
            letter.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      return { id: letter.id, number: letter.number };
    },
    [authenticated, client, powerSync, toSnakeFields],
  );

  const createKnowledgeDocument = useCallback(
    async (input: {
      title: string;
      content?: string;
      folderPath?: string;
      parentId?: string | null;
    }) => {
      const title = input.title.trim() || "Untitled";
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "untitled";
      const folder = input.folderPath?.trim().replace(/^\/+|\/+$/g, "") ?? "";
      const path = folder ? `${folder}/${slug}.md` : `${slug}.md`;
      if (!authenticated) throw new Error("Sign in to create documents.");
      const document = await client.requestJson<ApiDocument>(
        "/api/v1/documents",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "knowledge",
            title,
            path,
            content: input.content ?? "",
            parentId: input.parentId ?? undefined,
          }),
        },
      );
      await seedDocumentLocal(document);
      return {
        id: document.id,
        path: document.path,
        contentVersion: document.contentVersion,
      };
    },
    [authenticated, client, seedDocumentLocal],
  );

  const createProjectDocument = useCallback(
    async (input: {
      projectId: string;
      title: string;
      content?: string;
      folderPath?: string;
      parentId?: string | null;
    }) => {
      const title = input.title.trim() || "Untitled";
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "untitled";
      const folder = input.folderPath?.trim().replace(/^\/+|\/+$/g, "") ?? "";
      const path = folder ? `${folder}/${slug}.md` : `${slug}.md`;
      if (!authenticated) throw new Error("Sign in to create documents.");
      const document = await client.requestJson<ApiDocument>(
        "/api/v1/documents",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "project",
            projectId: input.projectId,
            title,
            path,
            content: input.content ?? "",
            parentId: input.parentId ?? undefined,
          }),
        },
      );
      await seedDocumentLocal(document);
      return {
        id: document.id,
        path: document.path,
        contentVersion: document.contentVersion,
      };
    },
    [authenticated, client, seedDocumentLocal],
  );

  const createKnowledgeFolder = useCallback(
    async (input: { title: string; parentId?: string | null }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Folder name is required.");
      const stamp = Date.now().toString(36);
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "folder";
      const path = `${slug}-${stamp}`;
      if (!authenticated) throw new Error("Sign in to create folders.");
      const document = await client.requestJson<ApiDocument>(
        "/api/v1/documents",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "knowledge",
            kind: "folder",
            title,
            path,
            parentId: input.parentId ?? undefined,
          }),
        },
      );
      await seedDocumentLocal(document);
      return { id: document.id, path: document.path };
    },
    [authenticated, client, seedDocumentLocal],
  );

  const createProjectFolder = useCallback(
    async (input: {
      projectId: string;
      title: string;
      parentId?: string | null;
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Folder name is required.");
      const stamp = Date.now().toString(36);
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "folder";
      const path = `${slug}-${stamp}`;
      if (!authenticated) throw new Error("Sign in to create folders.");
      const document = await client.requestJson<ApiDocument>(
        "/api/v1/documents",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "project",
            projectId: input.projectId,
            kind: "folder",
            title,
            path,
            parentId: input.parentId ?? undefined,
          }),
        },
      );
      await seedDocumentLocal(document);
      return { id: document.id, path: document.path };
    },
    [authenticated, client, seedDocumentLocal],
  );

  const renameDocument = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return { ok: false as const, error: "Title is required." };
      try {
        await patchViaPowerSyncOrApi("documents", id, { title: trimmed });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error ? error.message : "Could not rename.",
        };
      }
    },
    [patchViaPowerSyncOrApi],
  );

  const updateDocumentIcon = useCallback(
    async (id: string, icon: string | null) => {
      try {
        await patchViaPowerSyncOrApi("documents", id, { icon });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Could not update document icon.",
        };
      }
    },
    [patchViaPowerSyncOrApi],
  );

  const moveDocument = useCallback(
    async (id: string, parentId: string | null) => {
      try {
        if (powerSync.ready && powerSync.patchMetadata) {
          await powerSync.patchMetadata("documents", id, {
            parent_id: parentId,
          });
          return { ok: true as const };
        }
        if (!authenticated) {
          return { ok: false as const, error: "Sign in to move documents." };
        }
        await client.requestJson(
          `/api/v1/documents/${encodeURIComponent(id)}/move`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ parentId }),
          },
        );
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "Could not move.",
        };
      }
    },
    [authenticated, client, powerSync],
  );

  const reorderDocuments = useCallback(
    async (orderedIds: string[]) => {
      if (orderedIds.length === 0) {
        return {
          ok: false as const,
          error: "At least one document is required.",
        };
      }
      try {
        if (powerSync.ready && powerSync.patchMetadata) {
          await Promise.all(
            orderedIds.map((id, index) =>
              powerSync.patchMetadata!("documents", id, {
                sort_order: index,
              }),
            ),
          );
          return { ok: true as const };
        }
        if (!authenticated) {
          return {
            ok: false as const,
            error: "Sign in to reorder documents.",
          };
        }
        await client.requestJson("/api/v1/documents/reorder", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Could not reorder documents.",
        };
      }
    },
    [authenticated, client, powerSync],
  );

  const deleteDocument = useCallback(
    async (id: string) => {
      try {
        await softDeleteViaPowerSyncOrApi("documents", id);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "Could not delete.",
        };
      }
    },
    [softDeleteViaPowerSyncOrApi],
  );

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
    apiLetters !== null;

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
    patchContact: async (id, values) => {
      await patchViaPowerSyncOrApi("contacts", id, values);
    },
    patchOrganization: async (id, values) => {
      await patchViaPowerSyncOrApi("organizations", id, values);
    },
    softDeleteTask: (id) => softDeleteViaPowerSyncOrApi("tasks", id),
    softDeleteProject: (id) => softDeleteViaPowerSyncOrApi("projects", id),
    softDeleteLetter: (id) => softDeleteViaPowerSyncOrApi("letters", id),
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
