export const AGENT_ATTENTION_NOTIFY_STATUSES = [
  "in_review",
  "on_hold",
] as const;

export type AgentAttentionNotifyStatus =
  (typeof AGENT_ATTENTION_NOTIFY_STATUSES)[number];

export type AgentAttentionNotificationPayload = {
  /** Stable dedupe key, e.g. agent:in_review:task-uuid */
  key: string;
  kind: "agent_task";
  title: string;
  body: string;
  href: string;
};

export function isAgentAttentionNotifyStatus(
  status: string | null | undefined,
): status is AgentAttentionNotifyStatus {
  return status === "in_review" || status === "on_hold";
}

export function agentAttentionNotificationKey(
  taskId: string,
  status: AgentAttentionNotifyStatus,
): string {
  return `agent:${status}:${taskId}`;
}

export function buildAgentAttentionNotification(input: {
  id: string;
  title: string;
  status: AgentAttentionNotifyStatus;
  displayId?: string | null;
  href: string;
}): AgentAttentionNotificationPayload {
  const taskLabel = input.displayId?.trim()
    ? `${input.displayId.trim()} ${input.title}`.trim()
    : input.title.trim() || "Task";

  if (input.status === "in_review") {
    return {
      key: agentAttentionNotificationKey(input.id, input.status),
      kind: "agent_task",
      title: "Agent finished",
      body: `${taskLabel} — ready for review`,
      href: input.href,
    };
  }

  return {
    key: agentAttentionNotificationKey(input.id, input.status),
    kind: "agent_task",
    title: "Agent needs input",
    body: taskLabel,
    href: input.href,
  };
}

/** Server push when an agent moves a task into In Review or On Hold. */
export function taskStatusChangeQualifiesForAgentAttentionPush(input: {
  previousStatus: string;
  nextStatus: string;
  actorKind?: "user" | "agent" | "contact" | null;
}): boolean {
  if (input.actorKind !== "agent") return false;
  if (input.previousStatus === input.nextStatus) return false;
  return isAgentAttentionNotifyStatus(input.nextStatus);
}

export function collectAgentAttentionTransitions(input: {
  previous: ReadonlyMap<string, string>;
  next: readonly {
    id: string;
    status: string;
    title: string;
    displayId?: string | null;
  }[];
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
    if (suppress.has(task.id)) continue;
    if (!isAgentAttentionNotifyStatus(task.status)) continue;
    const prev = input.previous.get(task.id);
    if (prev === undefined) continue;
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
