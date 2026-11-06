import type { BacksterosApiClient } from "@backsteros/api-client";

import { fetchEmailMessageDetail } from "./email-message-detail-cache";

export async function loadPortalInvoiceActivityEmail(
  client: BacksterosApiClient,
  input: { inboxId: string; messageId: string },
): Promise<{
  subject: string;
  html: string | null;
  text: string | null;
  from: string | null;
  to: string[] | null;
}> {
  const detail = await fetchEmailMessageDetail(
    client,
    input.inboxId,
    input.messageId,
    { force: true },
  );
  if (!detail) {
    throw new Error("Sent email could not be loaded from AgentMail");
  }
  return {
    subject: detail.subject?.trim() || "Sent email",
    html: detail.extractedHtml ?? detail.html,
    text: detail.extractedText ?? detail.text,
    from: detail.from ?? null,
    to: detail.to ?? null,
  };
}
