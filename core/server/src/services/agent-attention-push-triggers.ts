import {
  isAgentAttentionNotifyStatus,
  taskStatusChangeQualifiesForAgentAttentionPush,
  type AgentAttentionNotificationPayload,
} from "@backsteros/contracts";

import type { TaskWriteActor } from "../lib/write-actor.js";
import { buildServerAgentAttentionNotification } from "./agent-attention-notification-payload.js";
import { notifyWorkspacePush } from "./push-inbox-triage.js";

type TaskRow = {
  id: string;
  title: string;
  number: number;
  status: string;
};

export function fireAgentAttentionPush(
  workspaceId: string,
  payload: AgentAttentionNotificationPayload,
): void {
  void notifyWorkspacePush(workspaceId, payload).catch((error) => {
    console.warn(
      "agent attention push failed:",
      error instanceof Error ? error.message : error,
    );
  });
}

export async function pushAgentAttentionForTaskStatusChange(input: {
  workspaceId: string;
  previousStatus: string;
  row: TaskRow;
  actor: TaskWriteActor | null | undefined;
  projectKey?: string | null;
}): Promise<void> {
  if (
    !taskStatusChangeQualifiesForAgentAttentionPush({
      previousStatus: input.previousStatus,
      nextStatus: input.row.status,
      actorKind: input.actor?.kind ?? null,
    })
  ) {
    return;
  }

  if (!isAgentAttentionNotifyStatus(input.row.status)) return;

  const payload = buildServerAgentAttentionNotification({
    id: input.row.id,
    title: input.row.title,
    number: input.row.number,
    status: input.row.status,
    projectKey: input.projectKey,
  });
  await notifyWorkspacePush(input.workspaceId, payload);
}
