/**
 * Portal / staff transactional mail via AgentMail.
 * From address follows portal UI language:
 * - nl → hallo@lemo-design.nl
 * - en (default) → hello@lemo-design.com
 */

import { AgentMailClient } from "../lib/agentmail-client.js";
import { AGENTMAIL_NOTIFICATIONS_LABEL } from "../lib/agentmail-notifications.js";
import { getAgentMailCredentials } from "./agentmail-settings.js";

export type TransactionalMailLocale = "en" | "nl";

export type TransactionalMailAttachment = {
  filename: string;
  contentType: string;
  /** Base64-encoded file bytes (AgentMail inline attachment). */
  contentBase64: string;
};

export type SendTransactionalAgentMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  locale?: TransactionalMailLocale | string | null;
  attachments?: TransactionalMailAttachment[];
};

export type SendTransactionalAgentMailResult = {
  messageId: string;
  threadId: string;
  from: string;
  inboxId: string;
};

const DISPLAY_NAME = "Lemo Design";

const FROM_BY_LOCALE: Record<"en" | "nl", { email: string; domain: string }> = {
  nl: {
    email: "hallo@lemo-design.nl",
    domain: "lemo-design.nl",
  },
  en: {
    email: "hello@lemo-design.com",
    domain: "lemo-design.com",
  },
};

export function resolveTransactionalFromAddress(
  locale: string | null | undefined,
): (typeof FROM_BY_LOCALE)["en"] {
  return locale === "nl" ? FROM_BY_LOCALE.nl : FROM_BY_LOCALE.en;
}

/** @deprecated Use resolveTransactionalFromAddress */
export const resolveTransactionalNoreplyAddress = resolveTransactionalFromAddress;

function envInboxOverride(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (normalized.endsWith(".nl")) {
    return (
      process.env.AGENTMAIL_TRANSACTIONAL_INBOX_NL?.trim() ||
      process.env.AGENTMAIL_NOREPLY_INBOX_NL?.trim() ||
      null
    );
  }
  return (
    process.env.AGENTMAIL_TRANSACTIONAL_INBOX_COM?.trim() ||
    process.env.AGENTMAIL_NOREPLY_INBOX_COM?.trim() ||
    null
  );
}

async function resolveTransactionalInbox(
  client: AgentMailClient,
  target: (typeof FROM_BY_LOCALE)["en"],
): Promise<{ inboxId: string; email: string }> {
  const override = envInboxOverride(target.email);
  if (override) {
    return { inboxId: override, email: target.email };
  }

  const inboxes = await client.listInboxes({ limit: 100 });
  const existing = inboxes.find(
    (inbox) => inbox.email.trim().toLowerCase() === target.email.toLowerCase(),
  );
  if (existing) {
    return { inboxId: existing.inboxId, email: existing.email };
  }

  throw new Error(
    `AgentMail inbox ${target.email} was not found. Create it in AgentMail or set AGENTMAIL_TRANSACTIONAL_INBOX_NL / AGENTMAIL_TRANSACTIONAL_INBOX_COM.`,
  );
}

export async function sendTransactionalAgentMail(
  workspaceId: string,
  input: SendTransactionalAgentMailInput,
): Promise<SendTransactionalAgentMailResult> {
  const to = input.to.trim();
  if (!to) {
    throw new Error("Recipient email is required");
  }
  const subject = input.subject.trim();
  if (!subject) {
    throw new Error("Subject is required");
  }

  const target = resolveTransactionalFromAddress(input.locale);
  const { apiKey } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new Error("AgentMail API key is not configured for this workspace");
  }
  const client = new AgentMailClient({ apiKey });
  const inbox = await resolveTransactionalInbox(client, target);

  const attachments = (input.attachments ?? [])
    .map((attachment) => {
      const filename = attachment.filename.trim();
      const contentBase64 = attachment.contentBase64.trim();
      const contentType = attachment.contentType.trim() || "application/octet-stream";
      if (!filename || !contentBase64) return null;
      return {
        filename,
        contentType,
        contentDisposition: "attachment" as const,
        content: contentBase64,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const sent = await client.sendMessage(inbox.inboxId, {
    to,
    subject,
    text: input.text,
    html: input.html,
    labels: [AGENTMAIL_NOTIFICATIONS_LABEL],
    ...(attachments.length > 0 ? { attachments } : {}),
  });

  // Keep the thread in the Notifications folder even if AgentMail only
  // attached the send-time label to the message.
  try {
    await client.updateThreadLabels(inbox.inboxId, sent.threadId, {
      addLabels: [AGENTMAIL_NOTIFICATIONS_LABEL],
    });
  } catch (error) {
    console.warn(
      "[agentmail] notifications thread label failed",
      inbox.inboxId,
      sent.threadId,
      error instanceof Error ? error.message : error,
    );
  }

  return {
    messageId: sent.messageId,
    threadId: sent.threadId,
    from: `${DISPLAY_NAME} <${inbox.email}>`,
    inboxId: inbox.inboxId,
  };
}
