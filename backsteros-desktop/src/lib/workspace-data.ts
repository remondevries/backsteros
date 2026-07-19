import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  Contact as ApiContact,
  Document as ApiDocument,
  Letter as ApiLetter,
  Organization as ApiOrganization,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import {
  buildInboxTaskListItem,
  type ContactListItem,
  type InboxListItem,
  type JournalListItem,
  type KnowledgeListItem,
  type LetterListItem,
  type OrganizationListItem,
  type ProjectOverviewRowProject,
  type TaskOverviewRowTask,
} from "@backsteros/ui";

import { useDesktopApi } from "./api-context";
import { useDesktopPowerSync, usePowerSyncQuery } from "./powersync-context";
import { getDesktopPublicEnvironment } from "./env";

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

function mapTask(
  task: ApiTask,
  projectsById: Map<string, ApiProject>,
): TaskOverviewRowTask {
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
  };
}

function mapProject(project: ApiProject): ProjectOverviewRowProject & {
  organizationId?: string | null;
} {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    status: project.status,
    priority: project.priority,
    area: project.area ?? null,
    icon: project.icon ?? null,
    organizationId: project.organizationId ?? null,
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
  source: "empty" | "api" | "powersync";
  ready: boolean;
  /** Non-inbox tasks — use for the Tasks list (`/tasks`). */
  tasks: TaskOverviewRowTask[];
  /** Inbox tasks with full metadata (assigneeId, etc.) — not in `tasks`. */
  inboxTasks: TaskOverviewRowTask[];
  /**
   * Non-inbox + inbox, deduped by id.
   * Use for contact/project/journal filters and task id lookups.
   */
  allTasks: TaskOverviewRowTask[];
  projects: Array<
    ProjectOverviewRowProject & { organizationId?: string | null }
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
  projectSummaries: Record<string, string>;
  projectDescriptions: Record<string, string>;
  taskDescriptions: Record<string, string>;
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
    organizationId?: string | null;
  }) => Promise<{ id: string; key: string }>;
  createInboxTask: (input: {
    title: string;
    description?: string;
    status?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
  }) => Promise<{ id: string; number: number | null }>;
  createProjectTask: (input: {
    projectId: string;
    title: string;
    description?: string;
    status?: string;
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
  }) => Promise<{ id: string; path: string }>;
  createProjectDocument: (input: {
    projectId: string;
    title: string;
    content?: string;
    folderPath?: string;
    parentId?: string | null;
  }) => Promise<{ id: string; path: string }>;
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

/**
 * Prefer PowerSync rows when ready, else authenticated REST lists, else empty.
 */
export function useDesktopWorkspaceData(): DesktopWorkspaceData {
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
      ? "SELECT * FROM tasks WHERE deleted_at IS NULL AND inbox = 1 ORDER BY sort_order, updated_at DESC"
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
  const [apiDocuments, setApiDocuments] = useState<ApiDocument[] | null>(null);
  const [apiLoadDone, setApiLoadDone] = useState(false);

  useEffect(() => {
    if (!authenticated) {
      setApiTasks(null);
      setApiInboxTasks(null);
      setApiProjects(null);
      setApiLetters(null);
      setApiContacts(null);
      setApiOrganizations(null);
      setApiDocuments(null);
      setApiLoadDone(false);
      return;
    }
    if (powerSync.ready && localTasks.data && localProjects.data) {
      setApiLoadDone(true);
      return;
    }

    let cancelled = false;
    // Clear prior-backend REST rows so mode switches do not flash stale data.
    setApiTasks(null);
    setApiInboxTasks(null);
    setApiProjects(null);
    setApiLetters(null);
    setApiContacts(null);
    setApiOrganizations(null);
    setApiDocuments(null);
    setApiLoadDone(false);
    void (async () => {
      try {
        const [
          tasksBody,
          inboxTasksBody,
          projectsBody,
          lettersBody,
          contactsBody,
          orgsBody,
          documentsBody,
        ] = await Promise.all([
          client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks"),
          client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks/inbox"),
          client.requestJson<{ projects: ApiProject[] }>("/api/v1/projects"),
          client.requestJson<{ letters: ApiLetter[] }>("/api/v1/letters"),
          client.requestJson<{ contacts: ApiContact[] }>("/api/v1/contacts"),
          client.requestJson<{ organizations: ApiOrganization[] }>(
            "/api/v1/organizations",
          ),
          client.requestJson<{ documents: ApiDocument[] }>(
            "/api/v1/documents",
          ),
        ]);
        if (cancelled) return;
        setApiTasks(tasksBody.tasks);
        setApiInboxTasks(inboxTasksBody.tasks);
        setApiProjects(projectsBody.projects);
        setApiLetters(lettersBody.letters);
        setApiContacts(contactsBody.contacts);
        setApiOrganizations(orgsBody.organizations);
        setApiDocuments(documentsBody.documents);
      } catch (error) {
        console.warn("[desktop] REST workspace load failed", error);
      } finally {
        if (!cancelled) setApiLoadDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authenticated,
    client,
    localProjects.data,
    localTasks.data,
    powerSync.ready,
  ]);

  const projectsById = useMemo(() => {
    const map = new Map<string, ApiProject>();
    const rows =
      localProjects.data?.map((row) => snakeRow(row) as ApiProject) ??
      apiProjects ??
      [];
    for (const project of rows) map.set(project.id, project);
    return map;
  }, [apiProjects, localProjects.data]);

  const organizationsById = useMemo(() => {
    const map = new Map<string, ApiOrganization>();
    const rows =
      localOrganizations.data?.map(
        (row) => snakeRow(row) as ApiOrganization,
      ) ??
      apiOrganizations ??
      [];
    for (const org of rows) map.set(org.id, org);
    return map;
  }, [apiOrganizations, localOrganizations.data]);

  const rawProjects =
    localProjects.data?.map((row) => snakeRow(row) as ApiProject) ??
    apiProjects ??
    [];
  const rawTasks =
    localTasks.data?.map((row) => snakeRow(row) as ApiTask) ?? apiTasks ?? [];
  const rawInboxTasks =
    localInboxTasks.data?.map((row) => snakeRow(row) as ApiTask) ??
    apiInboxTasks ??
    [];
  const rawLetters =
    localLetters.data?.map((row) => snakeRow(row) as ApiLetter) ??
    apiLetters ??
    [];
  const rawContacts =
    localContacts.data?.map((row) => snakeRow(row) as ApiContact) ??
    apiContacts ??
    [];
  const rawOrganizations =
    localOrganizations.data?.map((row) => snakeRow(row) as ApiOrganization) ??
    apiOrganizations ??
    [];
  const rawDocuments =
    localDocuments.data?.map((row) => snakeRow(row) as ApiDocument) ??
    apiDocuments ??
    [];

  const source: DesktopWorkspaceData["source"] = localTasks.data
    ? "powersync"
    : apiTasks
      ? "api"
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

  const inboxTaskItems: InboxListItem[] = rawInboxTasks.map((task) => {
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
    });
  });

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

  const patchViaPowerSyncOrApi = useCallback(
    async (table: string, id: string, values: Record<string, unknown>) => {
      const path = entityPatchPath(table, id);
      // Match Next.js: optimistic local SQLite + REST so other clients see
      // changes even when the PowerSync upload queue is slow or stalled.
      if (powerSync.ready && powerSync.patchMetadata) {
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
        if (!authenticated) return;
        try {
          await client.requestJson(path, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(values),
          });
        } catch {
          // Local write + upload queue remain the source of truth if REST fails.
        }
        return;
      }
      if (!authenticated) return;
      await client.requestJson(path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
    },
    [authenticated, client, entityPatchPath, powerSync, toSnakeFields],
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
      const key = entityKeyFromName(name, "org");
      const body = { key, name };
      if (powerSync.ready && powerSync.createMetadata) {
        const id = await powerSync.createMetadata(
          "organizations",
          toSnakeFields(body),
        );
        return { id, key };
      }
      if (!authenticated) throw new Error("Sign in to create organizations.");
      const organization = await client.requestJson<{
        id: string;
        key: string;
      }>("/api/v1/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { id: organization.id, key: organization.key };
    },
    [
      authenticated,
      client,
      entityKeyFromName,
      powerSync,
      toSnakeFields,
    ],
  );

  const createContact = useCallback(
    async (input: { name: string; organizationId?: string | null }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Contact name is required.");
      const key = entityKeyFromName(name, "person");
      const body = {
        key,
        name,
        organizationId: input.organizationId ?? null,
      };
      if (powerSync.ready && powerSync.createMetadata) {
        const id = await powerSync.createMetadata(
          "contacts",
          toSnakeFields(body),
        );
        return { id, key };
      }
      if (!authenticated) throw new Error("Sign in to create contacts.");
      const contact = await client.requestJson<{ id: string; key: string }>(
        "/api/v1/contacts",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return { id: contact.id, key: contact.key };
    },
    [
      authenticated,
      client,
      entityKeyFromName,
      powerSync,
      toSnakeFields,
    ],
  );

  const createProject = useCallback(
    async (input: {
      name: string;
      status?: string;
      organizationId?: string | null;
    }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Project name is required.");
      const key = entityKeyFromName(name, "prj");
      const body = {
        key,
        name,
        status: input.status ?? "backlog",
        sortOrder: -Date.now(),
        organizationId: input.organizationId ?? null,
      };
      if (powerSync.ready && powerSync.createMetadata) {
        const id = await powerSync.createMetadata(
          "projects",
          toSnakeFields(body),
        );
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
      entityKeyFromName,
      powerSync,
      toSnakeFields,
    ],
  );

  const createInboxTask = useCallback(
    async (input: {
      title: string;
      description?: string;
      status?: string;
      assigneeId?: string | null;
      dueDate?: string | null;
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Task title is required.");
      const body = {
        title,
        description: input.description?.trim() || null,
        status: input.status ?? "triage",
        priority: 0,
        sortOrder: Date.now(),
        assigneeId: input.assigneeId ?? null,
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
        priority: 0,
        sortOrder: Date.now(),
        assigneeId: input.assigneeId ?? null,
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
      const document = await client.requestJson<{ id: string; path: string }>(
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
      return { id: document.id, path: document.path };
    },
    [authenticated, client],
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
      const document = await client.requestJson<{ id: string; path: string }>(
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
      return { id: document.id, path: document.path };
    },
    [authenticated, client],
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
      const document = await client.requestJson<{ id: string; path: string }>(
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
      return { id: document.id, path: document.path };
    },
    [authenticated, client],
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
      const document = await client.requestJson<{ id: string; path: string }>(
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
      return { id: document.id, path: document.path };
    },
    [authenticated, client],
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
  const allTasksById = new Map<string, TaskOverviewRowTask>();
  for (const task of mappedTasks) allTasksById.set(task.id, task);
  for (const task of mappedInboxTasks) {
    if (!allTasksById.has(task.id)) allTasksById.set(task.id, task);
  }
  const allTasks = [...allTasksById.values()];

  return {
    source,
    ready: !authenticated || powerSync.ready || apiLoadDone,
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
    patchTask: (id, values) => patchViaPowerSyncOrApi("tasks", id, values),
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
