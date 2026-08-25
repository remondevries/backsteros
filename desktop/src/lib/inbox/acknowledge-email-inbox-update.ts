import type {
  AgentMailMessageDetail,
  EmailThreadMetadata,
} from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

import { dispatchEmailListPatch } from "../use-agentmail-mailboxes";

export function emailThreadKeyForAcknowledge(message: {
  messageId: string;
  threadId?: string | null;
}): string {
  return message.threadId?.trim() || message.messageId.trim();
}

export async function patchEmailInboxUpdateAcknowledge(input: {
  client: Pick<BacksterosApiClient, "requestJson">;
  inboxId: string;
  message: Pick<AgentMailMessageDetail, "messageId" | "threadId">;
}): Promise<EmailThreadMetadata> {
  const threadKey = emailThreadKeyForAcknowledge(input.message);
  return input.client.requestJson<EmailThreadMetadata>(
    `/api/v1/email/inboxes/${encodeURIComponent(input.inboxId)}/threads/${encodeURIComponent(threadKey)}/metadata`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledgeInboxUpdate: true }),
    },
  );
}

export function syncEmailInboxUpdateAcknowledged(input: {
  inboxId: string;
  message: Pick<AgentMailMessageDetail, "messageId" | "threadId">;
}): void {
  dispatchEmailListPatch({
    inboxId: input.inboxId,
    messageId: input.message.messageId,
    threadId: input.message.threadId ?? null,
    inboxUpdatedAt: null,
  });
}
