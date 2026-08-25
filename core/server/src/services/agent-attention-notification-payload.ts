import {
  buildAgentAttentionNotification,
  type AgentAttentionNotificationPayload,
  type AgentAttentionNotifyStatus,
} from "@backsteros/contracts";

export function buildServerAgentAttentionNotification(input: {
  id: string;
  title: string;
  number: number;
  status: AgentAttentionNotifyStatus;
  projectKey?: string | null;
}): AgentAttentionNotificationPayload {
  const displayId =
    input.number > 0
      ? formatTaskDisplayIdForServer(input.projectKey, input.number)
      : null;
  const href =
    input.number > 0
      ? `/inbox/${formatTaskSlugForServer(input.projectKey, input.number)}`
      : `/inbox/${input.id}`;
  return buildAgentAttentionNotification({
    id: input.id,
    title: input.title,
    status: input.status,
    displayId,
    href,
  });
}

function formatTaskDisplayIdForServer(
  projectKey: string | null | undefined,
  number: number,
): string {
  const key = projectKey?.trim() || "INBOX";
  return `${key}-${number}`;
}

function formatTaskSlugForServer(
  projectKey: string | null | undefined,
  number: number,
): string {
  const key = (projectKey?.trim() || "INBOX").toLowerCase();
  return `${key}-${number}`;
}
