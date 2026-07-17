/**
 * Circle-compatible entity shapes used by ported list/board UI.
 * API responses (ISO strings) are normalized to these Date fields in screens.
 */
import type {
  Contact as ApiContact,
  Organization as ApiOrganization,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";

import type { ProjectArea } from "@/lib/project-areas";
import type { ProjectStatus } from "@/lib/project-status";
import type { TaskPriority } from "@/lib/task-priority";
import type { TaskStatus } from "@/lib/task-status";

export type { ProjectArea, ProjectStatus, TaskPriority, TaskStatus };

export type Task = Omit<
  ApiTask,
  "dueDate" | "triagedAt" | "completedAt" | "createdAt" | "updatedAt" | "deletedAt" | "status" | "priority"
> & {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  triagedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type Project = Omit<
  ApiProject,
  "startDate" | "dueDate" | "createdAt" | "updatedAt" | "deletedAt" | "status" | "priority" | "area"
> & {
  status: ProjectStatus;
  priority: TaskPriority;
  area: ProjectArea | null;
  startDate: Date | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type Contact = Omit<
  ApiContact,
  "createdAt" | "updatedAt" | "deletedAt"
> & {
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type Organization = Omit<
  ApiOrganization,
  "createdAt" | "updatedAt" | "deletedAt"
> & {
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type Letter = {
  id: string;
  number: number | null;
  title: string;
  status: string;
  projectId: string | null;
  organizationId: string | null;
  contactId: string | null;
  icon: string | null;
  context: string | null;
  storageKey: string | null;
  originalFilename: string | null;
  dueDate: Date | null;
  receivedDate: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};
