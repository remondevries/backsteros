/**
 * OS / in-app notifications when an agent moves a task to In Review or On Hold.
 */

export const AGENT_ATTENTION_NOTIFY_STATUSES = [
  "in_review",
  "on_hold",
] as const;

export type AgentAttentionNotifyStatus =
  (typeof AGENT_ATTENTION_NOTIFY_STATUSES)[number];

const recentLocalStatusPatches = new Map<string, number>();
const LOCAL_PATCH_SUPPRESS_MS = 8_000;

/** Call when this client patches a task status so we do not echo a notification. */
export function noteLocalTaskStatusPatch(taskId: string): void {
  recentLocalStatusPatches.set(taskId, Date.now());
}

export function isRecentlyPatchedLocally(taskId: string): boolean {
  const at = recentLocalStatusPatches.get(taskId);
  if (at == null) return false;
  if (Date.now() - at > LOCAL_PATCH_SUPPRESS_MS) {
    recentLocalStatusPatches.delete(taskId);
    return false;
  }
  return true;
}

export function isAgentAttentionNotifyStatus(
  status: string | null | undefined,
): status is AgentAttentionNotifyStatus {
  return status === "in_review" || status === "on_hold";
}

export function buildAgentStatusNotification(input: {
  title: string;
  status: AgentAttentionNotifyStatus;
  displayId?: string | null;
}): { title: string; body: string } {
  const statusLabel =
    input.status === "in_review" ? "In Review" : "On Hold";
  const taskLabel = input.displayId?.trim()
    ? `${input.displayId.trim()} ${input.title}`.trim()
    : input.title.trim() || "Task";
  return {
    title: `Agent moved task to ${statusLabel}`,
    body: taskLabel,
  };
}

/** Detect transitions into in_review / on_hold that the local user did not just make. */
export function collectAgentAttentionTransitions(input: {
  previous: ReadonlyMap<string, string>;
  next: readonly {
    id: string;
    status: string;
    title: string;
    displayId?: string | null;
  }[];
  /** Task ids the user (or this client) recently patched — suppress those. */
  suppressIds?: ReadonlySet<string>;
}): Array<{
  id: string;
  title: string;
  status: AgentAttentionNotifyStatus;
  displayId?: string | null;
}> {
  const suppress = input.suppressIds ?? new Set<string>();
  const out: Array<{
    id: string;
    title: string;
    status: AgentAttentionNotifyStatus;
    displayId?: string | null;
  }> = [];

  for (const task of input.next) {
    if (suppress.has(task.id) || isRecentlyPatchedLocally(task.id)) continue;
    if (!isAgentAttentionNotifyStatus(task.status)) continue;
    const prev = input.previous.get(task.id);
    if (prev === undefined) continue; // first snapshot — no notify
    if (prev === task.status) continue;
    out.push({
      id: task.id,
      title: task.title,
      status: task.status,
      displayId: task.displayId,
    });
  }
  return out;
}
