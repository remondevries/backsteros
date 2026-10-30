import {
  EMPTY_MENTION_CATALOG,
  INBOX_TASK_KEY,
  KNOWLEDGE_MENTION_PROJECT_KEY,
  PROJECT_AREAS,
  collapseEmailListItemsByThread,
  formatEmailDisplayId,
  formatLetterDisplayId,
  formatMeetingDisplayId,
  formatTaskDisplayId,
  isProjectStatus,
  isTaskPriority,
  isTaskStatus,
  migrateLegacyProjectStatus,
  migrateLegacyTaskStatus,
  normalizeContactSocialAccounts,
  type EmailListItem,
  type MentionCatalog,
  type MentionCatalogContact,
  type MentionCatalogDocument,
  type MentionCatalogEmail,
  type MentionCatalogHabit,
  type MentionCatalogJournal,
  type MentionCatalogLetter,
  type MentionCatalogMeeting,
  type MentionCatalogOrganization,
  type MentionCatalogProject,
  type MentionCatalogTask,
  type ProjectArea,
  type TaskPriority,
} from "@backsteros/ui";

import type { Habit } from "@backsteros/contracts";

import type { DesktopWorkspaceData } from "./workspace-data";

function isProjectArea(value: string | null | undefined): value is ProjectArea {
  return (
    value != null && (PROJECT_AREAS as readonly string[]).includes(value)
  );
}

function toPriority(value: number): TaskPriority {
  return isTaskPriority(value) ? value : 0;
}

function dueDateMs(value: number | Date | string | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return value;
}

function mapWorkspaceLetter(
  letter: DesktopWorkspaceData["letters"][number],
): MentionCatalogLetter {
  return {
    id: letter.id,
    displayId:
      letter.number != null
        ? formatLetterDisplayId(letter.number)
        : letter.id,
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

function mapEmailListItem(item: EmailListItem): MentionCatalogEmail | null {
  if (item.kind === "draft") return null;
  const number = item.number ?? null;
  const displayId =
    item.displayId?.trim() ||
    (number != null ? formatEmailDisplayId(number) : null);
  if (!displayId || number == null) {
    return null;
  }

  const status = isTaskStatus(item.status ?? "triage")
    ? (item.status as MentionCatalogEmail["status"])
    : migrateLegacyTaskStatus(item.status ?? "triage");

  return {
    id: item.emailThreadId?.trim() || `${item.inboxId}:${item.threadId ?? item.id}`,
    displayId,
    title: item.subject?.trim() || displayId,
    status,
    priority: toPriority(item.priority ?? 0),
    dueDate: dueDateMs(item.dueDate),
    receivedAt:
      typeof item.receivedAt === "number" && Number.isFinite(item.receivedAt)
        ? item.receivedAt
        : null,
    from: item.from?.trim() || null,
    inboxId: item.inboxId,
    threadId: item.threadId ?? null,
    messageId: item.id,
    projectId: item.projectId ?? null,
    projectKey: item.projectKey ?? null,
    projectName: item.projectName ?? null,
    contactName: item.contactName ?? null,
  };
}

/**
 * Build @-mention email entries from AgentMail list rows (one per thread).
 */
export function buildMentionCatalogFromEmailMessages(
  messages: readonly EmailListItem[],
): MentionCatalogEmail[] {
  const byThread = collapseEmailListItemsByThread(messages);
  const emails: MentionCatalogEmail[] = [];

  for (const item of byThread) {
    const mapped = mapEmailListItem(item);
    if (mapped) {
      emails.push(mapped);
    }
  }

  return emails;
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
    | "contactDetails"
    | "organizations"
    | "knowledgeDocuments"
    | "projectDocuments"
    | "inboxItems"
    | "projectSummaries"
    | "letters"
    | "meetings"
    | "journalItems"
    | "journalDocumentIdsByDate"
    | "habits"
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
      type: project.type ?? null,
      summary: workspace.projectSummaries[project.id] ?? null,
      status: isProjectStatus(project.status)
        ? project.status
        : migrateLegacyProjectStatus(project.status),
      area: isProjectArea(project.area) ? project.area : null,
    }),
  );

  const contacts: MentionCatalogContact[] = workspace.contacts
    .map((contact): MentionCatalogContact | null => {
      // Prefer stable slug key; fall back to id so contacts without a key
      // still appear in @ mention results (href resolution accepts id).
      const key = (contact.key?.trim() || contact.id).trim();
      if (!key) return null;
      const organization = contact.organizationId
        ? organizationsById.get(contact.organizationId)
        : null;
      const details = workspace.contactDetails[contact.id];
      const socialAccounts = normalizeContactSocialAccounts(
        details?.socialAccounts ?? contact.socialAccounts,
      );
      return {
        id: contact.id,
        key,
        number: contact.number ?? null,
        displayId:
          contact.number != null ? `C-${contact.number}` : key,
        name: contact.name,
        firstName:
          contact.firstName ?? details?.firstName ?? null,
        lastName: contact.lastName ?? details?.lastName ?? null,
        email: details?.email ?? contact.email ?? null,
        emails: (details?.emails as MentionCatalogContact["emails"]) ??
          contact.emails ??
          null,
        phone: details?.phone ?? contact.phone ?? null,
        phones: (details?.phones as MentionCatalogContact["phones"]) ??
          contact.phones ??
          null,
        title: details?.title ?? contact.title ?? null,
        summary: details?.summary ?? null,
        address: details?.address ?? contact.address ?? null,
        city: details?.city ?? contact.city ?? null,
        postalCode: details?.postalCode ?? contact.postalCode ?? null,
        region: details?.region ?? contact.region ?? null,
        country: details?.country ?? contact.country ?? null,
        socialAccounts: socialAccounts.length > 0 ? socialAccounts : null,
        avatarStorageKey: contact.avatarStorageKey ?? null,
        avatarUpdatedAt: contact.avatarUpdatedAt ?? 0,
        avatarSrc: contact.avatarSrc ?? null,
        organizationId: contact.organizationId ?? null,
        organizationKey:
          organization?.key?.trim() || organization?.id || null,
        organizationName:
          contact.organizationName ?? organization?.name ?? null,
        organizationAvatarSrc: organization?.avatarSrc ?? null,
      };
    })
    .filter((contact): contact is MentionCatalogContact => contact != null);

  const organizations: MentionCatalogOrganization[] = workspace.organizations
    .map((organization): MentionCatalogOrganization | null => {
      const key = (organization.key?.trim() || organization.id).trim();
      if (!key) return null;
      return {
        id: organization.id,
        key,
        number: organization.number ?? null,
        displayId:
          organization.number != null
            ? `O-${organization.number}`
            : key,
        name: organization.name,
        email: null,
        summary: null,
        avatarStorageKey: organization.avatarStorageKey ?? null,
        avatarUpdatedAt: organization.avatarUpdatedAt ?? 0,
        avatarSrc: organization.avatarSrc ?? null,
      };
    })
    .filter(
      (organization): organization is MentionCatalogOrganization =>
        organization != null,
    );

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

  const meetings: MentionCatalogMeeting[] = workspace.meetings.map(
    (meeting) => {
      const project = meeting.projectId
        ? projectsById.get(meeting.projectId)
        : null;
      return {
        id: meeting.id,
        displayId: formatMeetingDisplayId(meeting.number),
        title: meeting.title,
        startAt: dueDateMs(meeting.startAt),
        endAt: dueDateMs(meeting.endAt),
        status: meeting.status ?? null,
        summary: meeting.summary ?? null,
        location: meeting.location ?? null,
        projectId: meeting.projectId ?? null,
        projectKey: meeting.projectKey ?? project?.key ?? null,
        projectName: meeting.projectName ?? project?.name ?? null,
        projectIcon: null,
        organizationName: meeting.organizationName ?? null,
      };
    },
  );

  const journals: MentionCatalogJournal[] = workspace.journalItems.map(
    (item) => {
      const documentId =
        workspace.journalDocumentIdsByDate[item.dateSlug] ?? item.dateSlug;
      return {
        id: documentId,
        date: item.dateSlug,
        title: item.dateSlug,
        snippet: null,
        updatedAt: null,
      };
    },
  );

  const habits: MentionCatalogHabit[] = workspace.habits.map(
    (habit: Habit) => ({
      id: habit.id,
      title: habit.title,
      icon: habit.icon,
      cadence: habit.cadence,
      date: null,
      completed:
        habit.todayTaskStatus === "completed"
          ? true
          : habit.todayTaskStatus == null
            ? null
            : false,
      taskDisplayId: null,
    }),
  );

  if (
    taskById.size === 0 &&
    projects.length === 0 &&
    contacts.length === 0 &&
    organizations.length === 0 &&
    documents.length === 0 &&
    letters.length === 0 &&
    meetings.length === 0 &&
    journals.length === 0 &&
    habits.length === 0
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
    emails: [],
    meetings,
    journals,
    habits,
    messages: [],
    posts: [],
    transactions: [],
    invoices: [],
    estimates: [],
  };
}
