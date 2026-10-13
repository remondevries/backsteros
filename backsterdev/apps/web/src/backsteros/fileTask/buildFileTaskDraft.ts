import type {
  BacksterosCodebaseProject,
  BacksterosContact,
  BacksterosCreateTaskInput,
} from "../types";
import { amsterdamEndOfDayDueDateIso } from "./amsterdamDueDate";

export const FILE_TASK_DEFAULT_PRIORITY = 3;

/** Soft signal that a codebase brief may be non-coding work. */
const NON_CODING_HINT =
  /\b(invoice|invoicing|billing|bookkeep|accounting|payroll|support ticket|customer email|meeting notes?|calendar invite|travel|expense|hr\b|recruiting|marketing copy|social media)\b/i;

export type FileTaskDraft = {
  readonly title: string;
  readonly description: string;
  readonly projectId: string;
  readonly projectKey: string | null;
  readonly projectName: string;
  readonly projectType: string;
  readonly status: "backlog";
  readonly priority: number;
  readonly dueDate: string;
  readonly assigneeId: string | null;
  readonly relatedContactIds: readonly string[];
  readonly nonCodingWarning: boolean;
  readonly brief: string;
};

export type BuildFileTaskDraftInput = {
  readonly brief: string;
  readonly project: BacksterosCodebaseProject;
  readonly contacts: readonly BacksterosContact[];
  readonly agentContactId?: string | null;
  readonly defaultAssigneeId?: string | null;
  readonly now?: Date;
};

export function looksLikeNonCodingBrief(brief: string): boolean {
  return NON_CODING_HINT.test(brief);
}

/** Prefer Remon when driving BDV; else explicit default; else first contact. */
export function resolveFileTaskAssigneeId(input: {
  readonly contacts: readonly BacksterosContact[];
  readonly defaultAssigneeId?: string | null | undefined;
}): string | null {
  const { contacts, defaultAssigneeId } = input;
  if (defaultAssigneeId && contacts.some((contact) => contact.id === defaultAssigneeId)) {
    return defaultAssigneeId;
  }
  const remon = contacts.find((contact) => {
    const blob = [contact.name, contact.firstName, contact.lastName, contact.email]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return blob.includes("remon");
  });
  if (remon) return remon.id;
  return contacts[0]?.id ?? null;
}

export function titleFromBrief(brief: string): string {
  const trimmed = brief.trim();
  if (!trimmed) return "Untitled task";
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() ?? trimmed;
  const sentence = firstLine.split(/(?<=[.!?])\s+/, 1)[0]?.trim() ?? firstLine;
  const compact = sentence.replace(/\s+/g, " ");
  if (compact.length <= 90) return compact;
  return `${compact.slice(0, 87).trimEnd()}…`;
}

export function buildFileTaskDescription(input: {
  readonly brief: string;
  readonly project: BacksterosCodebaseProject;
}): string {
  const brief = input.brief.trim();
  const { project } = input;
  const contextLines = [
    `- Project: ${project.key ? `${project.key} — ` : ""}${project.name}`,
    `- Type: ${project.type}`,
  ];
  if (project.githubRepository?.trim()) {
    contextLines.push(`- Repo: ${project.githubRepository.trim()}`);
  }
  if (project.localWorkingDirectory?.trim()) {
    contextLines.push(`- Working directory: ${project.localWorkingDirectory.trim()}`);
  }
  if (project.summary?.trim()) {
    contextLines.push(`- Summary: ${project.summary.trim()}`);
  }

  return [
    "## Goal",
    brief || "(describe the outcome)",
    "",
    "## Context",
    ...contextLines,
    "",
    "## Done when",
    "- ",
    "",
    "## Agent prompt",
    brief
      ? [
          "Implement this Backsteros task. Start working now.",
          "",
          `Task ID: ${project.key ? `${project.key}-?` : "(pending)"}`,
          `Title: ${titleFromBrief(brief)}`,
          `Working directory: ${project.localWorkingDirectory?.trim() || "(set after create)"}`,
          "",
          "Description:",
          brief,
        ].join("\n")
      : "",
    "",
    "## Out of scope",
    "- ",
  ].join("\n");
}

export function buildFileTaskDraft(input: BuildFileTaskDraftInput): FileTaskDraft {
  const brief = input.brief.trim();
  const isCodebase = input.project.type === "codebase";
  const assigneeId = resolveFileTaskAssigneeId({
    contacts: input.contacts,
    defaultAssigneeId: input.defaultAssigneeId,
  });
  const related = new Set<string>();
  const agentId = input.agentContactId?.trim();
  if (agentId) related.add(agentId);

  return {
    title: titleFromBrief(brief),
    description: buildFileTaskDescription({ brief, project: input.project }),
    projectId: input.project.id,
    projectKey: input.project.key,
    projectName: input.project.name,
    projectType: input.project.type,
    status: "backlog",
    priority: FILE_TASK_DEFAULT_PRIORITY,
    dueDate: amsterdamEndOfDayDueDateIso(input.now ?? new Date()),
    assigneeId,
    relatedContactIds: [...related],
    nonCodingWarning: isCodebase && looksLikeNonCodingBrief(brief),
    brief,
  };
}

export function fileTaskDraftToCreateInput(draft: FileTaskDraft): BacksterosCreateTaskInput {
  if (!draft.assigneeId) {
    throw new Error("Assignee is required before filing a BacksterOS task.");
  }
  return {
    title: draft.title.trim(),
    projectId: draft.projectId,
    description: draft.description.trim() || null,
    status: draft.status,
    priority: draft.priority,
    dueDate: draft.dueDate,
    assigneeId: draft.assigneeId,
    relatedContactIds: draft.relatedContactIds,
    activityActor: "user",
  };
}
