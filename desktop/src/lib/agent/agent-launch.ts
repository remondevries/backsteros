import { formatTaskDisplayId } from "@backsteros/ui";

import { normalizeWorkingDirectory } from "./project-workspace";

export type ReadyToStartAgentTask = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  projectKey?: string | null;
  /** Absolute local workspace for the project (PTY / agent cwd). */
  workingDirectory?: string | null;
};

/**
 * @deprecated Prefer ensuring the project vault folder so agents always have a cwd.
 * Kept so older call sites compile; always returns null.
 */
export function missingProjectDirectoryError(
  _projectId?: string | null,
  _workingDirectory?: string | null,
): string | null {
  return null;
}

/**
 * Initial prompt when auto-starting an agent for Ready to Start.
 * Asks the agent to implement the task so a real turn begins
 * (status advances to In Progress when the turn is working).
 *
 * Working directory is the project vault folder (or an explicit codebase path).
 */
export function buildReadyToStartAgentPrompt(
  task: ReadyToStartAgentTask,
): string {
  const displayId =
    task.projectKey && task.number
      ? formatTaskDisplayId(task.projectKey, task.number)
      : null;
  const description = task.description?.trim() || "(none)";
  const workingDirectory =
    normalizeWorkingDirectory(task.workingDirectory) ?? "~";

  return [
    "Implement this Backsteros task. Start working now.",
    "",
    displayId ? `Task ID: ${displayId}` : `Task ID: ${task.id}`,
    `Title: ${task.title.trim() || "Untitled"}`,
    `Working directory: ${workingDirectory}`,
    workingDirectory === "~"
      ? "(No project folder is set — your shell is in the user home directory. Stay here unless the task requires otherwise.)"
      : "(Your shell is already in this directory — stay here unless the task requires otherwise.)",
    "",
    "Description:",
    description,
  ].join("\n");
}
