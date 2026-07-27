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

export const MISSING_PROJECT_DIRECTORY_MESSAGE =
  "Set a working directory for this project before starting an agent.";

/**
 * Require a configured project folder before launching Cursor Agent.
 * Returns null when ok, or an error message when missing.
 */
export function missingProjectDirectoryError(
  projectId: string | null | undefined,
  workingDirectory?: string | null,
): string | null {
  if (!projectId) {
    return "This task has no project, so no working directory can be set.";
  }
  if (!normalizeWorkingDirectory(workingDirectory)) {
    return MISSING_PROJECT_DIRECTORY_MESSAGE;
  }
  return null;
}

/**
 * Initial prompt when auto-starting an agent for Ready to Start.
 * Asks the agent to implement the task so a real turn begins
 * (status advances to In Progress when the turn is working).
 */
export function buildReadyToStartAgentPrompt(
  task: ReadyToStartAgentTask,
): string {
  const displayId =
    task.projectKey && task.number
      ? formatTaskDisplayId(task.projectKey, task.number)
      : null;
  const description = task.description?.trim() || "(none)";
  const workingDirectory = normalizeWorkingDirectory(task.workingDirectory);

  return [
    "Implement this Backsteros task. Start working now.",
    "",
    displayId ? `Task ID: ${displayId}` : `Task ID: ${task.id}`,
    `Title: ${task.title.trim() || "Untitled"}`,
    ...(workingDirectory
      ? [
          `Working directory: ${workingDirectory}`,
          "(Your shell is already in this directory — stay here unless the task requires otherwise.)",
        ]
      : []),
    "",
    "Description:",
    description,
  ].join("\n");
}
