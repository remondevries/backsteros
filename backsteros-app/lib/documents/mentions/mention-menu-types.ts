import type { ProjectArea } from "@/lib/project-areas";
import type { ProjectStatus } from "@/lib/project-status";
import type { TaskPriority } from "@/lib/task-priority";
import type { TaskStatus } from "@/lib/task-status";

export type MentionKind =
  | "task"
  | "project"
  | "contact"
  | "organization"
  | "document"
  | "letter";

export type MentionCatalogTask = {
  id: string;
  displayId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: number | null;
  description: string | null;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  projectIcon: string | null;
  contactKey: string | null;
};

export type MentionCatalogProject = {
  id: string;
  key: string;
  name: string;
  color: string | null;
  icon: string | null;
  summary: string | null;
  status: ProjectStatus;
  area: ProjectArea | null;
};

export type MentionCatalogDocument = {
  id: string;
  projectId: string | null;
  projectKey: string;
  projectName: string;
  relativePath: string;
  title: string;
  icon: string | null;
  updatedAt: number;
};

export type MentionCatalogContact = {
  id: string;
  key: string;
  number: number | null;
  displayId: string | null;
  name: string;
  email: string | null;
  title: string | null;
  summary: string | null;
  avatarStorageKey: string | null;
  avatarUpdatedAt: number;
  organizationId: string | null;
  organizationKey: string | null;
  organizationName: string | null;
};

export type MentionCatalogOrganization = {
  id: string;
  key: string;
  number: number | null;
  displayId: string | null;
  name: string;
  email: string | null;
  summary: string | null;
  avatarStorageKey: string | null;
  avatarUpdatedAt: number;
};

export type MentionCatalogLetter = {
  id: string;
  displayId: string;
  title: string;
  status: TaskStatus;
  dueDate: number | null;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
};

export type MentionCatalog = {
  tasks: MentionCatalogTask[];
  projects: MentionCatalogProject[];
  contacts: MentionCatalogContact[];
  organizations: MentionCatalogOrganization[];
  documents: MentionCatalogDocument[];
  letters: MentionCatalogLetter[];
};

export type MentionMenuTriggerState = {
  from: number;
  to: number;
  query: string;
};

export type MentionItem =
  | {
      kind: "task";
      id: string;
      displayId: string;
      title: string;
      status: TaskStatus;
      projectName: string | null;
    }
  | {
      kind: "project";
      id: string;
      key: string;
      name: string;
      color: string | null;
      icon: string | null;
    }
  | {
      kind: "contact";
      id: string;
      key: string;
      name: string;
      title: string | null;
      organizationName: string | null;
      avatarStorageKey: string | null;
      avatarUpdatedAt: number;
    }
  | {
      kind: "organization";
      id: string;
      key: string;
      name: string;
      avatarStorageKey: string | null;
      avatarUpdatedAt: number;
    }
  | {
      kind: "document";
      id: string;
      projectId: string | null;
      projectKey: string;
      projectName: string;
      relativePath: string;
      title: string;
      icon: string | null;
    }
  | {
      kind: "letter";
      id: string;
      displayId: string;
      title: string;
      status: TaskStatus;
      projectName: string | null;
    };

export type MentionSection = {
  kind: MentionKind;
  heading: string;
  items: MentionItem[];
};

export type ParsedMentionToken =
  | { kind: "task"; displayId: string; raw: string }
  | { kind: "letter"; displayId: string; raw: string }
  | { kind: "project"; key: string; raw: string }
  | { kind: "contact"; key: string; raw: string }
  | { kind: "organization"; key: string; raw: string }
  | { kind: "document"; projectKey: string; relativePath: string; raw: string };
