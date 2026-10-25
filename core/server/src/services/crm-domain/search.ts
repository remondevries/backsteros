import { and, eq, ilike, isNull, notInArray, or, sql } from "drizzle-orm";
import { PROJECT_PICKER_DEFAULT_EXCLUDED_STATUSES } from "@backsteros/contracts";

import { contacts, documents, letters, organizations, projects } from "../../db/schema.js";
import { db } from "../../db/index.js";
import { searchTasks } from "../tasks-projects.js";
export type GlobalSearchMode =
  | "all"
  | "projects"
  | "tasks"
  | "documents"
  | "letters"
  | "knowledge"
  | "contacts"
  | "organizations";

export type GlobalSearchScope = {
  taskProjectId?: string;
  taskContactId?: string;
  taskInboxOnly?: boolean;
  documentProjectId?: string;
  letterProjectId?: string;
  letterContactId?: string;
  letterOrganizationId?: string;
  projectOrganizationId?: string;
  contactOrganizationId?: string;
  includeProjects: boolean;
  includeTasks: boolean;
  includeDocuments: boolean;
  includeLetters: boolean;
  includeKnowledgeDocuments: boolean;
  includeContacts: boolean;
  includeOrganizations: boolean;
};

function scopeForMode(mode: GlobalSearchMode): GlobalSearchScope {
  const empty = {
    includeProjects: false,
    includeTasks: false,
    includeDocuments: false,
    includeLetters: false,
    includeKnowledgeDocuments: false,
    includeContacts: false,
    includeOrganizations: false,
  };

  switch (mode) {
    case "projects":
      return { ...empty, includeProjects: true };
    case "tasks":
      return { ...empty, includeTasks: true };
    case "documents":
      return { ...empty, includeDocuments: true };
    case "letters":
      return { ...empty, includeLetters: true };
    case "knowledge":
      return { ...empty, includeKnowledgeDocuments: true };
    case "contacts":
      return { ...empty, includeContacts: true };
    case "organizations":
      return { ...empty, includeOrganizations: true };
    default:
      return {
        includeProjects: true,
        includeTasks: true,
        includeDocuments: true,
        includeLetters: true,
        includeKnowledgeDocuments: true,
        includeContacts: true,
        includeOrganizations: true,
      };
  }
}

function scopeFromContextParams(input: {
  contextKind: string | null;
  projectId: string | null;
  projectSection: string | null;
  contactId: string | null;
  contactSection: string | null;
  organizationId: string | null;
  organizationSection: string | null;
}): GlobalSearchScope | null {
  const empty = {
    includeProjects: false,
    includeTasks: false,
    includeDocuments: false,
    includeLetters: false,
    includeKnowledgeDocuments: false,
    includeContacts: false,
    includeOrganizations: false,
  };

  const kind = input.contextKind;
  if (!kind) return null;

  switch (kind) {
    case "inbox":
      return { ...empty, taskInboxOnly: true, includeTasks: true };
    case "tasks":
      return { ...empty, includeTasks: true };
    case "knowledge":
      return { ...empty, includeKnowledgeDocuments: true };
    case "letters":
      return { ...empty, includeLetters: true };
    case "contacts":
      return { ...empty, includeContacts: true };
    case "organizations":
      return { ...empty, includeOrganizations: true };
    case "projects":
      return { ...empty, includeProjects: true };
    case "project": {
      const projectId = input.projectId;
      if (!projectId) return { ...empty, includeProjects: true };
      const section = input.projectSection ?? "overview";
      if (section === "documents") {
        return {
          ...empty,
          documentProjectId: projectId,
          includeDocuments: true,
        };
      }
      if (section === "tasks") {
        return { ...empty, taskProjectId: projectId, includeTasks: true };
      }
      if (section === "letters") {
        return { ...empty, letterProjectId: projectId, includeLetters: true };
      }
      return {
        ...empty,
        taskProjectId: projectId,
        documentProjectId: projectId,
        letterProjectId: projectId,
        includeTasks: true,
        includeDocuments: true,
        includeLetters: true,
      };
    }
    case "contact": {
      const contactId = input.contactId;
      if (!contactId) return { ...empty, includeContacts: true };
      const section = input.contactSection ?? "overview";
      if (section === "tasks") {
        return { ...empty, taskContactId: contactId, includeTasks: true };
      }
      if (section === "letters") {
        return { ...empty, letterContactId: contactId, includeLetters: true };
      }
      return {
        ...empty,
        taskContactId: contactId,
        letterContactId: contactId,
        includeTasks: true,
        includeLetters: true,
      };
    }
    case "organization": {
      const organizationId = input.organizationId;
      if (!organizationId) return { ...empty, includeOrganizations: true };
      const section = input.organizationSection ?? "overview";
      if (section === "projects") {
        return {
          ...empty,
          projectOrganizationId: organizationId,
          includeProjects: true,
        };
      }
      if (section === "contacts") {
        return {
          ...empty,
          contactOrganizationId: organizationId,
          includeContacts: true,
        };
      }
      if (section === "letters") {
        return {
          ...empty,
          letterOrganizationId: organizationId,
          includeLetters: true,
        };
      }
      return {
        ...empty,
        projectOrganizationId: organizationId,
        contactOrganizationId: organizationId,
        letterOrganizationId: organizationId,
        includeProjects: true,
        includeContacts: true,
        includeLetters: true,
      };
    }
    default:
      return null;
  }
}

export async function globalSearch(
  workspaceId: string,
  q: string,
  limit = 20,
  options?: {
    mode?: GlobalSearchMode;
    contextKind?: string | null;
    projectId?: string | null;
    projectSection?: string | null;
    contactId?: string | null;
    contactSection?: string | null;
    organizationId?: string | null;
    organizationSection?: string | null;
  },
) {
  const pattern = `%${q}%`;
  const mode = options?.mode ?? "all";
  const contextScope =
    mode === "all"
      ? scopeFromContextParams({
          contextKind: options?.contextKind ?? null,
          projectId: options?.projectId ?? null,
          projectSection: options?.projectSection ?? null,
          contactId: options?.contactId ?? null,
          contactSection: options?.contactSection ?? null,
          organizationId: options?.organizationId ?? null,
          organizationSection: options?.organizationSection ?? null,
        })
      : null;
  const scope = contextScope ?? scopeForMode(mode);

  const projectConditions = [
    eq(projects.workspaceId, workspaceId),
    isNull(projects.deletedAt),
    or(ilike(projects.name, pattern), ilike(projects.summary, pattern)),
    notInArray(projects.status, [...PROJECT_PICKER_DEFAULT_EXCLUDED_STATUSES]),
  ];
  if (scope.projectOrganizationId) {
    projectConditions.push(eq(projects.organizationId, scope.projectOrganizationId));
  }

  const projectDocConditions = [
    eq(documents.workspaceId, workspaceId),
    isNull(documents.deletedAt),
    eq(documents.type, "project"),
    or(
      ilike(documents.title, pattern),
      ilike(documents.path, pattern),
      ilike(documents.snippet, pattern),
    ),
  ];
  if (scope.documentProjectId) {
    projectDocConditions.push(eq(documents.projectId, scope.documentProjectId));
  }

  const knowledgeDocConditions = [
    eq(documents.workspaceId, workspaceId),
    isNull(documents.deletedAt),
    eq(documents.type, "knowledge"),
    or(
      ilike(documents.title, pattern),
      ilike(documents.path, pattern),
      ilike(documents.snippet, pattern),
    ),
  ];

  const orgConditions = [
    eq(organizations.workspaceId, workspaceId),
    isNull(organizations.deletedAt),
    ilike(organizations.name, pattern),
  ];

  const contactConditions = [
    eq(contacts.workspaceId, workspaceId),
    isNull(contacts.deletedAt),
    or(
      ilike(contacts.name, pattern),
      ilike(contacts.firstName, pattern),
      ilike(contacts.lastName, pattern),
      ilike(contacts.email, pattern),
      sql`exists (
        select 1 from jsonb_array_elements(${contacts.emails}) as e(value)
        where coalesce(e.value->>'address', e.value #>> '{}') ilike ${pattern}
      )`,
    ),
  ];
  if (scope.contactOrganizationId) {
    contactConditions.push(eq(contacts.organizationId, scope.contactOrganizationId));
  }

  const letterConditions = [
    eq(letters.workspaceId, workspaceId),
    isNull(letters.deletedAt),
    ilike(letters.title, pattern),
  ];
  if (scope.letterProjectId) {
    letterConditions.push(eq(letters.projectId, scope.letterProjectId));
  }
  if (scope.letterContactId) {
    letterConditions.push(eq(letters.contactId, scope.letterContactId));
  }
  if (scope.letterOrganizationId) {
    letterConditions.push(eq(letters.organizationId, scope.letterOrganizationId));
  }

  const [
    projectRows,
    taskSearch,
    projectDocumentRows,
    knowledgeDocumentRows,
    organizationRows,
    contactRows,
    letterRows,
  ] = await Promise.all([
    scope.includeProjects
      ? db
          .select()
          .from(projects)
          .where(and(...projectConditions))
          .limit(limit)
      : Promise.resolve([]),
    // OS-73: palette task hits use the same searchTasks path as GET /search?type=task.
    scope.includeTasks
      ? searchTasks({
          workspaceId,
          q,
          projectId: scope.taskProjectId,
          contactId: scope.taskContactId,
          inboxOnly: scope.taskInboxOnly,
          limit,
          // Palette should still surface closed tasks (OS-81 agent default).
          applyDefaultStatusExclusion: false,
        })
      : Promise.resolve({ results: [], nextCursor: null }),
    scope.includeDocuments
      ? db
          .select()
          .from(documents)
          .where(and(...projectDocConditions))
          .limit(limit)
      : Promise.resolve([]),
    scope.includeKnowledgeDocuments
      ? db
          .select()
          .from(documents)
          .where(and(...knowledgeDocConditions))
          .limit(limit)
      : Promise.resolve([]),
    scope.includeOrganizations
      ? db
          .select()
          .from(organizations)
          .where(and(...orgConditions))
          .limit(limit)
      : Promise.resolve([]),
    scope.includeContacts
      ? db
          .select()
          .from(contacts)
          .where(and(...contactConditions))
          .limit(limit)
      : Promise.resolve([]),
    scope.includeLetters
      ? db
          .select()
          .from(letters)
          .where(and(...letterConditions))
          .limit(limit)
      : Promise.resolve([]),
  ]);

  const taskRows = taskSearch.results;

  return [
    ...projectRows.map((row) => ({
      type: "project" as const,
      id: row.id,
      title: row.name,
      snippet: row.summary,
      updatedAt: row.updatedAt,
      documentType: null as null,
      path: null as null,
      projectId: null as null,
      projectStatus: row.status,
    })),
    ...taskRows.map((row) => ({
      type: "task" as const,
      id: row.id,
      title: row.title,
      snippet: row.snippet,
      updatedAt: new Date(row.updatedAt),
      documentType: null as null,
      path: null as null,
      projectId: row.projectId,
      key: row.key,
      status: row.status,
    })),
    ...projectDocumentRows.map((row) => ({
      type: "document" as const,
      id: row.id,
      title: row.title,
      snippet: row.snippet,
      updatedAt: row.updatedAt,
      documentType: "project" as const,
      path: row.path,
      projectId: row.projectId,
    })),
    ...knowledgeDocumentRows.map((row) => ({
      type: "document" as const,
      id: row.id,
      title: row.title,
      snippet: row.snippet,
      updatedAt: row.updatedAt,
      documentType: "knowledge" as const,
      path: row.path,
      projectId: null as null,
    })),
    ...organizationRows.map((row) => ({
      type: "organization" as const,
      id: row.id,
      title: row.name,
      snippet: row.summary,
      updatedAt: row.updatedAt,
      documentType: null as null,
      path: null as null,
      projectId: null as null,
    })),
    ...contactRows.map((row) => ({
      type: "contact" as const,
      id: row.id,
      title: row.name,
      snippet: row.email,
      updatedAt: row.updatedAt,
      documentType: null as null,
      path: null as null,
      projectId: null as null,
    })),
    ...letterRows.map((row) => ({
      type: "letter" as const,
      id: row.id,
      title: row.title,
      snippet: row.context,
      updatedAt: row.updatedAt,
      documentType: null as null,
      path: null as null,
      projectId: null as null,
    })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit)
    .map((row) => ({
      type: row.type,
      id: row.id,
      title: row.title,
      snippet: row.snippet,
      updatedAt: row.updatedAt.toISOString(),
      ...(row.documentType ? { documentType: row.documentType } : {}),
      ...(row.path ? { path: row.path } : {}),
      ...(row.projectId ? { projectId: row.projectId } : {}),
      ...("key" in row && row.key ? { key: row.key } : {}),
      ...("status" in row && row.status ? { status: row.status } : {}),
      ...("projectStatus" in row && row.projectStatus
        ? { projectStatus: row.projectStatus }
        : {}),
    }));
}
