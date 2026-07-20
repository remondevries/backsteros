import {
  EMPTY_MENTION_CATALOG,
  INBOX_TASK_KEY,
  KNOWLEDGE_MENTION_PROJECT_KEY,
  PROJECT_AREAS,
  formatLetterDisplayId,
  formatTaskDisplayId,
  isProjectStatus,
  isTaskPriority,
  isTaskStatus,
  migrateLegacyProjectStatus,
  migrateLegacyTaskStatus,
  type MentionCatalog,
  type MentionCatalogContact,
  type MentionCatalogDocument,
  type MentionCatalogLetter,
  type MentionCatalogOrganization,
  type MentionCatalogProject,
  type MentionCatalogTask,
  type ProjectArea,
  type TaskPriority,
} from "@backsteros/ui";

import type { DesktopWorkspaceData } from "./workspace-data";

function isProjectArea(value: string | null | undefined): value is ProjectArea {
  return (
    value != null && (PROJECT_AREAS as readonly string[]).includes(value)
  );
}

function toPriority(value: number): TaskPriority {
  return isTaskPriority(value) ? value : 0;
}

function dueDateMs(value: number | Date | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  return value;
}

function mapWorkspaceLetter(
  letter: DesktopWorkspaceData["letters"][number],
): MentionCatalogLetter {
  return {
    id: letter.id,
    displayId: formatLetterDisplayId(letter.number),
    title: letter.title,
    status: isTaskStatus(letter.status)
      ? letter.status
      : migrateLegacyTaskStatus(letter.status),
    dueDate: dueDateMs(letter.dueDate),
    projectId: letter.projectId ?? null,
    projectKey: letter.projectKey ?? null,
    projectName: null,
  };
}

function mapWorkspaceTask(
  task: DesktopWorkspaceData["tasks"][number],
  contactsById: Map<string, DesktopWorkspaceData["contacts"][number]>,
): MentionCatalogTask | null {
  if (!isTaskStatus(task.status)) {
    return null;
  }

  const contact = task.contactId
    ? contactsById.get(task.contactId) ?? null
    : null;
  const contactKey = contact?.key ?? null;

  let displayId: string | null = null;
  if (task.projectKey) {
    displayId = formatTaskDisplayId(task.projectKey, task.number);
  } else if (contactKey) {
    displayId = formatTaskDisplayId(contactKey, task.number);
  } else if (!task.projectId) {
    displayId = formatTaskDisplayId(INBOX_TASK_KEY, task.number);
  }

  if (!displayId) {
    return null;
  }

  return {
    id: task.id,
    displayId,
    title: task.title,
    status: task.status,
    priority: toPriority(task.priority),
    dueDate: dueDateMs(task.dueDate),
    description: null,
    projectId: task.projectId,
    projectKey: task.projectKey ?? null,
    projectName: task.projectName ?? null,
    projectIcon: null,
    contactKey,
  };
}

function mapInboxTask(
  item: Extract<DesktopWorkspaceData["inboxItems"][number], { kind: "task" }>,
): MentionCatalogTask | null {
  if (!isTaskStatus(item.status)) {
    return null;
  }

  const displayId = formatTaskDisplayId(
    item.projectKey || item.contactKey || INBOX_TASK_KEY,
    item.number,
  );

  return {
    id: item.id,
    displayId,
    title: item.title,
    status: item.status,
    priority: toPriority(item.priority),
    dueDate: item.dueDate,
    description: item.description ?? null,
    projectId: item.projectId,
    projectKey: item.projectKey,
    projectName: item.projectName,
    projectIcon: item.projectIcon,
    contactKey: item.contactKey,
  };
}

/**
 * Build a local @-mention catalog from desktop workspace lists (PowerSync / REST).
 * Does not call the notifications or Next BFF mention APIs.
 */
export function buildMentionCatalogFromWorkspace(
  workspace: Pick<
    DesktopWorkspaceData,
    | "allTasks"
    | "projects"
    | "contacts"
    | "organizations"
    | "knowledgeDocuments"
    | "projectDocuments"
    | "inboxItems"
    | "projectSummaries"
    | "letters"
  >,
): MentionCatalog {
  const contactsById = new Map(
    workspace.contacts.map((contact) => [contact.id, contact]),
  );
  const organizationsById = new Map(
    workspace.organizations.map((organization) => [
      organization.id,
      organization,
    ]),
  );
  const projectsById = new Map(
    workspace.projects.map((project) => [project.id, project]),
  );

  const taskById = new Map<string, MentionCatalogTask>();

  for (const task of workspace.allTasks) {
    const mapped = mapWorkspaceTask(task, contactsById);
    if (mapped) {
      taskById.set(mapped.id, mapped);
    }
  }

  // Inbox list items may carry description when the overview row does not.
  for (const item of workspace.inboxItems) {
    if (item.kind !== "task") continue;
    const existing = taskById.get(item.id);
    if (existing) {
      if (!existing.description && item.description) {
        taskById.set(item.id, {
          ...existing,
          description: item.description,
        });
      }
      continue;
    }
    const mapped = mapInboxTask(item);
    if (mapped) {
      taskById.set(mapped.id, mapped);
    }
  }

  const projects: MentionCatalogProject[] = workspace.projects.map(
    (project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
      color: null,
      icon: project.icon ?? null,
      summary: workspace.projectSummaries[project.id] ?? null,
      status: isProjectStatus(project.status)
        ? project.status
        : migrateLegacyProjectStatus(project.status),
      area: isProjectArea(project.area) ? project.area : null,
    }),
  );

  const contacts: MentionCatalogContact[] = workspace.contacts
    .filter((contact): contact is typeof contact & { key: string } =>
      Boolean(contact.key),
    )
    .map((contact) => {
      const organization = contact.organizationId
        ? organizationsById.get(contact.organizationId)
        : null;
      return {
        id: contact.id,
        key: contact.key,
        number: contact.number ?? null,
        displayId:
          contact.number != null ? `C-${contact.number}` : contact.key,
        name: contact.name,
        email: contact.email ?? null,
        title: contact.title ?? null,
        summary: null,
        avatarStorageKey: contact.avatarStorageKey ?? null,
        avatarUpdatedAt: contact.avatarUpdatedAt ?? 0,
        organizationId: contact.organizationId ?? null,
        organizationKey: organization?.key ?? null,
        organizationName:
          contact.organizationName ?? organization?.name ?? null,
      };
    });

  const organizations: MentionCatalogOrganization[] = workspace.organizations
    .filter(
      (organization): organization is typeof organization & { key: string } =>
        Boolean(organization.key),
    )
    .map((organization) => ({
      id: organization.id,
      key: organization.key,
      number: organization.number ?? null,
      displayId:
        organization.number != null
          ? `O-${organization.number}`
          : organization.key,
      name: organization.name,
      email: null,
      summary: null,
      avatarStorageKey: organization.avatarStorageKey ?? null,
      avatarUpdatedAt: organization.avatarUpdatedAt ?? 0,
    }));

  const documents: MentionCatalogDocument[] = [];

  for (const document of workspace.knowledgeDocuments) {
    if (document.kind === "folder") continue;
    documents.push({
      id: document.id,
      projectId: null,
      projectKey: KNOWLEDGE_MENTION_PROJECT_KEY,
      projectName: "Knowledge",
      relativePath: document.path ?? document.id,
      title: document.title,
      icon: null,
      updatedAt: 0,
    });
  }

  for (const document of workspace.projectDocuments) {
    if (document.kind === "folder") continue;
    if (!document.projectId) continue;
    const project = projectsById.get(document.projectId);
    if (!project) continue;
    documents.push({
      id: document.id,
      projectId: document.projectId,
      projectKey: project.key,
      projectName: project.name,
      relativePath: document.path ?? document.id,
      title: document.title,
      icon: null,
      updatedAt: 0,
    });
  }

  const letters: MentionCatalogLetter[] = workspace.letters.map((letter) => {
    const mapped = mapWorkspaceLetter(letter);
    const project = letter.projectId
      ? projectsById.get(letter.projectId)
      : null;
    return {
      ...mapped,
      projectName: project?.name ?? null,
      projectKey: mapped.projectKey ?? project?.key ?? null,
    };
  });

  if (
    taskById.size === 0 &&
    projects.length === 0 &&
    contacts.length === 0 &&
    organizations.length === 0 &&
    documents.length === 0 &&
    letters.length === 0
  ) {
    return EMPTY_MENTION_CATALOG;
  }

  return {
    tasks: [...taskById.values()],
    projects,
    contacts,
    organizations,
    documents,
    letters,
  };
}
