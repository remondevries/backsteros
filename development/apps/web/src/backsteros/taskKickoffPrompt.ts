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
 * True while the composer still holds our auto-prefilled kickoff (not a user rewrite).
 */
export function isBacksterosManagedKickoffPrompt(prompt: string): boolean {
  return prompt.trimStart().startsWith(BACKSTEROS_TASK_KICKOFF_LEAD);
}

/** Reads `Working directory:` from a managed kickoff so live sync can preserve cwd. */
export function extractKickoffWorkingDirectory(prompt: string): string | null {
  const match = /^Working directory:\s*(.+)$/m.exec(prompt);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * Prefill for a new BacksterDEV task chat (composer draft).
 * Mirrors BacksterOS desktop `buildReadyToStartAgentPrompt`, plus CLI workflow.
 */
export function buildBacksterosTaskKickoffPrompt(task: BacksterosTaskKickoffInput): string {
  const displayId =
    getBacksterosTaskDisplayId({ number: task.number }, task.projectKey ?? null) ?? task.id;
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
    '- Examples: `backsteros comment create DOT-1 -m "…"` · `backsteros task get DOT-1`',
    "- BacksterDEV auto-moves status to In Progress while you work and In Review when you go idle — do not fight that.",
    "- When you finish, leave a short `backsteros comment` on this task explaining what changed.",
    "- Only change status yourself when the user asks (e.g. completed) or you are blocked (`on_hold`).",
    "- If the user sends `/done`, that is an explicit finish request: review/update the description (problem framing, grammar, formatting), commit, push, link commit SHAs, comment with the resolution, and mark completed.",
  ].join("\n");
}

export type BacksterosTaskDonePromptInput = {
  readonly displayId: string;
  readonly title?: string | null;
};

/**
 * Message sent when the user submits `/done` in a BacksterOS task chat.
 * Instructs the agent to ship the work and close the task.
 */
export function buildBacksterosTaskDonePrompt(task: BacksterosTaskDonePromptInput): string {
  const displayId = task.displayId.trim() || "UNKNOWN";
  const title = task.title?.trim() || "Untitled";

  return [
    "Finish this BacksterOS task now. The user invoked `/done`.",
    "",
    `Task ID: ${displayId}`,
    `Title: ${title}`,
    "",
    "Do all of the following (do not ask for confirmation):",
    "1. Review the task title and description (`backsteros task get`) and update them if needed so they accurately reflect the issue/task at hand — what was wrong, missing, or requested.",
    "   Also polish grammar, spelling, punctuation, and formatting so the card reads cleanly for a later reader (complete sentences, consistent casing, no obvious typos).",
    '   Important (timeline sense): write the description as the problem or request as discovered, not as already fixed. Do not rewrite a bug as if it never existed or as a past-tense "we fixed X". The description is the work statement; resolution belongs in the comment.',
    "   Skip the update only when accuracy, grammar, and formatting are already good.",
    `   backsteros task update ${displayId} --title "…" --description "…"`,
    "2. Commit any remaining work in the linked repo (follow the project's git commit conventions). Include the task id in the commit message when it fits naturally.",
    "3. Push the commit(s) to the remote.",
    "4. Link the commit SHA(s) on the task. `linkedCommitShas` replaces the full list, so keep any existing SHAs and append the new ones:",
    `   backsteros task get ${displayId} --json`,
    `   backsteros task update ${displayId} --body '{"linkedCommitShas":["<sha>",...]}'`,
    "5. Leave a short completion comment explaining what you did and how the issue/task was addressed or resolved:",
    `   backsteros comment create ${displayId} -m "…"`,
    "6. Mark the task completed:",
    `   backsteros task update ${displayId} --status completed`,
    "",
    "If there is nothing to commit, still link the relevant existing SHA(s) when possible, then comment and complete.",
  ].join("\n");
}
