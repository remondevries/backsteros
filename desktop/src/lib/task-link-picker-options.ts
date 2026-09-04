import {
  formatLetterDisplayId,
  getEmailItemHref,
  getEmailListItemHref,
  getKnowledgeHref,
  getProjectDocumentHref,
  resolveScopedLetterDetailHref,
  type EmailListItem,
  type KnowledgeListItem,
  type LetterListItem,
  type ProjectListItem,
  type TaskLinkPickerOption,
} from "@backsteros/ui";

type ProjectScopeSource = Pick<ProjectListItem, "id" | "key" | "name">;

/** Ownership label for attachment picker rows (project name or fallback). */
export function formatAttachmentScopeLabel(
  project: Pick<ProjectScopeSource, "name"> | null | undefined,
  fallback = "Knowledge Base",
): string {
  if (!project) return fallback;
  return project.name?.trim() || "Untitled project";
}

function resolveProject(
  projectId: string | null | undefined,
  projectKey: string | null | undefined,
  projects: readonly ProjectScopeSource[],
  projectsById: Map<string, ProjectScopeSource>,
): ProjectScopeSource | null {
  if (projectId) {
    const byId = projectsById.get(projectId);
    if (byId) return byId;
  }
  if (projectKey) {
    return projects.find((entry) => entry.key === projectKey) ?? null;
  }
  return null;
}

/** Build attachable document options for TaskLinkAttachments. */
export function buildDocumentLinkOptions(
  documents: readonly KnowledgeListItem[],
  projects: readonly ProjectScopeSource[] = [],
): TaskLinkPickerOption[] {
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  return documents
    .filter((doc) => (doc.kind ?? "document") === "document")
    .map((doc) => {
      const project = resolveProject(
        doc.projectId,
        null,
        projects,
        projectsById,
      );
      const href =
        project != null
          ? getProjectDocumentHref(project.key, doc.path ?? doc.id)
          : getKnowledgeHref(doc.path ?? doc.id);
      return {
        id: doc.id,
        label: doc.title?.trim() || "Untitled",
        href,
        // Path is internal — ownership is shown via scopeLabel instead.
        detail: null,
        kindLabel: "Document",
        scopeLabel: formatAttachmentScopeLabel(project, "Knowledge Base"),
      };
    });
}

/** Build attachable letter options for TaskLinkAttachments (Document tab). */
export function buildLetterLinkOptions(
  letters: readonly LetterListItem[],
  projects: readonly ProjectScopeSource[] = [],
): TaskLinkPickerOption[] {
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  return letters.map((letter) => {
    const project = resolveProject(
      letter.projectId,
      letter.projectKey,
      projects,
      projectsById,
    );
    const scope = project
      ? { kind: "project" as const, projectRouteParam: project.key }
      : { kind: "global" as const };
    return {
      id: letter.id,
      label: letter.title?.trim() || "Untitled",
      href: resolveScopedLetterDetailHref(letter, scope),
      detail:
        letter.number != null
          ? formatLetterDisplayId(letter.number)
          : letter.id,
      kindLabel: "Letter",
      scopeLabel: formatAttachmentScopeLabel(project, "Letters"),
    };
  });
}

/** Build attachable email options from AgentMail list rows. */
export function buildEmailLinkOptions(
  messages: readonly EmailListItem[],
): TaskLinkPickerOption[] {
  return messages.map((item) => ({
    id: `${item.kind}:${item.inboxId}:${item.id}`,
    label: item.subject?.trim() || "(no subject)",
    href:
      item.kind === "draft"
        ? getEmailListItemHref(item)
        : getEmailItemHref(item.inboxId, item.id),
    detail: item.from?.trim() || null,
  }));
}
