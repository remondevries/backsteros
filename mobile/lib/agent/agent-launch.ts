/**
 * Initial prompt when starting an agent for a task (mobile port of desktop
 * `buildReadyToStartAgentPrompt`).
 */
export function buildReadyToStartAgentPrompt(task: {
  id: string;
  number?: number | null;
  title: string;
  description?: string | null;
  projectKey?: string | null;
  displayId?: string | null;
  workingDirectory?: string | null;
}): string {
  const displayId =
    task.displayId?.trim() ||
    (task.projectKey && task.number
      ? `${task.projectKey}-${task.number}`
      : null);
  const description = task.description?.trim() || "(none)";
  const workingDirectory = task.workingDirectory?.trim() || "~";

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
