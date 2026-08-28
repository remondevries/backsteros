import type {
  Contact as ApiContact,
  Document as ApiDocument,
  Letter as ApiLetter,
  Organization as ApiOrganization,
  Project as ApiProject,
  Meeting as ApiMeeting,
  Task as ApiTask,
  TaskLink,
} from "@backsteros/contracts";
import type {
  ContactListItem,
  KnowledgeListItem,
  LetterListItem,
  MeetingListItem,
  OrganizationListItem,
  ProjectOverviewRowProject,
  TaskItemRowTask,
} from "@backsteros/ui";

export function parseMeetingAttendeeContactIdsFromRow(
  row: Record<string, unknown>,
): string[] {
  const raw = row.attendee_contact_ids ?? row.attendeeContactIds;
  if (Array.isArray(raw)) {
    return raw.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    );
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        );
      }
    } catch {
      return [];
    }
  }
  return [];
}

export function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
    ] = key === "inbox" ? Boolean(value) : value;
  }
  return output;
}

export function asEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function parseTaskLinks(value: unknown): TaskLink[] {
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

export function cloneTaskLinksForDuplicate(links: TaskLink[]): TaskLink[] {
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

export function resolveDuplicateTaskStatus(source: ApiTask): string {
  if (!TERMINAL_TASK_STATUSES.has(source.status)) {
    return source.status;
  }
  if (source.inbox || (!source.projectId && !source.contactId)) {
    return "triage";
  }
  return "ready_to_start";
}

export function mapTask(
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
    dueEndDate: asEpoch(task.dueEndDate ?? null),
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
    trackedMinutes: task.trackedMinutes ?? null,
    trackedDurationSeconds: task.trackedDurationSeconds ?? null,
  };
}

export function mapProject(project: ApiProject): ProjectOverviewRowProject & {
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

export function mapDocument(document: ApiDocument): KnowledgeListItem {
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

export function mapLetter(
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

export function mapMeeting(
  meeting: ApiMeeting,
  projectsById: Map<string, ApiProject>,
): MeetingListItem {
  const attendeeContactIds = Array.isArray(meeting.attendeeContactIds)
    ? meeting.attendeeContactIds
    : parseMeetingAttendeeContactIdsFromRow(
        meeting as unknown as Record<string, unknown>,
      );
  const project = meeting.projectId
    ? projectsById.get(meeting.projectId) ?? null
    : null;
  return {
    id: meeting.id,
    number: meeting.number,
    title: meeting.title,
    summary: meeting.summary ?? null,
    notes: meeting.notes ?? null,
    transcription: meeting.transcription ?? null,
    status: meeting.status,
    projectId: meeting.projectId ?? null,
    projectName: project?.name ?? null,
    organizationId: meeting.organizationId ?? null,
    attendeeContactIds,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
    trackedMinutes: meeting.trackedMinutes ?? null,
    trackedDurationSeconds: meeting.trackedDurationSeconds ?? null,
  };
}

export function mapContact(
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

export function mapOrganization(org: ApiOrganization): OrganizationListItem {
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
