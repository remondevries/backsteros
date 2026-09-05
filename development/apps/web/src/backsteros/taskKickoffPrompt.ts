import { getBacksterosTaskDisplayId } from "./types";

export type BacksterosTaskKickoffInput = {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly description?: string | null;
  readonly projectKey?: string | null;
  readonly workingDirectory?: string | null;
};

/** Lead line — also used by the global Cursor skill as the BacksterOS-task trigger. */
export const BACKSTEROS_TASK_KICKOFF_LEAD =
  "Implement this Backsteros task. Start working now." as const;

/**
 * Prefill for a new BacksterDEV task chat (composer draft).
 * Mirrors BacksterOS desktop `buildReadyToStartAgentPrompt`, plus CLI workflow.
 */
export function buildBacksterosTaskKickoffPrompt(
  task: BacksterosTaskKickoffInput,
): string {
  const displayId =
    getBacksterosTaskDisplayId(
      { number: task.number },
      task.projectKey ?? null,
    ) ?? task.id;
  const description = task.description?.trim() || "(none)";
  const workingDirectory = task.workingDirectory?.trim() || "~";

  return [
    BACKSTEROS_TASK_KICKOFF_LEAD,
    "",
    `Task ID: ${displayId}`,
    `Title: ${task.title.trim() || "Untitled"}`,
    `Working directory: ${workingDirectory}`,
    workingDirectory === "~"
      ? "(No project folder is set — stay in the linked workspace unless the task requires otherwise.)"
      : "(Your shell should already be in this directory — stay here unless the task requires otherwise.)",
    "",
    "Description:",
    description,
    "",
    "BacksterOS workflow:",
    "- Use the `backsteros` CLI for task/comment updates (auth: ~/.config/backsteros/cli.env).",
    "- Examples: `backsteros comment create DOT-1 -m \"…\"` · `backsteros task get DOT-1`",
    "- BacksterDEV auto-moves status to In Progress while you work and In Review when you go idle — do not fight that.",
    "- When you finish, leave a short `backsteros comment` on this task explaining what changed.",
    "- Only change status yourself when the user asks (e.g. completed) or you are blocked (`on_hold`).",
  ].join("\n");
}
