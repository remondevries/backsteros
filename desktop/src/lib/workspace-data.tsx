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
  Task as ApiTask,
  TaskLink,
} from "@backsteros/contracts";
import {
  buildInboxTaskListItem,
  taskBelongsInInbox,
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
import { resolveCreateAssigneeId } from "./default-assignee";
import {
  fillMissingAgentChatIdFromApi,
  fillMissingCodebaseFieldsFromApi,
  fillMissingLinksFromApi,
  fillMissingParentFromApi,
  fillMissingTypeFromApi,
  mergeLocalAndApiByUpdatedAt,
} from "./merge-local-and-api";
import { useDesktopPowerSync, usePowerSyncQuery } from "./powersync-context";
import { getDesktopPublicEnvironment } from "./env";
import { rememberProjectTypes } from "./project-type-cache";
import { noteLocalTaskStatusPatch } from "./agent/agent-status-notifications";

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
  patchTask: (id: string, values: Record<string, unknown>) => Promise<void>;
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
  createInboxTask: (input: {
    title: string;
    description?: string;
    status?: string;
    priority?: number;
    assigneeId?: string | null;
    dueDate?: string | null;
  }) => Promise<{ id: string; number: number | null }>;
  createProjectTask: (input: {
    projectId: string;
    title: string;
    description?: string;
    status?: string;
    priority?: number;
    assigneeId?: string | null;
    dueDate?: string | null;
  }) => Promise<{ id: string; number: number | null }>;
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
           OR status IN ('on_hold', 'in_review')
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
    }
  }, [authenticated]);

  const syncEpoch = powerSync.lastSyncedAt?.getTime() ?? 0;

  // Areas / organizations are created via REST (not PowerSync writeback). Always
  // hydrate from API so creates survive navigation even when PowerSync is the
  // primary source for other entities — local SQLite may lag or omit rows.
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const [areasBody, orgsBody, contactsBody] = await Promise.all([
          client.requestJson<{ areas: ApiArea[] }>("/api/v1/areas"),
          client.requestJson<{ organizations: ApiOrganization[] }>(
            "/api/v1/organizations",
          ),
          client.requestJson<{ contacts: ApiContact[] }>("/api/v1/contacts"),
        ]);
        if (cancelled) return;
        setApiAreas(areasBody.areas);
        setApiOrganizations(orgsBody.organizations);
        setApiContacts(contactsBody.contacts);
      } catch {
        // PowerSync / empty list remains usable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, client]);

  // Soft-revalidate documents + tasks + projects from API when sync checkpoints
  // advance so mergeLocalAndApiByUpdatedAt can surface remote creates / newer
  // columns (e.g. task.links, project.type) if local SQLite is stale.
  useEffect(() => {
    if (!authenticated || !powerSync.ready || !syncEpoch) return;
    let cancelled = false;
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
        ] = await Promise.all([
          client.requestJson<{ documents: ApiDocument[] }>(
            "/api/v1/documents",
          ),
          client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks"),
          client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks/inbox"),
          client.requestJson<{ projects: ApiProject[] }>("/api/v1/projects"),
          client.requestJson<{ areas: ApiArea[] }>("/api/v1/areas"),
          client.requestJson<{ organizations: ApiOrganization[] }>(
            "/api/v1/organizations",
          ),
          client.requestJson<{ contacts: ApiContact[] }>("/api/v1/contacts"),
        ]);
        if (cancelled) return;
        setApiDocuments(documentsBody.documents);
        setApiTasks(tasksBody.tasks);
        setApiInboxTasks(inboxTasksBody.tasks);
        setApiProjects(projectsBody.projects);
        setApiAreas(areasBody.areas);
        setApiOrganizations(orgsBody.organizations);
        setApiContacts(contactsBody.contacts);
      } catch {
        // PowerSync remains the primary source.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, client, powerSync.ready, syncEpoch]);

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
    const rows = mergeLocalAndApiByUpdatedAt(
      localOrganizations.data?.map(
        (row) => snakeRow(row) as ApiOrganization,
      ),
      apiOrganizations,
    );
    for (const org of rows) map.set(org.id, org);
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
  const rawTasks = fillMissingAgentChatIdFromApi(
    fillMissingLinksFromApi(
      mergeLocalAndApiByUpdatedAt(
        localTasks.data?.map((row) => snakeRow(row) as ApiTask),
        apiTasks,
      ),
      apiTasks,
    ),
    apiTasks,
  );
  const rawInboxTasks = fillMissingAgentChatIdFromApi(
    fillMissingLinksFromApi(
      mergeLocalAndApiByUpdatedAt(
        localInboxTasks.data?.map((row) => snakeRow(row) as ApiTask),
        apiInboxTasks,
      ),
      apiInboxTasks,
    ),
    apiInboxTasks,
  );
  const rawLetters =
    localLetters.data?.map((row) => snakeRow(row) as ApiLetter) ??
    apiLetters ??
    [];
  const rawContacts = mergeLocalAndApiByUpdatedAt(
    localContacts.data?.map((row) => snakeRow(row) as ApiContact),
    apiContacts,
  );
  const rawOrganizations = mergeLocalAndApiByUpdatedAt(
    localOrganizations.data?.map(
      (row) => snakeRow(row) as ApiOrganization,
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
      });
    });
  })();

  // Inbox is tasks-only (parity with Next). Letters live under /letters.
  const inboxItems = [...inboxTaskItems].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

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
    async (table: string, id: string, values: Record<string, unknown>) => {
      const path = entityPatchPath(table, id);
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
        }
        if (!authenticated) return;
        try {
          await client.requestJson(path, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(values),
          });
          if (table === "tasks") {
            applyApiTaskPatch(id, values);
            // Re-fetch when links / agent chat binding change so merge can fill
            // local SQLite gaps (stale schema often omits new columns).
            if ("links" in values || "agentChatId" in values) {
              void softRefreshApiTasks();
            }
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
        } catch (error) {
          // Local write + upload queue remain the source of truth if REST fails —
          // except agent chat binding, which must land in Postgres.
          if ("agentChatId" in values) {
            throw error instanceof Error
              ? error
              : new Error("Could not persist agent chat on the task.");
          }
        }
        return;
      }
      if (!authenticated) return;
      await client.requestJson(path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (table === "tasks") {
        applyApiTaskPatch(id, values);
        if ("links" in values || "agentChatId" in values) {
          void softRefreshApiTasks();
        }
      }
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
      if (powerSync.ready && powerSync.createMetadata) {
        const id = await powerSync.createMetadata(
          "projects",
          toSnakeFields(body),
        );
        // Vault folders are created on first open / agent start once the row
        // has synced to the core API (PowerSync create skips POST /projects).
        return { id, key };
      }
      if (!authenticated) throw new Error("Sign in to create projects.");
      const project = await client.requestJson<{ id: string; key: string }>(
        "/api/v1/projects",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return { id: project.id, key: project.key };
    },
    [
      authenticated,
      client,
      powerSync,
      toSnakeFields,
    ],
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

  const createInboxTask = useCallback(
    async (input: {
      title: string;
      description?: string;
      status?: string;
      priority?: number;
      assigneeId?: string | null;
      dueDate?: string | null;
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Task title is required.");
      const body = {
        title,
        description: input.description?.trim() || null,
        status: input.status ?? "triage",
        priority: input.priority ?? 0,
        sortOrder: Date.now(),
        assigneeId: resolveCreateAssigneeId(input.assigneeId),
        dueDate: input.dueDate ?? null,
        inbox: true,
        projectId: null,
      };
      if (powerSync.ready && powerSync.createMetadata) {
        const id = await powerSync.createMetadata(
          "tasks",
          toSnakeFields(body),
        );
        return { id, number: null };
      }
      if (!authenticated) throw new Error("Sign in to create inbox tasks.");
      const task = await client.requestJson<{ id: string; number?: number }>(
        "/api/v1/tasks",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
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
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Task title is required.");
      if (!input.projectId.trim()) throw new Error("Project is required.");
      const body = {
        projectId: input.projectId,
        title,
        description: input.description?.trim() || null,
        status: input.status ?? "ready_to_start",
        priority: input.priority ?? 0,
        sortOrder: Date.now(),
        assigneeId: resolveCreateAssigneeId(input.assigneeId),
        dueDate: input.dueDate ?? null,
        inbox: false,
      };
      if (powerSync.ready && powerSync.createMetadata) {
        const id = await powerSync.createMetadata(
          "tasks",
          toSnakeFields(body),
        );
        return { id, number: null };
      }
      if (!authenticated) throw new Error("Sign in to create tasks.");
      const task = await client.requestJson<{ id: string; number?: number }>(
        "/api/v1/tasks",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return { id: task.id, number: task.number ?? null };
    },
    [authenticated, client, powerSync, toSnakeFields],
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
        receivedDate: input.receivedDate ?? null,
        context: input.body?.trim() || null,
        sortOrder: -Date.now(),
      };
      if (!authenticated) throw new Error("Sign in to create letters.");
      // API-first (Next parity): PDF upload needs a server id immediately.
      const letter = await client.requestJson<{
        id: string;
        number: number | null;
      }>("/api/v1/letters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "letters",
            toSnakeFields({ ...body, number: letter.number }),
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
  // emission, merged lists are empty — treat that as not ready so detail
  // pages show skeletons instead of "not found".
  const queriesHydrating =
    authenticated &&
    powerSync.ready &&
    (localTasks.loading ||
      localInboxTasks.loading ||
      localProjects.loading ||
      localLetters.loading ||
      localContacts.loading ||
      localOrganizations.loading ||
      localAreas.loading ||
      localDocuments.loading);

  return {
    source,
    ready: !authenticated || (powerSync.ready && !queriesHydrating),
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
    patchTask: (id, values) => {
      if (typeof values.status === "string") {
        noteLocalTaskStatusPatch(id);
      }
      return patchViaPowerSyncOrApi("tasks", id, values);
    },
    patchProject: (id, values) =>
      patchViaPowerSyncOrApi("projects", id, values),
    patchLetter: (id, values) => patchViaPowerSyncOrApi("letters", id, values),
    patchContact: (id, values) =>
      patchViaPowerSyncOrApi("contacts", id, values),
    patchOrganization: (id, values) =>
      patchViaPowerSyncOrApi("organizations", id, values),
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
    createInboxTask,
    createProjectTask,
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
