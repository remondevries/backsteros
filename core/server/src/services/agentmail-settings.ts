import { and, eq, inArray, isNull } from "drizzle-orm";

import type {
  AgentMailDraftDetail as ApiAgentMailDraftDetail,
  AgentMailInboxSummary,
  AgentMailMessage,
  AgentMailMessageDetail,
  AgentMailSettings,
  AgentMailTestConnectionResult,
  EmailConceptReplyResponse,
  EmailComposeDraftResponse,
  EmailDeleteDraftResponse,
  EmailSendDraftResponse,
  UpdateAgentMailSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { contacts, workspaceIntegrationSecrets } from "../db/schema.js";
import {
  AgentMailApiError,
  AgentMailClient,
  type AgentMailDraftDetail,
  type AgentMailDraftSummary,
} from "../lib/agentmail-client.js";
import {
  attachDraftThreadIds,
  composeClientId,
  conceptReplyClientId,
  embedConceptDraftsInMessages,
  enrichDraftsForGlobalConceptLinking,
  deleteConceptReplyDraftsForMessage,
  findConceptDraftByClientIdAcrossInboxes,
  isDraftNotFoundError,
  loadConceptDraftForThreadAcrossInboxes,
  resolveConceptDraftParentMessageId,
  resolveDraftAcrossInboxes,
} from "../lib/agentmail-email-list.js";
import {
  assembleComposeEmail,
  assembleReplyEmail,
  DEFAULT_EMAIL_REPLY_SIGN_OFF_NAME,
  detectEmailLanguage,
  replySubject,
  resolveEditableDraftBody,
  resolveEmailReplyTemplates,
  plainTextEmailToHtml,
  type AssembledComposeEmail,
  type AssembledReplyEmail,
  type EmailReplyTemplateSettings,
} from "../lib/email-reply-assembler.js";
import * as emailThreadsService from "./email-threads.js";
import { previewCursorApiKey } from "./cursor-settings.js";

const INBOX_EMAIL_CACHE_MS = 5 * 60 * 1000;
const inboxEmailCache = new Map<
  string,
  { email: string | null; expiresAt: number }
>();

export function previewAgentMailApiKey(apiKey: string): string {
  return previewCursorApiKey(apiKey);
}

function formatAgentMailSettingsError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "42703"
  ) {
    return "Database is missing AgentMail settings columns. Run: pnpm --filter @backsteros/server db:migrate, then restart the core API.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Could not save AgentMail settings.";
}

export function normalizeInboxIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function inboxIdsFromRow(row: {
  agentmailInboxId: string | null;
  agentmailInboxIds?: string[] | null;
}): string[] {
  const fromJson = normalizeInboxIds(row.agentmailInboxIds);
  if (fromJson.length > 0) return fromJson;
  const legacy = row.agentmailInboxId?.trim() || "";
  return legacy ? [legacy] : [];
}

function inboxContactsFromRow(
  row: { agentmailInboxContacts?: Record<string, string> | null } | null,
): Record<string, string> {
  const raw = row?.agentmailInboxContacts;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [inboxId, contactId] of Object.entries(raw)) {
    const id = inboxId.trim();
    const linked = typeof contactId === "string" ? contactId.trim() : "";
    if (id && linked) out[id] = linked;
  }
  return out;
}

function pruneInboxContacts(
  contactsMap: Record<string, string>,
  inboxIds: readonly string[],
): Record<string, string> {
  const allowed = new Set(inboxIds);
  const out: Record<string, string> = {};
  for (const [inboxId, contactId] of Object.entries(contactsMap)) {
    if (allowed.has(inboxId)) out[inboxId] = contactId;
  }
  return out;
}

async function resolveInboxContactId(
  workspaceId: string,
  contactId: string | null | undefined,
): Promise<string | null> {
  if (contactId == null || contactId === "") return null;
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AgentMailApiError(400, "", "Contact not found");
  }
  return row.id;
}

async function loadContactNamesById(
  workspaceId: string,
  contactIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(contactIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        inArray(contacts.id, unique),
        isNull(contacts.deletedAt),
      ),
    );
  return new Map(rows.map((row) => [row.id, row.name]));
}

function enrichInboxesWithContacts(
  inboxes: AgentMailInboxSummary[],
  contactsMap: Record<string, string>,
  contactNames: Map<string, string>,
): AgentMailInboxSummary[] {
  return inboxes.map((inbox) => {
    const contactId = contactsMap[inbox.inboxId] ?? null;
    return {
      ...inbox,
      contactId,
      contactName: contactId ? contactNames.get(contactId) ?? null : null,
    };
  });
}

async function upsertAgentMailSecrets(
  workspaceId: string,
  apiKey: string | null,
  inboxIds: string[],
  options?: {
    templates?: {
      greetingTemplate?: string;
      signOffTemplateEn?: string;
      signOffTemplateNl?: string;
    };
    inboxContacts?: Record<string, string>;
    webhook?: {
      webhookId: string | null;
      webhookSecret: string | null;
      webhookUrl: string | null;
    };
  },
): Promise<void> {
  const inboxId = inboxIds[0] ?? null;
  const [existing] = await db
    .select()
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);

  const templatePatch =
    options?.templates === undefined
      ? {}
      : {
          agentmailReplyGreetingTemplate:
            options.templates.greetingTemplate?.trim() || null,
          agentmailReplySignOffTemplateEn:
            options.templates.signOffTemplateEn?.trim() || null,
          agentmailReplySignOffTemplateNl:
            options.templates.signOffTemplateNl?.trim() || null,
        };

  const contactsPatch =
    options?.inboxContacts === undefined
      ? {}
      : { agentmailInboxContacts: options.inboxContacts };

  const webhookPatch =
    options?.webhook === undefined
      ? {}
      : {
          agentmailWebhookId: options.webhook.webhookId,
          agentmailWebhookSecret: options.webhook.webhookSecret,
          agentmailWebhookUrl: options.webhook.webhookUrl,
        };

  if (existing) {
    await db
      .update(workspaceIntegrationSecrets)
      .set({
        agentmailApiKey: apiKey,
        agentmailInboxId: inboxId,
        agentmailInboxIds: inboxIds,
        ...templatePatch,
        ...contactsPatch,
        ...webhookPatch,
        updatedAt: new Date(),
      })
      .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));
    return;
  }

  await db.insert(workspaceIntegrationSecrets).values({
    workspaceId,
    agentmailApiKey: apiKey,
    agentmailInboxId: inboxId,
    agentmailInboxIds: inboxIds,
    agentmailInboxContacts: options?.inboxContacts ?? {},
    ...templatePatch,
    ...webhookPatch,
  });
}

async function getSecretRow(workspaceId: string): Promise<{
  agentmailApiKey: string | null;
  agentmailInboxId: string | null;
  agentmailInboxIds: string[] | null;
  agentmailInboxContacts: Record<string, string> | null;
  agentmailReplyGreetingTemplate: string | null;
  agentmailReplySignOffTemplate: string | null;
  agentmailReplySignOffTemplateEn: string | null;
  agentmailReplySignOffTemplateNl: string | null;
  agentmailReplySignOffName: string | null;
  agentmailWebhookId: string | null;
  agentmailWebhookSecret: string | null;
  agentmailWebhookUrl: string | null;
} | null> {
  const [row] = await db
    .select({
      agentmailApiKey: workspaceIntegrationSecrets.agentmailApiKey,
      agentmailInboxId: workspaceIntegrationSecrets.agentmailInboxId,
      agentmailInboxIds: workspaceIntegrationSecrets.agentmailInboxIds,
      agentmailInboxContacts: workspaceIntegrationSecrets.agentmailInboxContacts,
      agentmailReplyGreetingTemplate:
        workspaceIntegrationSecrets.agentmailReplyGreetingTemplate,
      agentmailReplySignOffTemplate:
        workspaceIntegrationSecrets.agentmailReplySignOffTemplate,
      agentmailReplySignOffTemplateEn:
        workspaceIntegrationSecrets.agentmailReplySignOffTemplateEn,
      agentmailReplySignOffTemplateNl:
        workspaceIntegrationSecrets.agentmailReplySignOffTemplateNl,
      agentmailReplySignOffName:
        workspaceIntegrationSecrets.agentmailReplySignOffName,
      agentmailWebhookId: workspaceIntegrationSecrets.agentmailWebhookId,
      agentmailWebhookSecret: workspaceIntegrationSecrets.agentmailWebhookSecret,
      agentmailWebhookUrl: workspaceIntegrationSecrets.agentmailWebhookUrl,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

export async function getEmailReplyTemplates(
  workspaceId: string,
): Promise<
  Pick<
    EmailReplyTemplateSettings,
    "greetingTemplate" | "signOffTemplateEn" | "signOffTemplateNl"
  >
> {
  const row = await getSecretRow(workspaceId);
  const resolved = resolveEmailReplyTemplates({
    greetingTemplate: row?.agentmailReplyGreetingTemplate ?? undefined,
    signOffTemplateEn:
      row?.agentmailReplySignOffTemplateEn ??
      row?.agentmailReplySignOffTemplate ??
      undefined,
    signOffTemplateNl: row?.agentmailReplySignOffTemplateNl ?? undefined,
  });
  return {
    greetingTemplate: resolved.greetingTemplate,
    signOffTemplateEn: resolved.signOffTemplateEn,
    signOffTemplateNl: resolved.signOffTemplateNl,
  };
}

async function resolveInboxSignOffName(
  workspaceId: string,
  inboxId: string,
): Promise<string> {
  const secretRow = await getSecretRow(workspaceId);
  const contactId = inboxContactsFromRow(secretRow)[inboxId.trim()];
  if (contactId) {
    const names = await loadContactNamesById(workspaceId, [contactId]);
    const name = names.get(contactId)?.trim();
    if (name) return name;
  }
  return DEFAULT_EMAIL_REPLY_SIGN_OFF_NAME;
}

export async function getEmailReplyTemplatesForInbox(
  workspaceId: string,
  inboxId: string,
): Promise<EmailReplyTemplateSettings> {
  const templates = await getEmailReplyTemplates(workspaceId);
  return {
    ...templates,
    signOffName: await resolveInboxSignOffName(workspaceId, inboxId),
  };
}

function mapConceptDraftForApi(input: {
  draft: AgentMailDraftDetail;
  replyFrom: string;
  templates: EmailReplyTemplateSettings;
  subject: string;
  fromEmail: string | null;
  contextText?: string | null;
}) {
  const rawText = input.draft.text ?? "";
  const editableBody = resolveEditableDraftBody(
    rawText,
    input.replyFrom,
    input.templates,
  );
  const isCompose = !input.draft.inReplyTo?.trim();
  const languageHint = detectEmailLanguage(editableBody, input.contextText);
  const assembled = isCompose
    ? assembleComposeEmail({
        to: input.draft.to[0] ?? input.replyFrom,
        subject: input.subject,
        body: editableBody,
        templates: input.templates,
        languageHint,
      })
    : assembleReplyEmail({
        from: input.replyFrom,
        subject: input.subject,
        body: editableBody,
        templates: input.templates,
        languageHint,
        contextText: input.contextText,
      });
  return {
    draftId: input.draft.draftId,
    inboxId: input.draft.inboxId,
    subject: input.subject,
    from: input.fromEmail,
    to: input.draft.to,
    text: input.draft.text,
    body: editableBody || assembled.body,
    greeting: assembled.greeting,
    signOff: assembled.signOff,
    preview: input.draft.preview,
    updatedAt: input.draft.updatedAt,
  };
}

function mapDraftDetailForApi(input: {
  draft: AgentMailDraftDetail;
  replyFrom: string;
  templates: EmailReplyTemplateSettings;
  inboxEmail: string | null;
  contextText?: string | null;
}): ApiAgentMailDraftDetail {
  const subject = input.draft.subject?.trim() || "Reply concept";
  const mapped = mapConceptDraftForApi({
    draft: input.draft,
    replyFrom: input.replyFrom,
    templates: input.templates,
    subject,
    fromEmail: input.inboxEmail,
    contextText: input.contextText,
  });
  return {
    inboxId: input.draft.inboxId,
    draftId: input.draft.draftId,
    subject: mapped.subject,
    preview: mapped.preview,
    text: mapped.text,
    body: mapped.body,
    greeting: mapped.greeting,
    signOff: mapped.signOff,
    html: input.draft.html,
    inReplyTo: input.draft.inReplyTo,
    from: input.inboxEmail,
    to: input.draft.to,
    updatedAt: input.draft.updatedAt,
    createdAt: input.draft.createdAt,
  };
}

async function resolveReplyContextForDraft(
  client: AgentMailClient,
  draft: AgentMailDraftDetail,
  fallbackInboxId: string,
): Promise<{ replyFrom: string; contextText: string | null }> {
  const inReplyTo = draft.inReplyTo?.trim();
  if (!inReplyTo) {
    return { replyFrom: draft.to[0]?.trim() ?? "", contextText: null };
  }
  try {
    const parent = await client.getMessage(
      draft.inboxId || fallbackInboxId,
      inReplyTo,
    );
    return {
      replyFrom: parent.from,
      contextText: parent.text ?? parent.extractedText ?? null,
    };
  } catch {
    return { replyFrom: draft.to[0]?.trim() ?? "", contextText: null };
  }
}

export async function getAgentMailCredentials(
  workspaceId: string,
): Promise<{ apiKey: string | null; inboxId: string | null; inboxIds: string[] }> {
  const row = await getSecretRow(workspaceId);
  const apiKey = row?.agentmailApiKey?.trim() || null;
  const inboxIds = row ? inboxIdsFromRow(row) : [];
  return { apiKey, inboxId: inboxIds[0] ?? null, inboxIds };
}

function inboxLabel(inbox: AgentMailInboxSummary): string {
  return inbox.displayName?.trim() || inbox.email;
}

function toInboxSummary(inbox: {
  inboxId: string;
  email: string;
  displayName: string | null;
  podId: string | null;
}): AgentMailInboxSummary {
  return {
    inboxId: inbox.inboxId,
    email: inbox.email,
    displayName: inbox.displayName,
    podId: inbox.podId,
  };
}

async function resolveInboxEmail(
  client: AgentMailClient,
  inboxId: string,
): Promise<string | null> {
  const cached = inboxEmailCache.get(inboxId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.email;
  }
  try {
    const inboxes = await client.listInboxes({ limit: 100 });
    const email = inboxes.find((inbox) => inbox.inboxId === inboxId)?.email ?? null;
    inboxEmailCache.set(inboxId, {
      email,
      expiresAt: Date.now() + INBOX_EMAIL_CACHE_MS,
    });
    return email;
  } catch {
    return null;
  }
}

export async function getAgentMailSettings(
  workspaceId: string,
): Promise<AgentMailSettings> {
  const { apiKey, inboxId, inboxIds } = await getAgentMailCredentials(
    workspaceId,
  );
  let listed: AgentMailInboxSummary[] = [];
  let organizationId: string | null = null;

  if (apiKey) {
    try {
      const client = new AgentMailClient({ apiKey });
      listed = (await client.listInboxes({ limit: 100 })).map(toInboxSummary);
    } catch {
      // Keep settings readable even if AgentMail is unreachable.
    }
    try {
      const client = new AgentMailClient({ apiKey });
      const me = await client.authMe();
      organizationId = me.organizationId;
    } catch {
      // Ignore auth lookup failures for settings display.
    }
  }

  const listedById = new Map(listed.map((inbox) => [inbox.inboxId, inbox]));
  const selected = inboxIds.map(
    (id) =>
      listedById.get(id) ?? {
        inboxId: id,
        email: id,
        displayName: null,
        podId: null,
      },
  );
  const secretRow = await getSecretRow(workspaceId);
  const inboxContacts = pruneInboxContacts(
    inboxContactsFromRow(secretRow),
    inboxIds,
  );
  const contactNames = await loadContactNamesById(
    workspaceId,
    Object.values(inboxContacts),
  );
  const inboxesWithContacts = enrichInboxesWithContacts(
    selected,
    inboxContacts,
    contactNames,
  );
  const first = inboxesWithContacts[0] ?? null;
  const replyTemplates = await getEmailReplyTemplates(workspaceId);

  return {
    apiKeyConfigured: Boolean(apiKey),
    apiKeyPreview: apiKey ? previewAgentMailApiKey(apiKey) : null,
    inboxId,
    inboxEmail: first && listedById.has(first.inboxId) ? first.email : null,
    inboxDisplayName:
      first && listedById.has(first.inboxId) ? first.displayName : null,
    inboxIds,
    inboxes: inboxesWithContacts,
    organizationId,
    connected: Boolean(apiKey && inboxIds.length > 0),
    replyGreetingTemplate: replyTemplates.greetingTemplate,
    replySignOffTemplateEn: replyTemplates.signOffTemplateEn,
    replySignOffTemplateNl: replyTemplates.signOffTemplateNl,
    webhookConfigured: Boolean(secretRow?.agentmailWebhookId?.trim()),
  };
}

export async function updateAgentMailSettings(
  workspaceId: string,
  patch: UpdateAgentMailSettingsInput,
): Promise<AgentMailSettings> {
  const current = await getAgentMailCredentials(workspaceId);
  let nextApiKey = current.apiKey;
  let nextInboxIds = current.inboxIds;

  if (patch.apiKey !== undefined) {
    const trimmed = patch.apiKey.trim();
    nextApiKey = trimmed.length > 0 ? trimmed : null;
    if (!nextApiKey) nextInboxIds = [];
  }
  if (patch.inboxIds !== undefined) {
    nextInboxIds = normalizeInboxIds(patch.inboxIds);
  } else if (patch.inboxId !== undefined) {
    const trimmed = patch.inboxId?.trim() ?? "";
    nextInboxIds = trimmed.length > 0 ? [trimmed] : [];
  }

  const secretRow = await getSecretRow(workspaceId);
  let nextInboxContacts = pruneInboxContacts(
    inboxContactsFromRow(secretRow),
    nextInboxIds,
  );
  if (!nextApiKey) {
    nextInboxContacts = {};
  } else if (patch.inboxContacts) {
    for (const [inboxId, contactId] of Object.entries(patch.inboxContacts)) {
      if (!nextInboxIds.includes(inboxId)) continue;
      if (contactId == null) {
        delete nextInboxContacts[inboxId];
        continue;
      }
      const resolved = await resolveInboxContactId(workspaceId, contactId);
      if (resolved) nextInboxContacts[inboxId] = resolved;
      else delete nextInboxContacts[inboxId];
    }
    nextInboxContacts = pruneInboxContacts(nextInboxContacts, nextInboxIds);
  }

  if (patch.apiKey !== undefined && nextApiKey && nextInboxIds.length === 0) {
    try {
      const client = new AgentMailClient({ apiKey: nextApiKey });
      const me = await client.authMe();
      if (me.inboxId) {
        nextInboxIds = [me.inboxId];
      } else {
        const inboxes = await client.listInboxes({ limit: 100 });
        if (inboxes.length === 1) {
          nextInboxIds = [inboxes[0]!.inboxId];
        }
      }
    } catch {
      // Leave inboxes unset; user can pick after fixing the key.
    }
  }

  await upsertAgentMailSecrets(workspaceId, nextApiKey, nextInboxIds, {
    inboxContacts: nextInboxContacts,
  });

  if (
    patch.replyGreetingTemplate !== undefined ||
    patch.replySignOffTemplateEn !== undefined ||
    patch.replySignOffTemplateNl !== undefined
  ) {
    const currentTemplates = await getEmailReplyTemplates(workspaceId);
    await upsertAgentMailSecrets(
      workspaceId,
      nextApiKey,
      nextInboxIds,
      {
        templates: {
          greetingTemplate:
            patch.replyGreetingTemplate ?? currentTemplates.greetingTemplate,
          signOffTemplateEn:
            patch.replySignOffTemplateEn ?? currentTemplates.signOffTemplateEn,
          signOffTemplateNl:
            patch.replySignOffTemplateNl ?? currentTemplates.signOffTemplateNl,
        },
        inboxContacts: nextInboxContacts,
      },
    );
  }

  await ensureAgentMailWebhook(workspaceId, nextApiKey, nextInboxIds, {
    previousApiKey: current.apiKey,
  });

  return getAgentMailSettings(workspaceId);
}

export function agentsPublicWebhookUrl(): string | null {
  const base = process.env.AGENTS_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (!base) return null;
  return `${base}/api/v1/webhooks/agentmail`;
}

const WEBHOOK_CLIENT_ID = "backsteros-core";

async function clearStoredWebhook(
  workspaceId: string,
  apiKey: string | null,
  inboxIds: string[],
): Promise<void> {
  await upsertAgentMailSecrets(workspaceId, apiKey, inboxIds, {
    webhook: {
      webhookId: null,
      webhookSecret: null,
      webhookUrl: null,
    },
  });
}

async function ensureAgentMailWebhook(
  workspaceId: string,
  apiKey: string | null,
  inboxIds: string[],
  options?: { previousApiKey?: string | null },
): Promise<void> {
  const targetUrl = agentsPublicWebhookUrl();
  const secretRow = await getSecretRow(workspaceId);
  const existingId = secretRow?.agentmailWebhookId?.trim() || null;
  const existingUrl = secretRow?.agentmailWebhookUrl?.trim() || null;
  const existingSecret = secretRow?.agentmailWebhookSecret?.trim() || null;
  const deleteKey =
    options?.previousApiKey?.trim() ||
    secretRow?.agentmailApiKey?.trim() ||
    apiKey ||
    null;

  if (!apiKey) {
    if (existingId && deleteKey) {
      try {
        await new AgentMailClient({ apiKey: deleteKey }).deleteWebhook(
          existingId,
        );
      } catch {
        // Best-effort remote cleanup.
      }
    }
    if (existingId || existingSecret || existingUrl) {
      await clearStoredWebhook(workspaceId, null, inboxIds);
    }
    return;
  }

  if (inboxIds.length === 0 || !targetUrl) {
    return;
  }

  const client = new AgentMailClient({ apiKey });

  try {
    if (existingId && existingUrl === targetUrl && existingSecret) {
      try {
        const current = await client.getWebhook(existingId);
        const currentInboxIds = current.inboxIds;
        const toAdd = inboxIds.filter((id) => !currentInboxIds.includes(id));
        const toRemove = currentInboxIds.filter((id) => !inboxIds.includes(id));
        if (toAdd.length > 0 || toRemove.length > 0) {
          await client.updateWebhook(existingId, {
            addInboxIds: toAdd.length > 0 ? toAdd : undefined,
            removeInboxIds: toRemove.length > 0 ? toRemove : undefined,
            eventTypes: ["message.received"],
          });
        }
        return;
      } catch {
        // Recreate below.
      }
    }

    if (existingId) {
      try {
        await client.deleteWebhook(existingId);
      } catch {
        // Ignore missing remote webhook.
      }
    }

    const created = await client.createWebhook({
      url: targetUrl,
      eventTypes: ["message.received"],
      inboxIds,
      clientId: WEBHOOK_CLIENT_ID,
    });
    await upsertAgentMailSecrets(workspaceId, apiKey, inboxIds, {
      webhook: {
        webhookId: created.webhookId,
        webhookSecret: created.secret,
        webhookUrl: created.url,
      },
    });
  } catch (error) {
    console.error("Failed to ensure AgentMail webhook:", error);
  }
}

export async function listAgentMailWebhookSecrets(): Promise<
  Array<{
    workspaceId: string;
    secret: string;
    inboxIds: string[];
  }>
> {
  const rows = await db
    .select({
      workspaceId: workspaceIntegrationSecrets.workspaceId,
      secret: workspaceIntegrationSecrets.agentmailWebhookSecret,
      inboxIds: workspaceIntegrationSecrets.agentmailInboxIds,
    })
    .from(workspaceIntegrationSecrets);
  return rows.flatMap((row) => {
    const secret = row.secret?.trim();
    if (!secret) return [];
    return [
      {
        workspaceId: row.workspaceId,
        secret,
        inboxIds: Array.isArray(row.inboxIds) ? row.inboxIds : [],
      },
    ];
  });
}

export async function listAgentMailInboxes(
  workspaceId: string,
): Promise<AgentMailInboxSummary[]> {
  const { apiKey } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  const client = new AgentMailClient({ apiKey });
  const inboxes = await client.listInboxes({ limit: 100 });
  return inboxes.map(toInboxSummary);
}

function toApiMessage(message: {
  inboxId: string;
  threadId: string;
  messageId: string;
  subject: string;
  from: string;
  preview: string | null;
  timestamp: string;
}): AgentMailMessage {
  return {
    kind: "message",
    inboxId: message.inboxId,
    threadId: message.threadId,
    messageId: message.messageId,
    draftId: null,
    inReplyToMessageId: null,
    subject: message.subject,
    from: message.from,
    preview: message.preview,
    timestamp: message.timestamp,
  };
}

function toApiDraft(draft: {
  inboxId: string;
  draftId: string;
  subject: string | null;
  preview: string | null;
  text: string | null;
  inReplyTo: string | null;
  updatedAt: string;
}): AgentMailMessage {
  return {
    kind: "draft",
    inboxId: draft.inboxId,
    messageId: draft.draftId,
    draftId: draft.draftId,
    inReplyToMessageId: draft.inReplyTo,
    subject: draft.subject?.trim() || "Reply concept",
    from: "Draft",
    preview: draft.preview ?? draft.text?.slice(0, 160) ?? null,
    timestamp: draft.updatedAt,
  };
}

async function listConceptDrafts(
  client: AgentMailClient,
  inboxId: string,
): Promise<AgentMailDraftSummary[]> {
  try {
    return await client.listDrafts(inboxId, { limit: 100 });
  } catch (error) {
    if (error instanceof AgentMailApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

async function saveConceptReplyDraft(
  client: AgentMailClient,
  inboxId: string,
  messageId: string,
  assembled: AssembledReplyEmail,
  inboxIds: readonly string[],
): Promise<AgentMailDraftDetail> {
  const clientId = conceptReplyClientId(messageId);
  const to = assembled.to.filter((address) => address.includes("@"));
  if (to.length === 0) {
    throw new AgentMailApiError(
      400,
      "",
      "Could not resolve a reply recipient from the inbound From address",
    );
  }

  // Always include to/subject — AgentMail reply-only creates (in_reply_to alone)
  // have been returning opaque "Draft not found" for some Message-IDs.
  const createPayload = {
    to,
    subject: assembled.subject,
    text: assembled.text,
    html: plainTextEmailToHtml(assembled.text),
    client_id: clientId,
    in_reply_to: messageId,
  };

  const tryUpdate = async (
    targetInboxId: string,
    draftId: string,
  ): Promise<AgentMailDraftDetail | null> => {
    try {
      // Confirm the draft still exists before PATCH — list rows can be stale.
      await client.getDraft(targetInboxId, draftId);
      return await client.updateDraft(targetInboxId, draftId, {
        text: assembled.text,
        html: plainTextEmailToHtml(assembled.text),
        to,
        subject: assembled.subject,
      });
    } catch (error) {
      if (isDraftNotFoundError(error)) return null;
      throw error;
    }
  };

  // Fast path: list summaries that already expose our client_id (no probe storm).
  for (const candidateInboxId of [
    inboxId,
    ...inboxIds.filter((id) => id !== inboxId),
  ]) {
    let drafts: Awaited<ReturnType<typeof listConceptDrafts>>;
    try {
      drafts = await listConceptDrafts(client, candidateInboxId);
    } catch {
      continue;
    }
    const existing = drafts.find((draft) => draft.clientId === clientId);
    if (!existing) continue;
    const updated = await tryUpdate(candidateInboxId, existing.draftId);
    if (updated) {
      return { ...updated, inboxId: candidateInboxId };
    }
  }

  try {
    return await client.createDraft(inboxId, createPayload);
  } catch (error) {
    if (!(error instanceof AgentMailApiError)) {
      throw error;
    }

    const recovered = await findConceptDraftByClientIdAcrossInboxes(
      client,
      inboxIds,
      messageId,
    );
    if (recovered) {
      const updated = await tryUpdate(recovered.inboxId, recovered.draftId);
      if (updated) return { ...updated, inboxId: recovered.inboxId };
    }

    // Retry without client_id (conflict) still threaded.
    try {
        return await client.createDraft(inboxId, {
          to,
          subject: assembled.subject,
          text: assembled.text,
          html: plainTextEmailToHtml(assembled.text),
          in_reply_to: messageId,
        });
      } catch (threadedRetryError) {
        // Last resort: standalone draft (still shown as the concept reply).
        if (
          threadedRetryError instanceof AgentMailApiError &&
          (threadedRetryError.status === 400 ||
            threadedRetryError.status === 404 ||
            isDraftNotFoundError(threadedRetryError))
        ) {
          return client.createDraft(inboxId, {
            to,
            subject: assembled.subject,
            text: assembled.text,
            html: plainTextEmailToHtml(assembled.text),
            client_id: `${clientId}-loose`,
          });
        }
      throw threadedRetryError;
    }
  }
}

async function saveComposeDraft(
  client: AgentMailClient,
  inboxId: string,
  sessionId: string,
  assembled: AssembledComposeEmail,
): Promise<AgentMailDraftDetail> {
  const clientId = composeClientId(sessionId);
  const drafts = await listConceptDrafts(client, inboxId);
  const existing = drafts.find((draft) => draft.clientId === clientId);

  if (existing) {
    return client.updateDraft(inboxId, existing.draftId, {
      to: assembled.to,
      subject: assembled.subject,
      text: assembled.text,
      html: plainTextEmailToHtml(assembled.text),
    });
  }

  return client.createDraft(inboxId, {
    to: assembled.to,
    subject: assembled.subject,
    text: assembled.text,
    html: plainTextEmailToHtml(assembled.text),
    client_id: clientId,
  });
}

export async function listAgentMailMessages(
  workspaceId: string,
): Promise<AgentMailMessage[]> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  if (inboxIds.length === 0) {
    return [];
  }

  const client = new AgentMailClient({ apiKey });
  const pages = await Promise.allSettled(
    inboxIds.map(async (inboxId) => {
      const [messages, rawDrafts] = await Promise.all([
        client.listMessages(inboxId, { limit: 50 }),
        client.listDrafts(inboxId, { limit: 50 }),
      ]);
      return { inboxId, messages, rawDrafts };
    }),
  );

  const apiMessages: AgentMailMessage[] = [];
  const draftRecords: { inboxId: string; draft: AgentMailDraftSummary }[] = [];

  for (const [index, page] of pages.entries()) {
    if (page.status !== "fulfilled") {
      console.error(
        `AgentMail message list failed for inbox ${inboxIds[index]}:`,
        page.reason,
      );
      continue;
    }
    const { inboxId, messages, rawDrafts } = page.value;
    apiMessages.push(...messages.map(toApiMessage));
    for (const draft of rawDrafts) {
      draftRecords.push({ inboxId, draft });
    }
  }

  const allMessageIds = apiMessages.map((message) => message.messageId);
  const draftsByInbox = new Map<string, AgentMailDraftSummary[]>();
  for (const { inboxId, draft } of draftRecords) {
    const bucket = draftsByInbox.get(inboxId) ?? [];
    bucket.push(draft);
    draftsByInbox.set(inboxId, bucket);
  }

  const linkedDrafts: AgentMailMessage[] = [];
  for (const [inboxId, drafts] of draftsByInbox) {
    const linked = await enrichDraftsForGlobalConceptLinking(
      client,
      inboxId,
      drafts,
      allMessageIds,
    );
    linkedDrafts.push(...linked.map((draft) => toApiDraft(draft)));
  }
  const apiDrafts = attachDraftThreadIds(apiMessages, linkedDrafts);

  const listed = embedConceptDraftsInMessages(apiMessages, apiDrafts).sort(
    (a, b) => {
      const aTime = Date.parse(a.timestamp) || 0;
      const bTime = Date.parse(b.timestamp) || 0;
      return bTime - aTime;
    },
  );

  const metaMap = await emailThreadsService.listEmailThreadListMetaMap(
    workspaceId,
  );
  return listed.map((message) => {
    const threadKey = emailThreadsService.resolveEmailThreadKey({
      threadId: message.threadId,
      messageId: message.messageId,
    });
    const stored = metaMap.get(
      emailThreadsService.emailThreadStatusLookupKey(message.inboxId, threadKey),
    );
    return {
      ...message,
      status: stored?.status ?? "backlog",
      priority: stored?.priority ?? 0,
      dueDate: stored?.dueDate ?? null,
      organizationId: stored?.organizationId ?? null,
      organizationName: stored?.organizationName ?? null,
      contactId: stored?.contactId ?? null,
      contactName: stored?.contactName ?? null,
      assigneeId: stored?.assigneeId ?? null,
      assigneeName: stored?.assigneeName ?? null,
      projectId: stored?.projectId ?? null,
      projectName: stored?.projectName ?? null,
      projectKey: stored?.projectKey ?? null,
    };
  });
}

export async function getAgentMailMessage(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<AgentMailMessageDetail> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  if (!inboxIds.includes(inboxId)) {
    throw new AgentMailApiError(404, "", "Inbox is not selected for this workspace");
  }
  const client = new AgentMailClient({ apiKey });
  const message = await client.getMessage(inboxId, messageId);
  const threadId = message.threadId?.trim() || "";
  let threadMessages = [message];
  if (threadId) {
    try {
      const thread = await client.getThread(inboxId, threadId);
      if (thread.messages.length > 0) {
        threadMessages = thread.messages;
      }
    } catch (error) {
      // Fall back to the single message if thread fetch fails.
      if (!(error instanceof AgentMailApiError) || error.status !== 404) {
        console.warn("[agentmail] getThread failed:", error);
      }
    }
  }
  // Prefer the opened message for concept-reply context (latest inbound when
  // the list collapses to the concept parent).
  const conceptParent =
    threadMessages.find((entry) => entry.messageId === messageId) ?? message;
  const threadMessageIds = [
    ...new Set(
      [
        messageId,
        conceptParent.messageId,
        ...threadMessages.map((entry) => entry.messageId),
      ]
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  const conceptDraft = await loadConceptDraftForThreadAcrossInboxes(
    client,
    inboxIds,
    threadMessageIds,
  );
  const templates = await getEmailReplyTemplatesForInbox(
    workspaceId,
    conceptDraft?.inboxId ?? inboxId,
  );
  const [inboxEmail, conceptDraftFromEmail, threadMetadata, threadComments] =
    await Promise.all([
    resolveInboxEmail(client, inboxId),
    conceptDraft
      ? resolveInboxEmail(client, conceptDraft.inboxId)
      : Promise.resolve(null),
    emailThreadsService.getOrCreateEmailThreadMetadata(
      workspaceId,
      inboxId,
      emailThreadsService.resolveEmailThreadKey({
        threadId: message.threadId,
        messageId,
      }),
    ),
    emailThreadsService.listEmailThreadComments(
      workspaceId,
      inboxId,
      emailThreadsService.resolveEmailThreadKey({
        threadId: message.threadId,
        messageId,
      }),
    ),
  ]);
  return {
    ...toApiMessage(message),
    text: message.text,
    html: message.html,
    extractedText: message.extractedText,
    extractedHtml: message.extractedHtml,
    to: message.to,
    labels: message.labels,
    inboxEmail,
    threadMetadata,
    threadComments,
    threadMessages: threadMessages.map((entry) => ({
      messageId: entry.messageId,
      threadId: entry.threadId || undefined,
      subject: entry.subject,
      from: entry.from,
      to: entry.to,
      timestamp: entry.timestamp,
      text: entry.text,
      html: entry.html,
      extractedText: entry.extractedText,
      extractedHtml: entry.extractedHtml,
      labels: entry.labels,
      inReplyTo: entry.inReplyTo,
    })),
    conceptDraftId: conceptDraft?.draftId ?? null,
    conceptPreview: conceptDraft?.preview ?? conceptDraft?.text?.slice(0, 160) ?? null,
    conceptDraft: conceptDraft
      ? mapConceptDraftForApi({
          draft: conceptDraft,
          replyFrom: conceptParent.from,
          templates,
          subject:
            conceptDraft.subject?.trim() || replySubject(conceptParent.subject),
          fromEmail: conceptDraftFromEmail,
          contextText: conceptParent.text ?? conceptParent.extractedText ?? null,
        })
      : null,
  };
}

export async function getAgentMailDraft(
  workspaceId: string,
  inboxId: string,
  draftId: string,
): Promise<ApiAgentMailDraftDetail> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  if (!inboxIds.includes(inboxId)) {
    throw new AgentMailApiError(404, "", "Inbox is not selected for this workspace");
  }
  const client = new AgentMailClient({ apiKey });
  const [draft, inboxEmail] = await Promise.all([
    client.getDraft(inboxId, draftId),
    resolveInboxEmail(client, inboxId),
  ]);
  const templates = await getEmailReplyTemplatesForInbox(
    workspaceId,
    draft.inboxId,
  );
  const replyContext = await resolveReplyContextForDraft(client, draft, inboxId);
  return mapDraftDetailForApi({
    draft,
    replyFrom: replyContext.replyFrom,
    templates,
    inboxEmail,
    contextText: replyContext.contextText,
  });
}

export async function upsertEmailConceptReply(
  workspaceId: string,
  inboxId: string,
  messageId: string,
  agentBody: string,
): Promise<EmailConceptReplyResponse> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  if (!inboxIds.includes(inboxId)) {
    throw new AgentMailApiError(404, "", "Inbox is not selected for this workspace");
  }

  const client = new AgentMailClient({ apiKey });
  const message = await client.getMessage(inboxId, messageId);
  const templates = await getEmailReplyTemplatesForInbox(workspaceId, inboxId);
  const assembled = assembleReplyEmail({
    from: message.from,
    subject: message.subject,
    body: agentBody,
    templates,
    contextText: message.text ?? message.extractedText ?? null,
  });
  const draft = await saveConceptReplyDraft(
    client,
    inboxId,
    messageId,
    assembled,
    inboxIds,
  );

  return {
    draftId: draft.draftId,
    inboxId: draft.inboxId,
    inReplyToMessageId: messageId,
  };
}

export async function upsertEmailComposeDraft(
  workspaceId: string,
  inboxId: string,
  input: {
    to: string;
    subject: string;
    body: string;
    composeSessionId?: string;
  },
): Promise<EmailComposeDraftResponse> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  if (!inboxIds.includes(inboxId)) {
    throw new AgentMailApiError(404, "", "Inbox is not selected for this workspace");
  }

  const client = new AgentMailClient({ apiKey });
  const templates = await getEmailReplyTemplatesForInbox(workspaceId, inboxId);
  const composeSessionId =
    input.composeSessionId?.trim() || crypto.randomUUID();
  const assembled = assembleComposeEmail({
    to: input.to,
    subject: input.subject,
    body: input.body,
    templates,
  });
  const draft = await saveComposeDraft(
    client,
    inboxId,
    composeSessionId,
    assembled,
  );

  return {
    draftId: draft.draftId,
    inboxId: draft.inboxId,
    composeSessionId,
  };
}

export async function sendAgentMailDraft(
  workspaceId: string,
  inboxId: string,
  draftId: string,
): Promise<EmailSendDraftResponse> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  if (!inboxIds.includes(inboxId)) {
    throw new AgentMailApiError(404, "", "Inbox is not selected for this workspace");
  }

  const client = new AgentMailClient({ apiKey });
  let draft = await resolveDraftAcrossInboxes(
    client,
    inboxIds,
    draftId,
    inboxId,
  );

  // UI shows greeting/sign-off from templates even when draft.text is body-only.
  // Re-assemble immediately before send so recipients get the full footer.
  draft = await ensureDraftHasAssembledShell(client, workspaceId, inboxId, draft);

  const sent = await client.sendDraft(draft.inboxId, draft.draftId);

  return {
    inboxId: sent.inboxId,
    messageId: sent.messageId,
    threadId: sent.threadId,
    subject: sent.subject,
    inReplyToMessageId: draft.inReplyTo,
  };
}

/**
 * Guarantee AgentMail stores greeting + body + sign-off (not just the editable
 * middle the UI edits). Returns the draft after any needed update.
 */
async function ensureDraftHasAssembledShell(
  client: AgentMailClient,
  workspaceId: string,
  fallbackInboxId: string,
  draft: AgentMailDraftDetail,
): Promise<AgentMailDraftDetail> {
  const templates = await getEmailReplyTemplatesForInbox(
    workspaceId,
    draft.inboxId || fallbackInboxId,
  );
  const replyContext = await resolveReplyContextForDraft(
    client,
    draft,
    fallbackInboxId,
  );
  const replyFrom = replyContext.replyFrom;
  let subject = draft.subject?.trim() || "Reply concept";
  let contextText = replyContext.contextText;
  if (!draft.subject?.trim() && draft.inReplyTo?.trim() && replyFrom) {
    try {
      const parent = await client.getMessage(
        draft.inboxId || fallbackInboxId,
        draft.inReplyTo,
      );
      subject = replySubject(parent.subject);
      contextText = parent.text ?? parent.extractedText ?? contextText;
    } catch {
      // Keep fallback subject.
    }
  }

  const editableBody = resolveEditableDraftBody(
    draft.text ?? "",
    replyFrom || draft.to[0] || "there",
    templates,
  );
  const isCompose = !draft.inReplyTo?.trim();
  const languageHint = detectEmailLanguage(editableBody, contextText);
  const assembled = isCompose
    ? assembleComposeEmail({
        to: replyFrom || draft.to[0] || "",
        subject,
        body: editableBody,
        templates,
        languageHint,
      })
    : assembleReplyEmail({
        from: replyFrom || "there",
        subject,
        body: editableBody,
        templates,
        languageHint,
        contextText,
      });

  const storedText = (draft.text ?? "").replace(/\r\n/g, "\n").trim();
  const desiredText = assembled.text.replace(/\r\n/g, "\n").trim();
  const storedHtml = (draft.html ?? "").trim();
  const desiredHtml = plainTextEmailToHtml(assembled.text);
  const needsTextUpdate = storedText !== desiredText;
  const needsHtmlUpdate =
    !storedHtml ||
    !storedHtml.includes(assembled.signOff.trim()) ||
    storedHtml !== desiredHtml;

  if (!needsTextUpdate && !needsHtmlUpdate) {
    return draft;
  }

  return client.updateDraft(draft.inboxId, draft.draftId, {
    text: assembled.text,
    html: desiredHtml,
    ...(assembled.to.length > 0 ? { to: assembled.to } : {}),
    ...(subject ? { subject } : {}),
  });
}

export async function deleteAgentMailDraft(
  workspaceId: string,
  inboxId: string,
  draftId: string,
): Promise<EmailDeleteDraftResponse> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  if (!inboxIds.includes(inboxId)) {
    throw new AgentMailApiError(404, "", "Inbox is not selected for this workspace");
  }

  const client = new AgentMailClient({ apiKey });
  const draft = await resolveDraftAcrossInboxes(
    client,
    inboxIds,
    draftId,
    inboxId,
  );
  await client.deleteDraft(draft.inboxId, draft.draftId);

  const parentMessageId =
    draft.inReplyTo?.trim() ||
    resolveConceptDraftParentMessageId(draft.clientId, []);
  if (parentMessageId) {
    await deleteConceptReplyDraftsForMessage(
      client,
      inboxIds,
      parentMessageId,
      draft.draftId,
    );
  }

  return { inboxId: draft.inboxId, draftId: draft.draftId };
}

export async function updateAgentMailDraft(
  workspaceId: string,
  inboxId: string,
  draftId: string,
  body: string,
): Promise<ApiAgentMailDraftDetail> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  if (!inboxIds.includes(inboxId)) {
    throw new AgentMailApiError(404, "", "Inbox is not selected for this workspace");
  }

  const client = new AgentMailClient({ apiKey });
  const draft = await resolveDraftAcrossInboxes(
    client,
    inboxIds,
    draftId,
    inboxId,
  );
  const templates = await getEmailReplyTemplatesForInbox(
    workspaceId,
    draft.inboxId,
  );
  const replyContext = await resolveReplyContextForDraft(client, draft, inboxId);
  const replyFrom = replyContext.replyFrom;
  let subject = draft.subject?.trim() || "Reply concept";
  let contextText = replyContext.contextText;
  if (!draft.subject?.trim() && draft.inReplyTo?.trim() && replyFrom) {
    try {
      const parent = await client.getMessage(
        draft.inboxId || inboxId,
        draft.inReplyTo,
      );
      subject = replySubject(parent.subject);
      contextText = parent.text ?? parent.extractedText ?? contextText;
    } catch {
      // Keep fallback subject.
    }
  }
  const isCompose = !draft.inReplyTo?.trim();
  const languageHint = detectEmailLanguage(body, contextText);
  const assembled = isCompose
    ? assembleComposeEmail({
        to: replyFrom || draft.to[0] || "",
        subject,
        body,
        templates,
        languageHint,
      })
    : assembleReplyEmail({
        from: replyFrom || "there",
        subject,
        body,
        templates,
        languageHint,
        contextText,
      });
  const updated = await client.updateDraft(draft.inboxId, draft.draftId, {
    text: assembled.text,
    html: plainTextEmailToHtml(assembled.text),
  });
  const inboxEmail = await resolveInboxEmail(client, updated.inboxId);
  return mapDraftDetailForApi({
    draft: updated,
    replyFrom,
    templates,
    inboxEmail,
    contextText,
  });
}

export async function testAgentMailConnection(
  workspaceId: string,
): Promise<AgentMailTestConnectionResult> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    return {
      ok: false,
      error: "AgentMail API key is not configured.",
      organizationId: null,
      inboxEmail: null,
      inboxCount: null,
    };
  }

  try {
    const client = new AgentMailClient({ apiKey });
    const [me, inboxes] = await Promise.all([
      client.authMe(),
      client.listInboxes({ limit: 100 }),
    ]);

    if (inboxIds.length === 0) {
      return {
        ok: true,
        error: null,
        organizationId: me.organizationId,
        inboxEmail: null,
        inboxCount: inboxes.length,
      };
    }

    const known = new Set(inboxes.map((entry) => entry.inboxId));
    const missing = inboxIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      return {
        ok: false,
        error: "One or more stored inbox ids were not found for this AgentMail API key.",
        organizationId: me.organizationId,
        inboxEmail: null,
        inboxCount: inboxes.length,
      };
    }

    const first = inboxes.find((entry) => entry.inboxId === inboxIds[0]);
    return {
      ok: true,
      error: null,
      organizationId: me.organizationId,
      inboxEmail: first?.email ?? null,
      inboxCount: inboxes.length,
    };
  } catch (error) {
    const message =
      error instanceof AgentMailApiError
        ? error.status === 401 || error.status === 403
          ? "AgentMail rejected the API key (unauthorized)."
          : error.message
        : error instanceof Error
          ? error.message
          : "AgentMail connection test failed.";
    return {
      ok: false,
      error: message,
      organizationId: null,
      inboxEmail: null,
      inboxCount: null,
    };
  }
}

function parseSenderEmail(from: string): string | null {
  const trimmed = from.trim();
  if (!trimmed) return null;
  const angle = trimmed.match(/<([^>]+)>/);
  const candidate = (angle?.[1] ?? trimmed).trim().toLowerCase();
  return candidate.includes("@") ? candidate : null;
}

async function removeAgentMailMessageAndLocal(
  client: AgentMailClient,
  workspaceId: string,
  inboxIds: readonly string[],
  inboxId: string,
  message: { messageId: string; threadId?: string | null },
): Promise<void> {
  const messageId = message.messageId;
  const threadId = message.threadId?.trim() || "";

  // Prefer whole-thread delete so collapsed inbox rows disappear cleanly.
  if (threadId) {
    try {
      await client.deleteThread(inboxId, threadId);
    } catch (error) {
      if (!(error instanceof AgentMailApiError) || error.status !== 404) {
        throw error;
      }
      await client.deleteMessage(inboxId, messageId);
    }
  } else {
    await client.deleteMessage(inboxId, messageId);
  }

  const threadKey = emailThreadsService.resolveEmailThreadKey({
    threadId: threadId || null,
    messageId,
  });
  await emailThreadsService.deleteEmailThreadLocal(
    workspaceId,
    inboxId,
    threadKey,
  );
  await deleteConceptReplyDraftsForMessage(client, inboxIds, messageId);
}

/**
 * Delete the AgentMail thread (or single message) and local BacksterOS metadata.
 */
export async function deleteAgentMailMessage(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<{ ok: true }> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  if (!inboxIds.includes(inboxId)) {
    throw new AgentMailApiError(404, "", "Inbox is not selected for this workspace");
  }

  const client = new AgentMailClient({ apiKey });
  const message = await client.getMessage(inboxId, messageId);
  await removeAgentMailMessageAndLocal(
    client,
    workspaceId,
    inboxIds,
    inboxId,
    message,
  );
  return { ok: true };
}

/**
 * Report spam on AgentMail: label + block sender, then delete the thread.
 */
export async function reportAgentMailMessageSpam(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<{ ok: true; blockedSender: string | null }> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  if (!inboxIds.includes(inboxId)) {
    throw new AgentMailApiError(404, "", "Inbox is not selected for this workspace");
  }

  const client = new AgentMailClient({ apiKey });
  const message = await client.getMessage(inboxId, messageId);
  const threadId = message.threadId?.trim() || "";
  const sender = parseSenderEmail(message.from);

  try {
    await client.updateMessageLabels(inboxId, messageId, {
      addLabels: ["spam"],
    });
  } catch {
    /* spam may be a system label — continue with block + delete */
  }

  if (threadId) {
    try {
      await client.updateThreadLabels(inboxId, threadId, {
        addLabels: ["spam"],
      });
    } catch {
      /* ignore — label is best-effort */
    }
  }

  if (sender) {
    try {
      await client.createListEntry(inboxId, "receive", "block", {
        entry: sender,
        reason: "Reported as spam from BacksterOS",
      });
    } catch (error) {
      // Duplicate block entries are fine.
      if (!(error instanceof AgentMailApiError) || error.status !== 409) {
        throw error;
      }
    }
  }

  await removeAgentMailMessageAndLocal(
    client,
    workspaceId,
    inboxIds,
    inboxId,
    message,
  );
  return { ok: true, blockedSender: sender };
}

export { inboxLabel, formatAgentMailSettingsError };
