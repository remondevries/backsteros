import type { ProjectArea } from "../projects/project-areas.js";
import type { ProjectStatus } from "../projects/project-status.js";
import type { TaskPriority } from "../tasks/task-priority.js";
import type { TaskStatus } from "../tasks/task-status.js";
import type { MentionKind, ParsedMentionToken } from "./mention-tokens.js";

export type {
  MentionKind,
  ParsedMentionToken,
};

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
  type?: string | null;
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
  firstName?: string | null;
  lastName?: string | null;
  email: string | null;
  emails?: Array<{ label: string; address: string }> | null;
  phone?: string | null;
  phones?: Array<{ label: string; number: string }> | null;
  title: string | null;
  summary: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  region?: string | null;
  country?: string | null;
  socialAccounts?: Array<{ platform: string; url: string }> | null;
  avatarStorageKey: string | null;
  avatarUpdatedAt: number;
  avatarSrc?: string | null;
  organizationId: string | null;
  organizationKey: string | null;
  organizationName: string | null;
  organizationAvatarSrc?: string | null;
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
  avatarSrc?: string | null;
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

export type MentionCatalogEmail = {
  id: string;
  displayId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: number | null;
  inboxId: string;
  threadId: string | null;
  messageId: string;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  contactName: string | null;
};

export type MentionCatalog = {
  tasks: MentionCatalogTask[];
  projects: MentionCatalogProject[];
  contacts: MentionCatalogContact[];
  organizations: MentionCatalogOrganization[];
  documents: MentionCatalogDocument[];
  letters: MentionCatalogLetter[];
  emails: MentionCatalogEmail[];
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
      type?: string | null;
    }
  | {
      kind: "contact";
      id: string;
      key: string;
      number?: number | null;
      /** Human id like `C-12`; preferred in mention tokens when present. */
      displayId: string | null;
      name: string;
      title: string | null;
      organizationName: string | null;
      avatarStorageKey: string | null;
      avatarUpdatedAt: number;
      avatarSrc?: string | null;
    }
  | {
      kind: "organization";
      id: string;
      key: string;
      name: string;
      avatarStorageKey: string | null;
      avatarUpdatedAt: number;
      avatarSrc?: string | null;
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
    }
  | {
      kind: "email";
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
