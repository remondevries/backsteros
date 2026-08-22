/**
 * Thread metadata PATCH + optimistic list sync — mobile port of desktop
 * `patchEmailTaskListItem` / inbox metadata patching.
 */

import type { BacksterosApiClient } from "@backsteros/api-client";

import type { EmailListItem } from "./email-list";
import { dispatchEmailListPatch } from "./use-agentmail-mailboxes";

export type EmailThreadMetadataPatch = {
  status?: string;
  priority?: number;
  dueDate?: string | null;
  organizationId?: string | null;
  contactId?: string | null;
  assigneeId?: string | null;
  projectId?: string | null;
};

export type EmailThreadPatchExtras = {
  organizationName?: string | null;
  contactName?: string | null;
  assigneeName?: string | null;
  projectName?: string | null;
  projectKey?: string | null;
};

export async function patchEmailThreadMetadata(
  client: BacksterosApiClient,
  item: Pick<EmailListItem, "inboxId" | "id" | "threadId">,
  patch: EmailThreadMetadataPatch,
  listExtras?: EmailThreadPatchExtras,
): Promise<void> {
  const messageId = item.id.trim();
  const threadKey = item.threadId?.trim() || messageId;
  if (!threadKey || !messageId) return;
  await client.requestJson(
    `/api/v1/email/inboxes/${encodeURIComponent(item.inboxId)}/threads/${encodeURIComponent(threadKey)}/metadata`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  dispatchEmailListPatch({
    inboxId: item.inboxId,
    messageId,
    threadId: item.threadId ?? null,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
    ...(patch.organizationId !== undefined
      ? { organizationId: patch.organizationId }
      : {}),
    ...(patch.contactId !== undefined ? { contactId: patch.contactId } : {}),
    ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
    ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
    ...(listExtras?.organizationName !== undefined
      ? { organizationName: listExtras.organizationName }
      : {}),
    ...(listExtras?.contactName !== undefined
      ? { contactName: listExtras.contactName }
      : {}),
    ...(listExtras?.assigneeName !== undefined
      ? { assigneeName: listExtras.assigneeName }
      : {}),
    ...(listExtras?.projectName !== undefined
      ? { projectName: listExtras.projectName }
      : {}),
    ...(listExtras?.projectKey !== undefined
      ? { projectKey: listExtras.projectKey }
      : {}),
  });
}
