import type { EntityDeleteResult } from "@backsteros/ui";

import {
  dispatchEmailListRemove,
  type EmailListRemoveDetail,
} from "./use-agentmail-mailboxes";
import { requestMailboxReload } from "../screens/email/email-page-helpers";

export type DeleteEmailMessageTarget = {
  inboxId: string;
  messageId: string;
  threadId?: string | null;
};

type EmailDeleteClient = {
  requestJson: (path: string, init?: RequestInit) => Promise<unknown>;
};

/**
 * Optimistic list remove + DELETE conversation (same as email detail D).
 * Does not navigate — callers leave detail when needed.
 */
export async function deleteEmailMessage(
  client: EmailDeleteClient,
  target: DeleteEmailMessageTarget,
): Promise<EntityDeleteResult> {
  const inboxId = target.inboxId.trim();
  const messageId = target.messageId.trim();
  if (!inboxId || !messageId) {
    return { ok: false, error: "Message is required." };
  }

  const removeDetail: EmailListRemoveDetail = {
    inboxId,
    messageId,
    threadId: target.threadId?.trim() || null,
  };
  dispatchEmailListRemove(removeDetail);

  try {
    await client.requestJson(
      `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
      { method: "DELETE" },
    );
    return { ok: true };
  } catch (error) {
    console.warn("[email] delete message failed:", error);
    requestMailboxReload();
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not delete email.",
    };
  }
}

export function emailDeleteEntityLabel(
  subject: string | null | undefined,
): string {
  const trimmed = subject?.trim() || "";
  return trimmed ? `${trimmed} (entire thread)` : "this conversation";
}
