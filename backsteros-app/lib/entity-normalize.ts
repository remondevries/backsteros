import type {
  Contact as ApiContact,
  Letter as ApiLetter,
  Organization as ApiOrganization,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";

import type {
  Contact,
  Letter,
  Organization,
  Project,
  Task,
} from "@/lib/db/schema";
import type { ProjectArea } from "@/lib/project-areas";
import type { ProjectStatus } from "@/lib/project-status";
import type { TaskPriority } from "@/lib/task-priority";
import type { TaskStatus } from "@/lib/task-status";

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asRequiredDate(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export function normalizeTask(task: ApiTask): Task {
  return {
    ...task,
    status: task.status as TaskStatus,
    priority: task.priority as TaskPriority,
    dueDate: asDate(task.dueDate),
    triagedAt: asDate(task.triagedAt),
    completedAt: asDate(task.completedAt),
    createdAt: asRequiredDate(task.createdAt),
    updatedAt: asRequiredDate(task.updatedAt),
    deletedAt: asDate(task.deletedAt),
  };
}

export function normalizeProject(project: ApiProject): Project {
  return {
    ...project,
    status: project.status as ProjectStatus,
    priority: project.priority as TaskPriority,
    area: (project.area ?? null) as ProjectArea | null,
    startDate: asDate(project.startDate),
    dueDate: asDate(project.dueDate),
    createdAt: asRequiredDate(project.createdAt),
    updatedAt: asRequiredDate(project.updatedAt),
    deletedAt: asDate(project.deletedAt),
  };
}

export function normalizeContact(contact: ApiContact): Contact {
  let socialAccounts = contact.socialAccounts ?? [];
  const rawSocial = (contact as ApiContact & { socialAccounts?: unknown })
    .socialAccounts;
  if (typeof rawSocial === "string") {
    try {
      const parsed = JSON.parse(rawSocial) as unknown;
      socialAccounts = Array.isArray(parsed)
        ? (parsed as Contact["socialAccounts"])
        : [];
    } catch {
      socialAccounts = [];
    }
  } else if (Array.isArray(rawSocial)) {
    socialAccounts = rawSocial as Contact["socialAccounts"];
  }

  return {
    ...contact,
    address: contact.address ?? null,
    city: contact.city ?? null,
    postalCode: contact.postalCode ?? null,
    country: contact.country ?? null,
    socialAccounts,
    createdAt: asRequiredDate(contact.createdAt),
    updatedAt: asRequiredDate(contact.updatedAt),
    deletedAt: asDate(contact.deletedAt),
  };
}

export function normalizeOrganization(org: ApiOrganization): Organization {
  return {
    ...org,
    createdAt: asRequiredDate(org.createdAt),
    updatedAt: asRequiredDate(org.updatedAt),
    deletedAt: asDate(org.deletedAt),
  };
}

export function normalizeLetter(letter: ApiLetter): Letter {
  return {
    id: letter.id,
    number: letter.number,
    title: letter.title,
    status: letter.status,
    projectId: letter.projectId,
    organizationId: letter.organizationId,
    contactId: letter.contactId,
    icon: letter.icon,
    context: letter.context,
    storageKey: letter.storageKey,
    originalFilename: letter.originalFilename,
    dueDate: asDate(letter.dueDate),
    receivedDate: asDate(letter.receivedDate),
    sortOrder: letter.sortOrder,
    createdAt: asRequiredDate(letter.createdAt),
    updatedAt: asRequiredDate(letter.updatedAt),
    deletedAt: asDate(letter.deletedAt),
  };
}

/** Convert a calendar/local Date (or ymd string) to ISO for API payloads. */
export function dueDateToIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return new Date(`${trimmed}T12:00:00.000Z`).toISOString();
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return value.toISOString();
}
