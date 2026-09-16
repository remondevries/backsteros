import {
  buildDocumentFoldersByTarget,
  type ComposeDocumentFoldersByTarget,
} from "../../packages/ui/src/compose/compose-document-folders.js";
import { COMPOSE_KNOWLEDGE_BASE_VALUE } from "../../packages/ui/src/compose/compose-task.js";

import { getDefaultAssigneeId } from "./default-assignee";

/** Mirrors `@backsteros/ui` ComposeModalProject — kept local for node tests. */
export type ComposeOverlayProject = {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  type: string | null;
  color: string | null;
  dueDate: Date | null;
};

/** Mirrors `@backsteros/ui` AssigneeDropdownContact. */
export type ComposeOverlayContact = {
  id: string;
  name: string;
  email: string | null;
  emails: Array<{ label?: string | null; address?: string | null } | string>;
  organizationName: string | null;
  avatarSrc: string | null;
};

export type ComposeOverlayContext = {
  projects: ComposeOverlayProject[];
  contacts: ComposeOverlayContact[];
  documentFoldersByTarget: ComposeDocumentFoldersByTarget;
  projectsById: Map<string, { id: string; key: string; name: string }>;
  defaultAssigneeId: string | null;
};

/** JSON-safe payload for main → overlay webview (no PowerSync in overlay). */
export type ComposeOverlayContextSnapshot = {
  projects: Array<
    Omit<ComposeOverlayProject, "dueDate"> & { dueDate: string | null }
  >;
  contacts: ComposeOverlayContact[];
  documentFoldersByTarget: ComposeDocumentFoldersByTarget;
  projectsById: Array<[string, { id: string; key: string; name: string }]>;
  defaultAssigneeId: string | null;
};

export type ComposeOverlayDocumentFolderSource = {
  path: string;
  title: string;
  kind: string;
  type: "knowledge" | "project";
  projectId: string | null;
};

export type ComposeOverlayProjectSource = {
  id: string;
  key: string;
  name: string;
  icon?: string | null;
  type?: string | null;
  dueDate?: Date | string | number | null;
};

export type ComposeOverlayContactSource = {
  id: string;
  name: string;
  email?: string | null;
  emails?:
    | Array<{ label?: string | null; address?: string | null } | string>
    | null;
  organizationName?: string | null;
  avatarSrc?: string | null;
};

function toComposeDueDate(
  value: Date | string | number | null | undefined,
): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Build compose options from already-hydrated workspace rows (main shell) or
 * REST list bodies (overlay cold fallback). No network.
 */
export function buildComposeOverlayContext(input: {
  projects: readonly ComposeOverlayProjectSource[];
  contacts: readonly ComposeOverlayContactSource[];
  documents: readonly ComposeOverlayDocumentFolderSource[];
  defaultAssigneeId?: string | null;
}): ComposeOverlayContext {
  const projects: ComposeOverlayProject[] = input.projects.map((project) => ({
    id: project.id,
    key: project.key,
    name: project.name,
    icon: project.icon ?? null,
    type: project.type ?? null,
    color: null,
    dueDate: toComposeDueDate(project.dueDate),
  }));

  const contacts: ComposeOverlayContact[] = input.contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    email: contact.email ?? null,
    emails: contact.emails ?? [],
    organizationName: contact.organizationName ?? null,
    avatarSrc: contact.avatarSrc ?? null,
  }));

  const documentFoldersByTarget = buildDocumentFoldersByTarget(
    input.documents.map((document) => ({
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
    projects.map((project) => [
      project.id,
      { id: project.id, key: project.key, name: project.name },
    ]),
  );

  return {
    projects,
    contacts,
    documentFoldersByTarget,
    projectsById,
    defaultAssigneeId:
      input.defaultAssigneeId !== undefined
        ? input.defaultAssigneeId
        : getDefaultAssigneeId(),
  };
}

export function composeOverlayContextToSnapshot(
  context: ComposeOverlayContext,
): ComposeOverlayContextSnapshot {
  return {
    projects: context.projects.map((project) => ({
      ...project,
      dueDate: project.dueDate ? project.dueDate.toISOString() : null,
    })),
    contacts: context.contacts,
    documentFoldersByTarget: context.documentFoldersByTarget,
    projectsById: [...context.projectsById.entries()],
    defaultAssigneeId: context.defaultAssigneeId,
  };
}

export function composeOverlayContextFromSnapshot(
  snapshot: ComposeOverlayContextSnapshot,
): ComposeOverlayContext {
  return {
    projects: snapshot.projects.map((project) => ({
      ...project,
      dueDate: toComposeDueDate(project.dueDate),
    })),
    contacts: snapshot.contacts,
    documentFoldersByTarget: snapshot.documentFoldersByTarget,
    projectsById: new Map(snapshot.projectsById),
    defaultAssigneeId: snapshot.defaultAssigneeId,
  };
}
