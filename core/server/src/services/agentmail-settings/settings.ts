import { and, eq, inArray, isNull } from "drizzle-orm";
import type {
  AgentMailInboxSummary,
  AgentMailSettings,
  AgentMailTestConnectionResult,
  UpdateAgentMailSettingsInput,
} from "@backsteros/contracts";

import { AgentMailApiError, AgentMailClient } from "../../lib/agentmail-client.js";
import { previewCursorApiKey } from "../cursor-settings.js";
import { db } from "../../db/index.js";
import { contacts, workspaceIntegrationSecrets } from "../../db/schema.js";
import {
  DEFAULT_EMAIL_REPLY_SIGN_OFF_NAME,
  type EmailReplyTemplateSettings,
  resolveEmailReplyTemplates,
} from "../../lib/email-reply-assembler.js";
import { resolveAgentsPublicWebhookBase } from "../../lib/agents-public-url.js";
const INBOX_EMAIL_CACHE_MS = 5 * 60 * 1000;

const inboxEmailCache = new Map<
  string,
  { email: string | null; expiresAt: number }
>();

/** Live AgentMail inbox list — BacksterOS always uses every inbox the key can see. */
const INBOX_LIST_CACHE_MS = 60_000;

const inboxListCache = new Map<
  string,
  {
    inboxes: Array<{
      inboxId: string;
      email: string;
      displayName: string | null;
      podId: string | null;
    }>;
    expiresAt: number;
  }
>();

function invalidateInboxListCache(apiKey?: string | null): void {
  if (apiKey) {
    inboxListCache.delete(apiKey);
    return;
  }
  inboxListCache.clear();
}

function sameInboxIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

async function listLiveInboxesForApiKey(apiKey: string): Promise<
  Array<{
    inboxId: string;
    email: string;
    displayName: string | null;
    podId: string | null;
  }>
> {
  const cached = inboxListCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.inboxes;
  }
  const client = new AgentMailClient({ apiKey });
  const inboxes = await client.listInboxes({ limit: 100 });
  inboxListCache.set(apiKey, {
    inboxes,
    expiresAt: Date.now() + INBOX_LIST_CACHE_MS,
  });
  return inboxes;
}

export function previewAgentMailApiKey(apiKey: string): string {
  return previewCursorApiKey(apiKey);
}

function previewUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.length > 48 ? `${parsed.pathname.slice(0, 45)}…` : parsed.pathname}`;
  } catch {
    return url.length > 64 ? `${url.slice(0, 61)}…` : url;
  }
}

export function formatAgentMailSettingsError(error: unknown): string {
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

export function inboxContactsFromRow(
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
      greetingTemplateEn?: string;
      greetingTemplateNl?: string;
      signOffTemplateEn?: string;
      signOffTemplateNl?: string;
    };
    inboxContacts?: Record<string, string>;
    webhook?: {
      webhookId: string | null;
      webhookSecret: string | null;
      webhookUrl: string | null;
    };
    grokWebhook?: {
      webhookUrl: string | null;
      webhookKey: string | null;
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
            options.templates.greetingTemplateEn?.trim() || null,
          agentmailReplyGreetingTemplateEn:
            options.templates.greetingTemplateEn?.trim() || null,
          agentmailReplyGreetingTemplateNl:
            options.templates.greetingTemplateNl?.trim() || null,
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

  const grokWebhookPatch =
    options?.grokWebhook === undefined
      ? {}
      : {
          emailGrokWebhookUrl: options.grokWebhook.webhookUrl,
          emailGrokWebhookKey: options.grokWebhook.webhookKey,
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
        ...grokWebhookPatch,
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
    ...grokWebhookPatch,
  });
}

export async function getSecretRow(workspaceId: string): Promise<{
  agentmailApiKey: string | null;
  agentmailInboxId: string | null;
  agentmailInboxIds: string[] | null;
  agentmailInboxContacts: Record<string, string> | null;
  agentmailReplyGreetingTemplate: string | null;
  agentmailReplyGreetingTemplateEn: string | null;
  agentmailReplyGreetingTemplateNl: string | null;
  agentmailReplySignOffTemplate: string | null;
  agentmailReplySignOffTemplateEn: string | null;
  agentmailReplySignOffTemplateNl: string | null;
  agentmailReplySignOffName: string | null;
  agentmailWebhookId: string | null;
  agentmailWebhookSecret: string | null;
  agentmailWebhookUrl: string | null;
  emailGrokWebhookUrl: string | null;
  emailGrokWebhookKey: string | null;
} | null> {
  const [row] = await db
    .select({
      agentmailApiKey: workspaceIntegrationSecrets.agentmailApiKey,
      agentmailInboxId: workspaceIntegrationSecrets.agentmailInboxId,
      agentmailInboxIds: workspaceIntegrationSecrets.agentmailInboxIds,
      agentmailInboxContacts: workspaceIntegrationSecrets.agentmailInboxContacts,
      agentmailReplyGreetingTemplate:
        workspaceIntegrationSecrets.agentmailReplyGreetingTemplate,
      agentmailReplyGreetingTemplateEn:
        workspaceIntegrationSecrets.agentmailReplyGreetingTemplateEn,
      agentmailReplyGreetingTemplateNl:
        workspaceIntegrationSecrets.agentmailReplyGreetingTemplateNl,
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
      emailGrokWebhookUrl: workspaceIntegrationSecrets.emailGrokWebhookUrl,
      emailGrokWebhookKey: workspaceIntegrationSecrets.emailGrokWebhookKey,
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
    | "greetingTemplateEn"
    | "greetingTemplateNl"
    | "signOffTemplateEn"
    | "signOffTemplateNl"
  >
> {
  const row = await getSecretRow(workspaceId);
  const resolved = resolveEmailReplyTemplates({
    greetingTemplateEn:
      row?.agentmailReplyGreetingTemplateEn ??
      row?.agentmailReplyGreetingTemplate ??
      undefined,
    greetingTemplateNl: row?.agentmailReplyGreetingTemplateNl ?? undefined,
    greetingTemplate: row?.agentmailReplyGreetingTemplate ?? undefined,
    signOffTemplateEn:
      row?.agentmailReplySignOffTemplateEn ??
      row?.agentmailReplySignOffTemplate ??
      undefined,
    signOffTemplateNl: row?.agentmailReplySignOffTemplateNl ?? undefined,
  });
  return {
    greetingTemplateEn: resolved.greetingTemplateEn,
    greetingTemplateNl: resolved.greetingTemplateNl,
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

/** DB-only credentials — never calls AgentMail (OS-146 dryRun / validate). */
export async function getStoredAgentMailCredentials(
  workspaceId: string,
): Promise<{ apiKey: string | null; inboxId: string | null; inboxIds: string[] }> {
  const row = await getSecretRow(workspaceId);
  const apiKey = row?.agentmailApiKey?.trim() || null;
  if (!apiKey) {
    return { apiKey: null, inboxId: null, inboxIds: [] };
  }
  const inboxIds = row ? inboxIdsFromRow(row) : [];
  return { apiKey, inboxId: inboxIds[0] ?? null, inboxIds };
}

export async function getAgentMailCredentials(
  workspaceId: string,
): Promise<{ apiKey: string | null; inboxId: string | null; inboxIds: string[] }> {
  const row = await getSecretRow(workspaceId);
  const apiKey = row?.agentmailApiKey?.trim() || null;
  if (!apiKey) {
    return { apiKey: null, inboxId: null, inboxIds: [] };
  }
  try {
    const inboxIds = (await listLiveInboxesForApiKey(apiKey)).map(
      (inbox) => inbox.inboxId,
    );
    return { apiKey, inboxId: inboxIds[0] ?? null, inboxIds };
  } catch {
    // AgentMail unreachable — fall back to last synced ids for webhooks/drafts.
    const inboxIds = row ? inboxIdsFromRow(row) : [];
    return { apiKey, inboxId: inboxIds[0] ?? null, inboxIds };
  }
}

async function syncStoredInboxIdsFromLive(
  workspaceId: string,
  apiKey: string,
  inboxIds: string[],
): Promise<void> {
  const row = await getSecretRow(workspaceId);
  const stored = row ? inboxIdsFromRow(row) : [];
  if (sameInboxIdSet(stored, inboxIds)) return;
  const contacts = pruneInboxContacts(inboxContactsFromRow(row), inboxIds);
  await upsertAgentMailSecrets(workspaceId, apiKey, inboxIds, {
    inboxContacts: contacts,
  });
  await ensureAgentMailWebhook(workspaceId, apiKey, inboxIds, {
    previousApiKey: apiKey,
  });
}

export function inboxLabel(inbox: AgentMailInboxSummary): string {
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

export async function resolveInboxEmail(
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
  const { apiKey } = await getAgentMailCredentials(workspaceId);
  let listed: AgentMailInboxSummary[] = [];
  let organizationId: string | null = null;
  let inboxIds: string[] = [];

  if (apiKey) {
    try {
      listed = (await listLiveInboxesForApiKey(apiKey)).map(toInboxSummary);
      inboxIds = listed.map((inbox) => inbox.inboxId);
      // Keep DB + AgentMail webhook inboxes aligned with the live org list.
      void syncStoredInboxIdsFromLive(workspaceId, apiKey, inboxIds).catch(
        (error) => {
          console.error("Failed to sync AgentMail inbox ids:", error);
        },
      );
    } catch {
      // Keep settings readable even if AgentMail is unreachable.
      const row = await getSecretRow(workspaceId);
      inboxIds = row ? inboxIdsFromRow(row) : [];
      listed = inboxIds.map((id) => ({
        inboxId: id,
        email: id,
        displayName: null,
        podId: null,
      }));
    }
    try {
      const client = new AgentMailClient({ apiKey });
      const me = await client.authMe();
      organizationId = me.organizationId;
    } catch {
      // Ignore auth lookup failures for settings display.
    }
  }

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
    listed,
    inboxContacts,
    contactNames,
  );
  const first = inboxesWithContacts[0] ?? null;
  const replyTemplates = await getEmailReplyTemplates(workspaceId);

  return {
    apiKeyConfigured: Boolean(apiKey),
    apiKeyPreview: apiKey ? previewAgentMailApiKey(apiKey) : null,
    inboxId: inboxIds[0] ?? null,
    inboxEmail: first?.email ?? null,
    inboxDisplayName: first?.displayName ?? null,
    inboxIds,
    inboxes: inboxesWithContacts,
    organizationId,
    connected: Boolean(apiKey),
    replyGreetingTemplate: replyTemplates.greetingTemplateEn,
    replyGreetingTemplateEn: replyTemplates.greetingTemplateEn,
    replyGreetingTemplateNl: replyTemplates.greetingTemplateNl,
    replySignOffTemplateEn: replyTemplates.signOffTemplateEn,
    replySignOffTemplateNl: replyTemplates.signOffTemplateNl,
    webhookConfigured: Boolean(secretRow?.agentmailWebhookId?.trim()),
    grokWebhookConfigured: Boolean(
      secretRow?.emailGrokWebhookUrl?.trim() &&
        secretRow?.emailGrokWebhookKey?.trim(),
    ),
    grokWebhookUrlPreview: secretRow?.emailGrokWebhookUrl?.trim()
      ? previewUrl(secretRow.emailGrokWebhookUrl.trim())
      : null,
  };
}

export async function updateAgentMailSettings(
  workspaceId: string,
  patch: UpdateAgentMailSettingsInput,
): Promise<AgentMailSettings> {
  const current = await getAgentMailCredentials(workspaceId);
  let nextApiKey = current.apiKey;

  if (patch.apiKey !== undefined) {
    const trimmed = patch.apiKey.trim();
    nextApiKey = trimmed.length > 0 ? trimmed : null;
    invalidateInboxListCache(current.apiKey);
    if (nextApiKey) invalidateInboxListCache(nextApiKey);
  }

  // Inbox selection was removed — always use every inbox the API key can list.
  let nextInboxIds: string[] = [];
  if (nextApiKey) {
    try {
      nextInboxIds = (await listLiveInboxesForApiKey(nextApiKey)).map(
        (inbox) => inbox.inboxId,
      );
    } catch {
      nextInboxIds = current.inboxIds;
    }
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

  await upsertAgentMailSecrets(workspaceId, nextApiKey, nextInboxIds, {
    inboxContacts: nextInboxContacts,
  });

  if (
    patch.replyGreetingTemplate !== undefined ||
    patch.replyGreetingTemplateEn !== undefined ||
    patch.replyGreetingTemplateNl !== undefined ||
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
          greetingTemplateEn:
            patch.replyGreetingTemplateEn ??
            patch.replyGreetingTemplate ??
            currentTemplates.greetingTemplateEn,
          greetingTemplateNl:
            patch.replyGreetingTemplateNl ??
            currentTemplates.greetingTemplateNl,
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

  if (patch.grokWebhookUrl !== undefined || patch.grokWebhookKey !== undefined) {
    const currentSecrets = await getSecretRow(workspaceId);
    const nextUrl =
      patch.grokWebhookUrl !== undefined
        ? patch.grokWebhookUrl.trim() || null
        : currentSecrets?.emailGrokWebhookUrl?.trim() || null;
    const nextKey =
      patch.grokWebhookKey !== undefined
        ? patch.grokWebhookKey.trim() || null
        : currentSecrets?.emailGrokWebhookKey?.trim() || null;
    await upsertAgentMailSecrets(workspaceId, nextApiKey, nextInboxIds, {
      inboxContacts: nextInboxContacts,
      grokWebhook: {
        webhookUrl: nextUrl,
        webhookKey: nextKey,
      },
    });
  }

  return getAgentMailSettings(workspaceId);
}

export function agentsPublicWebhookUrl(): string | null {
  const base = resolveAgentsPublicWebhookBase();
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

export async function testAgentMailConnection(
  workspaceId: string,
): Promise<AgentMailTestConnectionResult> {
  const { apiKey } = await getAgentMailCredentials(workspaceId);
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
    const inboxIds = inboxes.map((entry) => entry.inboxId);
    void syncStoredInboxIdsFromLive(workspaceId, apiKey, inboxIds).catch(
      (error) => {
        console.error("Failed to sync AgentMail inbox ids:", error);
      },
    );
    return {
      ok: true,
      error: null,
      organizationId: me.organizationId,
      inboxEmail: inboxes[0]?.email ?? null,
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
