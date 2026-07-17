import type {
  Contact,
  Document,
  Organization,
  Project,
  Task,
} from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

import { getContactDisplayId } from "@/lib/contact-display-id";
import { getOrganizationDisplayId } from "@/lib/organization-display-id";
import { isProjectArea } from "@/lib/project-areas";
import { isProjectStatus } from "@/lib/project-status";
import { isTaskPriority, type TaskPriority } from "@/lib/task-priority";
import { formatTaskDisplayId, INBOX_TASK_KEY } from "@/lib/task-display-id";
import { isTaskStatus } from "@/lib/task-status";
import { toTimestampMs } from "@/lib/sync/timestamps";

import { EMPTY_MENTION_CATALOG } from "./empty-catalog";
import type {
  MentionCatalog,
  MentionCatalogDocument,
  MentionCatalogTask,
  ParsedMentionToken,
} from "./mention-menu-types";
import { KNOWLEDGE_MENTION_PROJECT_KEY } from "./tokens";

function toPriority(value: number): TaskPriority {
  return isTaskPriority(value) ? value : 0;
}

function taskDisplayContext(
  task: Task,
  projectsById: Map<string, Project>,
  contactsById: Map<string, Contact>,
): {
  displayId: string;
  projectKey: string | null;
  projectName: string | null;
  projectIcon: string | null;
  contactKey: string | null;
} | null {
  if (task.projectId) {
    const project = projectsById.get(task.projectId);
    if (!project) {
      return null;
    }
    return {
      displayId: formatTaskDisplayId(project.key, task.number),
      projectKey: project.key,
      projectName: project.name,
      projectIcon: project.icon,
      contactKey: null,
    };
  }

  if (task.contactId) {
    const contact = contactsById.get(task.contactId);
    if (!contact) {
      return null;
    }
    return {
      displayId: formatTaskDisplayId(contact.key, task.number),
      projectKey: null,
      projectName: null,
      projectIcon: null,
      contactKey: contact.key,
    };
  }

  return {
    displayId: formatTaskDisplayId(INBOX_TASK_KEY, task.number),
    projectKey: null,
    projectName: null,
    projectIcon: null,
    contactKey: null,
  };
}

function mapTask(
  task: Task,
  projectsById: Map<string, Project>,
  contactsById: Map<string, Contact>,
): MentionCatalogTask | null {
  if (!isTaskStatus(task.status)) {
    return null;
  }

  const context = taskDisplayContext(task, projectsById, contactsById);
  if (!context) {
    return null;
  }

  return {
    id: task.id,
    displayId: context.displayId,
    title: task.title,
    status: task.status,
    priority: toPriority(task.priority),
    dueDate: task.dueDate ? toTimestampMs(task.dueDate) : null,
    description: task.description,
    projectId: task.projectId,
    projectKey: context.projectKey,
    projectName: context.projectName,
    projectIcon: context.projectIcon,
    contactKey: context.contactKey,
  };
}

function mapDocument(
  document: Document,
  projectsById: Map<string, Project>,
): MentionCatalogDocument | null {
  if (document.kind !== "document") {
    return null;
  }

  if (document.type === "knowledge") {
    return {
      id: document.id,
      projectId: null,
      projectKey: KNOWLEDGE_MENTION_PROJECT_KEY,
      projectName: "Knowledge",
      relativePath: document.path,
      title: document.title,
      icon: document.icon,
      updatedAt: toTimestampMs(document.updatedAt),
    };
  }

  if (document.type !== "project" || !document.projectId) {
    return null;
  }

  const project = projectsById.get(document.projectId);
  if (!project) {
    return null;
  }

  return {
    id: document.id,
    projectId: document.projectId,
    projectKey: project.key,
    projectName: project.name,
    relativePath: document.path,
    title: document.title,
    icon: document.icon,
    updatedAt: toTimestampMs(document.updatedAt),
  };
}

export async function fetchMentionCatalog(
  client: BacksterosApiClient,
): Promise<MentionCatalog> {
  const [projectsRes, tasksRes, contactsRes, organizationsRes, projectDocsRes, knowledgeDocsRes] =
    await Promise.all([
      client.requestJson<{ projects: Project[] }>("/api/v1/projects"),
      client.requestJson<{ tasks: Task[] }>("/api/v1/tasks"),
      client.requestJson<{ contacts: Contact[] }>("/api/v1/contacts"),
      client.requestJson<{ organizations: Organization[] }>(
        "/api/v1/organizations",
      ),
      client.requestJson<{ documents: Document[] }>(
        "/api/v1/documents?type=project",
      ),
      client.requestJson<{ documents: Document[] }>(
        "/api/v1/documents?type=knowledge",
      ),
    ]);

  const projects = projectsRes.projects ?? [];
  const tasks = tasksRes.tasks ?? [];
  const contacts = contactsRes.contacts ?? [];
  const organizations = organizationsRes.organizations ?? [];
  const documents = [
    ...(projectDocsRes.documents ?? []),
    ...(knowledgeDocsRes.documents ?? []),
  ];

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );

  return {
    projects: projects.map((project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
      color: project.color,
      icon: project.icon,
      summary: project.summary,
      status: isProjectStatus(project.status) ? project.status : "backlog",
      area:
        project.area && isProjectArea(project.area) ? project.area : null,
    })),
    tasks: tasks
      .map((task) => mapTask(task, projectsById, contactsById))
      .filter((task): task is MentionCatalogTask => task !== null),
    contacts: contacts.map((contact) => {
      const organization = contact.organizationId
        ? organizationsById.get(contact.organizationId)
        : null;
      return {
        id: contact.id,
        key: contact.key,
        number: contact.number,
        displayId: getContactDisplayId(contact),
        name: contact.name,
        email: contact.email,
        title: contact.title,
        summary: contact.summary,
        avatarStorageKey: contact.avatarStorageKey,
        avatarUpdatedAt: toTimestampMs(contact.updatedAt),
        organizationId: contact.organizationId,
        organizationKey: organization?.key ?? null,
        organizationName: organization?.name ?? null,
      };
    }),
    organizations: organizations.map((organization) => ({
      id: organization.id,
      key: organization.key,
      number: organization.number,
      displayId: getOrganizationDisplayId(organization),
      name: organization.name,
      email: organization.email,
      summary: organization.summary,
      avatarStorageKey: organization.avatarStorageKey,
      avatarUpdatedAt: toTimestampMs(organization.updatedAt),
    })),
    documents: documents
      .map((document) => mapDocument(document, projectsById))
      .filter(
        (document): document is MentionCatalogDocument => document !== null,
      ),
  };
}

export function filterCatalogForTokens(
  catalog: MentionCatalog,
  tokens: ParsedMentionToken[],
): MentionCatalog {
  if (tokens.length === 0) {
    return EMPTY_MENTION_CATALOG;
  }

  const taskIds = new Set(
    tokens
      .filter((token) => token.kind === "task")
      .map((token) => token.displayId.toLowerCase()),
  );
  const projectKeys = new Set(
    tokens
      .filter((token) => token.kind === "project")
      .map((token) => token.key.toLowerCase()),
  );
  const contactKeys = new Set(
    tokens
      .filter((token) => token.kind === "contact")
      .map((token) => token.key.toLowerCase()),
  );
  const organizationKeys = new Set(
    tokens
      .filter((token) => token.kind === "organization")
      .map((token) => token.key.toLowerCase()),
  );
  const documentKeys = new Set(
    tokens
      .filter((token) => token.kind === "document")
      .map(
        (token) =>
          `${token.projectKey.toLowerCase()}/${token.relativePath.toLowerCase()}`,
      ),
  );

  return {
    tasks: catalog.tasks.filter((task) =>
      taskIds.has(task.displayId.toLowerCase()),
    ),
    projects: catalog.projects.filter((project) =>
      projectKeys.has(project.key.toLowerCase()),
    ),
    contacts: catalog.contacts.filter((contact) =>
      contactKeys.has(contact.key.toLowerCase()),
    ),
    organizations: catalog.organizations.filter((organization) =>
      organizationKeys.has(organization.key.toLowerCase()),
    ),
    documents: catalog.documents.filter((document) =>
      documentKeys.has(
        `${document.projectKey.toLowerCase()}/${document.relativePath.toLowerCase()}`,
      ),
    ),
  };
}
