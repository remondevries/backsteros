import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  Contact as ApiContact,
  Document as ApiDocument,
  Project as ApiProject,
} from "@backsteros/contracts";
import {
  buildDocumentFoldersByTarget,
  COMPOSE_KNOWLEDGE_BASE_VALUE,
  getInboxTaskRouteHref,
  getKnowledgeHref,
  getProjectDocumentHref,
  getScopedProjectTaskHref,
  toApiDueDateIso,
  type AssigneeDropdownContact,
  type ComposeDocumentFoldersByTarget,
  type ComposeModalCreateDocumentInput,
  type ComposeModalCreateTaskInput,
  type ComposeModalProject,
} from "@backsteros/ui";

import {
  getDefaultAssigneeId,
  resolveCreateAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "./default-assignee";

async function createTaskWithAssigneeFallback(
  client: BacksterosApiClient,
  body: Record<string, unknown>,
): Promise<{ id: string; number?: number }> {
  try {
    return await client.requestJson<{ id: string; number?: number }>(
      "/api/v1/tasks",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } catch (error) {
    if (
      body.assigneeId &&
      error instanceof Error &&
      (error.message.toLowerCase().includes("assignee") ||
        ("code" in error &&
          (error as { code?: string }).code === "assignee_not_found"))
    ) {
      return client.requestJson<{ id: string; number?: number }>(
        "/api/v1/tasks",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, assigneeId: null }),
        },
      );
    }
    throw error;
  }
}

export type ComposeOverlayContext = {
  projects: ComposeModalProject[];
  contacts: AssigneeDropdownContact[];
  documentFoldersByTarget: ComposeDocumentFoldersByTarget;
  projectsById: Map<string, { id: string; key: string; name: string }>;
  defaultAssigneeId: string | null;
};

export async function loadComposeOverlayContext(
  client: BacksterosApiClient,
): Promise<ComposeOverlayContext> {
  const [projectsBody, contactsBody, documentsBody, settingsBody] =
    await Promise.all([
      client.requestJson<{ projects: ApiProject[] }>("/api/v1/projects"),
      client.requestJson<{ contacts: ApiContact[] }>("/api/v1/contacts"),
      client.requestJson<{ documents: ApiDocument[] }>("/api/v1/documents"),
      client
        .requestJson<{ settings: Record<string, unknown> }>("/api/v1/settings")
        .catch(() => null),
    ]);

  const projects = projectsBody.projects.map((project) => ({
    id: project.id,
    key: project.key,
    name: project.name,
    icon: project.icon ?? null,
    type: project.type ?? null,
    color: null as string | null,
    dueDate: project.dueDate ? new Date(project.dueDate) : null,
  }));

  const contacts: AssigneeDropdownContact[] = contactsBody.contacts.map(
    (contact) => ({
      id: contact.id,
      name: contact.name,
      email: contact.email ?? null,
      emails: contact.emails ?? [],
      organizationName: null,
      avatarSrc: null,
    }),
  );

  const documentFoldersByTarget = buildDocumentFoldersByTarget(
    documentsBody.documents.map((document) => ({
      path: document.path ?? "",
      title: document.title,
      kind: document.kind ?? "document",
      type: document.type === "knowledge" ? "knowledge" : "project",
      projectId: document.projectId ?? null,
    })),
    projects,
    COMPOSE_KNOWLEDGE_BASE_VALUE,
  );

  const projectsById = new Map(
    projectsBody.projects.map((project) => [
      project.id,
      { id: project.id, key: project.key, name: project.name },
    ]),
  );

  const defaultAssigneeId = settingsBody
    ? syncDefaultAssigneeIdFromSettings(settingsBody.settings)
    : getDefaultAssigneeId();

  return {
    projects,
    contacts,
    documentFoldersByTarget,
    projectsById,
    defaultAssigneeId,
  };
}

export async function createComposeOverlayTask(
  client: BacksterosApiClient,
  input: ComposeModalCreateTaskInput,
  projectsById: Map<string, { id: string; key: string; name: string }>,
): Promise<{ href: string }> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Task title is required.");
  }

  if (input.projectId) {
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
    };
    const task = await createTaskWithAssigneeFallback(client, body);
    const project = projectsById.get(input.projectId);
    if (project && task.number != null) {
      return { href: getScopedProjectTaskHref(project.key, task.number) };
    }
    return { href: `/tasks/${task.id}` };
  }

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
  };
  const task = await createTaskWithAssigneeFallback(client, body);
  if (task.number != null) {
    return { href: getInboxTaskRouteHref({ number: task.number }) };
  }
  return { href: `/inbox/${task.id}` };
}

export async function createComposeOverlayDocument(
  client: BacksterosApiClient,
  input: ComposeModalCreateDocumentInput,
  projectsById: Map<string, { id: string; key: string; name: string }>,
): Promise<{ href: string }> {
  const title = input.title.trim() || "Untitled";
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled";
  const folder = input.folderPath?.trim().replace(/^\/+|\/+$/g, "") ?? "";
  const path = folder ? `${folder}/${slug}.md` : `${slug}.md`;

  if (input.target === "knowledge") {
    const document = await client.requestJson<{ id: string; path: string }>(
      "/api/v1/documents",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "knowledge",
          title,
          path,
          content: "",
        }),
      },
    );
    return { href: getKnowledgeHref(document.path || document.id) };
  }

  if (!input.projectId) {
    throw new Error("Select a project for this document.");
  }
  const project = projectsById.get(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

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
        content: "",
      }),
    },
  );
  return {
    href: getProjectDocumentHref(project.key, document.path || document.id),
  };
}
