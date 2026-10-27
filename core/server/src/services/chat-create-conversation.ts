import { and, desc, eq, isNull } from "drizzle-orm";

import type {
  ChatConversationDetail,
  ChatCreateChannel,
  ChatInboxesList,
  ChatMessagingWindow,
  ChatWhatsAppTemplatesList,
  CreateChatConversationInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  chatConversations,
  chatMessages,
  contacts,
} from "../db/schema.js";
import { randomUUID } from "node:crypto";

import {
  evaluateMessagingWindow,
  resolveChatCreateChannel,
  X_LEMO_DESIGN_INBOX_ID,
} from "../lib/chat-messaging-window.js";
import {
  ChatwootApiError,
  xUserIdFromChatwootFields,
  type ChatwootClient,
  type ChatwootContactSummary,
  type ChatwootConversationSummary,
} from "../lib/chatwoot-client.js";
import {
  createChatwootClient,
  getChatwootCredentials,
} from "./chatwoot-settings.js";
import {
  getChatConversation,
  upsertConversationFromChatwoot,
  upsertMessageFromChatwoot,
} from "./chat-service.js";
import { notifyPeerOfEntityWrite } from "./core-replication/nudge.js";
import { publishChatUpdated } from "../lib/chat-events.js";

function badRequest(message: string, code = "bad_request"): Error {
  return Object.assign(new Error(message), { status: 400, code });
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { status: 404, code: "not_found" });
}

export function normalizePhoneDigits(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  return digits || null;
}

function primaryPhone(contact: {
  phone: string | null;
  phones: { number: string }[] | null;
}): string | null {
  const primary = contact.phone?.trim();
  if (primary) return primary;
  for (const entry of contact.phones ?? []) {
    const number = entry.number?.trim();
    if (number) return number;
  }
  return null;
}

function primaryEmail(contact: {
  email: string | null;
}): string | null {
  const email = contact.email?.trim();
  return email || null;
}

/** Instagram IGSID / Messenger PSID / Telegram chat_id — digits only. */
export function numericChannelSourceId(
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return /^\d+$/.test(value) ? value : null;
}

/** Exact WhatsApp match: normalized phone digits must equal. */
export function pickExactWhatsAppContact(
  hits: readonly ChatwootContactSummary[],
  phoneDigits: string,
): ChatwootContactSummary | null {
  const want = normalizePhoneDigits(phoneDigits);
  if (!want) return null;
  return (
    hits.find((hit) => normalizePhoneDigits(hit.phone) === want) ?? null
  );
}

/** Exact Support match: email equal, case-insensitive. */
export function pickExactSupportContact(
  hits: readonly ChatwootContactSummary[],
  email: string,
): ChatwootContactSummary | null {
  const want = email.trim().toLowerCase();
  if (!want) return null;
  return (
    hits.find((hit) => hit.email?.trim().toLowerCase() === want) ?? null
  );
}

/** Numeric X user id only — never an @handle. */
export function normalizeXUserId(
  raw: string | null | undefined,
): string | null {
  return numericChannelSourceId(raw);
}

/**
 * Exact X match: Chatwoot contact identifier or custom_attributes.x_user_id
 * equals the numeric X user id (never an @handle).
 */
export function pickExactXContact(
  hits: readonly ChatwootContactSummary[],
  xUserId: string,
): ChatwootContactSummary | null {
  const want = normalizeXUserId(xUserId);
  if (!want) return null;
  return (
    hits.find((hit) => {
      const fromContact = xUserIdFromChatwootFields({
        identifier: hit.identifier,
        customAttributes: hit.customAttributes,
      });
      return fromContact === want || normalizeXUserId(hit.xUserId) === want;
    }) ?? null
  );
}

/**
 * Conflicting numeric X id already stored on a Chatwoot contact.
 * Returns the conflicting value when identifier or custom_attributes.x_user_id
 * is set to something other than `want`.
 */
export function conflictingChatwootXUserId(
  contact: ChatwootContactSummary,
  want: string,
): string | null {
  const expected = normalizeXUserId(want);
  if (!expected) return null;
  const fromIdentifier = normalizeXUserId(contact.identifier);
  if (fromIdentifier && fromIdentifier !== expected) return fromIdentifier;
  const fromCustom = normalizeXUserId(
    contact.customAttributes
      ? String(contact.customAttributes.x_user_id ?? "")
      : null,
  ) ?? normalizeXUserId(contact.xUserId);
  if (fromCustom && fromCustom !== expected) return fromCustom;
  return null;
}

/**
 * Prefer inbox-8 conversations that already carry this x_user_id.
 * No inbox-only fallback — another user's thread in the same inbox must not
 * match.
 */
export function pickInboxXConversation(
  list: readonly ChatwootConversationSummary[],
  inboxId: string,
  xUserId: string,
): ChatwootConversationSummary | null {
  const want = normalizeXUserId(xUserId);
  if (!want) return null;
  return (
    list.find((entry) => {
      if (entry.inboxId !== inboxId) return false;
      const fromConvo = xUserIdFromChatwootFields({
        identifier: entry.contact.identifier,
        customAttributes: entry.customAttributes,
        additionalAttributes: entry.additionalAttributes,
      });
      return fromConvo === want || normalizeXUserId(entry.xUserId) === want;
    }) ?? null
  );
}

/**
 * Only ignore Chatwoot "contact inbox already exists" duplicates.
 * Other 4xx must surface to the UI.
 */
export function isIgnorableContactInboxDuplicate(error: unknown): boolean {
  if (!(error instanceof ChatwootApiError)) return false;
  if (error.status !== 422) return false;
  const haystack = `${error.message}\n${error.body}`.toLowerCase();
  return (
    haystack.includes("already exists") ||
    haystack.includes("already been taken") ||
    haystack.includes("has already been taken")
  );
}

type LoadedContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phones: { number: string }[] | null;
  socialAccounts: { platform: string; url: string }[] | null;
  facebookMessengerId: string | null;
  xUserId: string | null;
};

type LocalConversation = Awaited<
  ReturnType<typeof findLocalChannelConversation>
>;

async function loadContact(workspaceId: string, contactId: string) {
  const [row] = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      phones: contacts.phones,
      socialAccounts: contacts.socialAccounts,
      facebookMessengerId: contacts.facebookMessengerId,
      xUserId: contacts.xUserId,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.id, contactId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Contact");
  return row;
}

async function listChannelInboxes(
  workspaceId: string,
  channel?: ChatCreateChannel,
): Promise<ChatInboxesList> {
  const credentials = await getChatwootCredentials(workspaceId);
  if (!credentials) throw badRequest("Chatwoot is not configured.");
  const client = createChatwootClient(credentials);
  const inboxes = await client.listInboxes();
  const mapped = inboxes.map((inbox) => ({
    id: inbox.id,
    name: inbox.name,
    channelType: inbox.channelType,
    channel: resolveChatCreateChannel(inbox.channelType, inbox.name),
  }));
  return {
    inboxes: channel
      ? mapped.filter((inbox) => inbox.channel === channel)
      : mapped,
  };
}

async function resolveInboxId(
  workspaceId: string,
  channel: ChatCreateChannel,
  inboxId?: string | null,
): Promise<{ id: string; name: string; channelType: string | null }> {
  const { inboxes } = await listChannelInboxes(workspaceId, channel);
  if (inboxId?.trim()) {
    const match = inboxes.find((inbox) => inbox.id === inboxId.trim());
    if (!match) {
      throw badRequest(`No ${channel} Chatwoot inbox with id ${inboxId}.`);
    }
    return {
      id: match.id,
      name: match.name,
      channelType: match.channelType,
    };
  }
  const preferred =
    channel === "x"
      ? inboxes.find((inbox) => inbox.id === X_LEMO_DESIGN_INBOX_ID) ??
        inboxes.find((inbox) =>
          inbox.name.toLowerCase().includes("lemodesign"),
        ) ??
        inboxes[0]
      : channel === "support"
        ? inboxes.find((inbox) =>
            inbox.name.toLowerCase().includes("support"),
          ) ?? inboxes[0]
        : inboxes[0];
  if (!preferred) {
    throw badRequest(`No Chatwoot ${channel} inbox is configured.`);
  }
  return {
    id: preferred.id,
    name: preferred.name,
    channelType: preferred.channelType,
  };
}

async function findLocalChannelConversation(
  workspaceId: string,
  contactId: string,
  channel: ChatCreateChannel,
) {
  const rows = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.workspaceId, workspaceId),
        eq(chatConversations.contactId, contactId),
        isNull(chatConversations.deletedAt),
      ),
    )
    .orderBy(desc(chatConversations.lastActivityAt));
  return (
    rows.find(
      (row) =>
        resolveChatCreateChannel(row.channelType, row.inboxName) === channel,
    ) ?? null
  );
}

async function lastIncomingAtForConversation(
  workspaceId: string,
  conversationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.conversationId, conversationId),
        eq(chatMessages.direction, "incoming"),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  return row?.createdAt?.toISOString() ?? null;
}

export async function listChatInboxes(
  workspaceId: string,
  channel?: ChatCreateChannel,
): Promise<ChatInboxesList> {
  return listChannelInboxes(workspaceId, channel);
}

export async function getChatMessagingWindow(
  workspaceId: string,
  input: { channel: ChatCreateChannel; contactId: string },
): Promise<ChatMessagingWindow> {
  const { window } = await getMessagingWindowWithDeps(
    workspaceId,
    input,
    defaultDeps,
  );
  return window;
}

export async function listChatWhatsAppTemplates(
  workspaceId: string,
  inboxId?: string,
): Promise<ChatWhatsAppTemplatesList> {
  const inbox = await resolveInboxId(workspaceId, "whatsapp", inboxId);
  const credentials = await getChatwootCredentials(workspaceId);
  if (!credentials) throw badRequest("Chatwoot is not configured.");
  const client = createChatwootClient(credentials);
  const templates = await client.listMessageTemplates(inbox.id);
  return {
    inboxId: inbox.id,
    templates: templates
      .filter((template) => {
        const status = (template.status ?? "").toLowerCase();
        return !status || status === "approved" || status === "active";
      })
      .map((template) => ({
        name: template.name,
        category: template.category,
        language: template.language,
        status: template.status,
        body: template.body,
      })),
  };
}

type EnsureChatwootContactInput = {
  channel: ChatCreateChannel;
  contact: LoadedContact;
  inboxId: string;
  sourceId: string | null;
  /** Existing local mirror of a Chatwoot conversation (Meta / Telegram). */
  existing: LocalConversation;
  client: Pick<
    ChatwootClient,
    | "searchContacts"
    | "createContact"
    | "updateContact"
    | "getContactInboxes"
    | "createContactInbox"
    | "getConversation"
    | "listContactConversations"
    | "filterContactsByCustomAttribute"
    | "filterConversationsByAttribute"
  >;
};

/**
 * Resolve the Chatwoot contact for create/reopen.
 * Exact phone/email only for WhatsApp/Support; Meta/Telegram use the existing
 * conversation's Chatwoot contact — never fuzzy name search.
 */
export async function ensureChatwootContact(
  input: EnsureChatwootContactInput,
): Promise<{ chatwootContactId: string; sourceId: string | null }> {
  const { client, channel, contact, inboxId } = input;

  if (channel === "x") {
    const xUserId = normalizeXUserId(contact.xUserId);
    if (!xUserId) {
      throw badRequest(
        "X DMs need a numeric X user id on the contact (not an @handle).",
        "x_user_id_required",
      );
    }
    const hits = await client.searchContacts(xUserId);
    let chatwootContact = pickExactXContact(hits, xUserId);
    // Conv 17 style: contact may lack identifier but has custom_attributes.x_user_id.
    if (!chatwootContact?.id) {
      const byAttr = await client.filterContactsByCustomAttribute({
        attributeKey: "x_user_id",
        value: xUserId,
      });
      chatwootContact = pickExactXContact(byAttr, xUserId);
    }
    // Last resort: conversation in inbox 8 that already carries x_user_id.
    if (!chatwootContact?.id) {
      const byConvo = await client.filterConversationsByAttribute({
        attributeKey: "x_user_id",
        value: xUserId,
        inboxId,
      });
      const match = pickInboxXConversation(byConvo, inboxId, xUserId);
      if (match?.contact.id) {
        chatwootContact = match.contact;
      }
    }
    if (!chatwootContact?.id) {
      chatwootContact = await client.createContact({
        name: contact.name,
        email: contact.email,
        phone: primaryPhone(contact),
        identifier: xUserId,
        customAttributes: { x_user_id: xUserId },
      });
    } else {
      const conflict = conflictingChatwootXUserId(chatwootContact, xUserId);
      if (conflict) {
        throw badRequest(
          `Chatwoot contact already has X user id ${conflict}; refusing to overwrite with ${xUserId}.`,
          "x_user_id_conflict",
        );
      }
      await client.updateContact(chatwootContact.id, {
        identifier: xUserId,
        customAttributes: { x_user_id: xUserId },
      });
    }
    const chatwootContactId = chatwootContact.id?.trim();
    if (!chatwootContactId) {
      throw badRequest("Chatwoot contact was created without an id.");
    }
    const inboxes = await client.getContactInboxes(chatwootContactId);
    const existingInbox = inboxes.find(
      (entry) => entry.inboxId === inboxId && entry.sourceId?.trim(),
    );
    let sourceId = existingInbox?.sourceId?.trim() || null;
    if (!sourceId) {
      sourceId = randomUUID();
      try {
        await client.createContactInbox({
          contactId: chatwootContactId,
          inboxId,
          sourceId,
        });
      } catch (error) {
        if (!isIgnorableContactInboxDuplicate(error)) {
          throw error;
        }
        const refreshed = await client.getContactInboxes(chatwootContactId);
        sourceId =
          refreshed.find((entry) => entry.inboxId === inboxId)?.sourceId?.trim() ||
          sourceId;
      }
    }
    return { chatwootContactId, sourceId };
  }

  if (channel === "telegram") {
    if (!input.existing?.externalId) {
      throw badRequest(
        "Telegram bots can only message users who have started the bot. Pick a contact with an existing Telegram chat.",
        "telegram_chat_required",
      );
    }
    const remote = await client.getConversation(input.existing.externalId);
    const chatwootContactId = remote?.contact.id?.trim() || null;
    if (!remote || !chatwootContactId) {
      throw badRequest(
        "Telegram bots can only message users who have started the bot. No Chatwoot Telegram contact was found for this thread.",
        "telegram_chat_required",
      );
    }
    let sourceId =
      numericChannelSourceId(input.sourceId) ||
      numericChannelSourceId(input.existing.contactUsername) ||
      numericChannelSourceId(remote.contact.username);
    if (!sourceId) {
      const inboxes = await client.getContactInboxes(chatwootContactId);
      const match = inboxes.find(
        (entry) =>
          entry.inboxId === inboxId && numericChannelSourceId(entry.sourceId),
      );
      sourceId = numericChannelSourceId(match?.sourceId);
    }
    if (!sourceId) {
      throw badRequest(
        "Telegram bots can only message users who have started the bot. Missing chat_id on the existing thread.",
        "telegram_chat_required",
      );
    }
    return { chatwootContactId, sourceId };
  }

  if (channel === "instagram" || channel === "messenger") {
    if (!input.existing?.externalId) {
      throw badRequest(
        `${channel === "instagram" ? "Instagram" : "Messenger"} only allows replies after the contact messages you first. No cold outreach.`,
        "messaging_window_closed",
      );
    }
    const remote = await client.getConversation(input.existing.externalId);
    const chatwootContactId = remote?.contact.id?.trim() || null;
    if (!remote || !chatwootContactId) {
      throw badRequest(
        `Could not resolve the Chatwoot contact for this ${channel} conversation.`,
        "messaging_window_closed",
      );
    }

    let sourceId: string | null = null;
    if (channel === "messenger") {
      sourceId =
        contact.facebookMessengerId?.trim() ||
        numericChannelSourceId(input.sourceId) ||
        numericChannelSourceId(input.existing.contactUsername) ||
        numericChannelSourceId(remote.contact.username);
    } else {
      // Instagram: IGSID only — never an @handle from socialAccounts.
      sourceId =
        numericChannelSourceId(input.sourceId) ||
        numericChannelSourceId(input.existing.contactUsername) ||
        numericChannelSourceId(remote.contact.username);
    }
    if (!sourceId) {
      const inboxes = await client.getContactInboxes(chatwootContactId);
      const match = inboxes.find(
        (entry) =>
          (entry.inboxId === inboxId ||
            (entry.channelType ?? "").toLowerCase().includes(channel)) &&
          numericChannelSourceId(entry.sourceId),
      );
      sourceId = numericChannelSourceId(match?.sourceId);
    }
    if (!sourceId) {
      throw badRequest(
        `${channel === "instagram" ? "Instagram" : "Messenger"} requires an existing channel id (IGSID/PSID) from a prior thread.`,
        "messaging_window_closed",
      );
    }
    return { chatwootContactId, sourceId };
  }

  // WhatsApp / Support — exact match only; create when missing.
  let chatwootContact: ChatwootContactSummary | null = null;
  let sourceId = input.sourceId;

  if (channel === "whatsapp") {
    const phone = primaryPhone(contact);
    const phoneDigits = normalizePhoneDigits(phone);
    if (!phoneDigits) {
      throw badRequest(
        "WhatsApp requires a contact phone number.",
        "bad_request",
      );
    }
    sourceId = phoneDigits;
    const hits = await client.searchContacts(phoneDigits);
    chatwootContact = pickExactWhatsAppContact(hits, phoneDigits);
    if (!chatwootContact?.id) {
      chatwootContact = await client.createContact({
        name: contact.name,
        email: contact.email,
        phone,
        identifier: null,
      });
    }
  } else {
    // support
    const email = primaryEmail(contact);
    if (!email) {
      throw badRequest(
        "Support tickets need a contact with an email address.",
        "bad_request",
      );
    }
    sourceId = email;
    const hits = await client.searchContacts(email);
    chatwootContact = pickExactSupportContact(hits, email);
    if (!chatwootContact?.id) {
      chatwootContact = await client.createContact({
        name: contact.name,
        email,
        phone: primaryPhone(contact),
        identifier: email,
      });
    }
  }

  const chatwootContactId = chatwootContact.id?.trim();
  if (!chatwootContactId) {
    throw badRequest("Chatwoot contact was created without an id.");
  }

  if (sourceId) {
    const inboxes = await client.getContactInboxes(chatwootContactId);
    const hasInbox = inboxes.some(
      (entry) =>
        entry.inboxId === inboxId ||
        (entry.sourceId &&
          (channel === "whatsapp"
            ? normalizePhoneDigits(entry.sourceId) ===
              normalizePhoneDigits(sourceId)
            : entry.sourceId.trim().toLowerCase() ===
              sourceId.trim().toLowerCase())),
    );
    if (!hasInbox) {
      try {
        await client.createContactInbox({
          contactId: chatwootContactId,
          inboxId,
          sourceId,
        });
      } catch (error) {
        if (!isIgnorableContactInboxDuplicate(error)) {
          throw error;
        }
      }
    }
  }

  return { chatwootContactId, sourceId };
}

export type CreateChatConversationDeps = {
  loadContact: typeof loadContact;
  findLocalChannelConversation: typeof findLocalChannelConversation;
  lastIncomingAtForConversation: typeof lastIncomingAtForConversation;
  listChannelInboxes: typeof listChannelInboxes;
  getChatwootCredentials: typeof getChatwootCredentials;
  createChatwootClient: typeof createChatwootClient;
  upsertConversationFromChatwoot: typeof upsertConversationFromChatwoot;
  upsertMessageFromChatwoot: typeof upsertMessageFromChatwoot;
  getChatConversation: typeof getChatConversation;
  publishChatUpdated: typeof publishChatUpdated;
  notifyPeerOfEntityWrite: typeof notifyPeerOfEntityWrite;
  linkConversationContact: (
    conversationId: string,
    contactId: string,
  ) => Promise<void>;
};

const defaultDeps: CreateChatConversationDeps = {
  loadContact,
  findLocalChannelConversation,
  lastIncomingAtForConversation,
  listChannelInboxes,
  getChatwootCredentials,
  createChatwootClient,
  upsertConversationFromChatwoot,
  upsertMessageFromChatwoot,
  getChatConversation,
  publishChatUpdated,
  notifyPeerOfEntityWrite,
  linkConversationContact: async (conversationId, contactId) => {
    await db
      .update(chatConversations)
      .set({
        contactId,
        updatedAt: new Date(),
      })
      .where(eq(chatConversations.id, conversationId));
  },
};

async function resolveInboxIdWithDeps(
  workspaceId: string,
  channel: ChatCreateChannel,
  inboxId: string | null | undefined,
  deps: CreateChatConversationDeps,
): Promise<{ id: string; name: string; channelType: string | null }> {
  const { inboxes } = await deps.listChannelInboxes(workspaceId, channel);
  if (inboxId?.trim()) {
    const match = inboxes.find((inbox) => inbox.id === inboxId.trim());
    if (!match) {
      throw badRequest(`No ${channel} Chatwoot inbox with id ${inboxId}.`);
    }
    return {
      id: match.id,
      name: match.name,
      channelType: match.channelType,
    };
  }
  const preferred =
    channel === "x"
      ? inboxes.find((inbox) => inbox.id === X_LEMO_DESIGN_INBOX_ID) ??
        inboxes.find((inbox) =>
          inbox.name.toLowerCase().includes("lemodesign"),
        ) ??
        inboxes[0]
      : channel === "support"
        ? inboxes.find((inbox) =>
            inbox.name.toLowerCase().includes("support"),
          ) ?? inboxes[0]
        : inboxes[0];
  if (!preferred) {
    throw badRequest(`No Chatwoot ${channel} inbox is configured.`);
  }
  return {
    id: preferred.id,
    name: preferred.name,
    channelType: preferred.channelType,
  };
}

async function getMessagingWindowWithDeps(
  workspaceId: string,
  input: { channel: ChatCreateChannel; contactId: string },
  deps: CreateChatConversationDeps,
): Promise<{
  window: ChatMessagingWindow;
  contact: LoadedContact;
  local: LocalConversation;
}> {
  const contact = await deps.loadContact(workspaceId, input.contactId);
  const local = await deps.findLocalChannelConversation(
    workspaceId,
    contact.id,
    input.channel,
  );
  const lastIncomingAt = local
    ? await deps.lastIncomingAtForConversation(workspaceId, local.id)
    : null;

  let hasChannelIdentity = false;
  let sourceId: string | null = null;
  if (input.channel === "whatsapp") {
    sourceId = normalizePhoneDigits(primaryPhone(contact));
    hasChannelIdentity = Boolean(sourceId);
  } else if (input.channel === "messenger") {
    sourceId =
      contact.facebookMessengerId?.trim() ||
      numericChannelSourceId(local?.contactUsername) ||
      null;
    hasChannelIdentity = Boolean(sourceId) || Boolean(local?.externalId);
  } else if (input.channel === "instagram") {
    sourceId = numericChannelSourceId(local?.contactUsername);
    hasChannelIdentity = Boolean(local?.externalId);
  } else if (input.channel === "telegram") {
    sourceId =
      numericChannelSourceId(local?.contactUsername) ||
      local?.contactUsername?.trim() ||
      null;
    hasChannelIdentity = Boolean(local?.externalId);
  } else if (input.channel === "support") {
    sourceId = primaryEmail(contact);
    hasChannelIdentity = Boolean(sourceId);
  } else if (input.channel === "x") {
    sourceId = normalizeXUserId(contact.xUserId);
    hasChannelIdentity = Boolean(sourceId);
  }

  const evaluated = evaluateMessagingWindow({
    channel: input.channel,
    lastIncomingAt,
    hasChannelIdentity,
  });

  return {
    contact,
    local,
    window: {
      channel: input.channel,
      contactId: contact.id,
      open: evaluated.open,
      windowHours: evaluated.windowHours,
      lastIncomingAt: evaluated.lastIncomingAt,
      closesAt: evaluated.closesAt,
      reason: evaluated.reason,
      conversationId: local?.id ?? null,
      sourceId,
      requiresTemplate: evaluated.requiresTemplate,
    },
  };
}

export async function createChatConversation(
  workspaceId: string,
  input: CreateChatConversationInput,
  deps: CreateChatConversationDeps = defaultDeps,
): Promise<ChatConversationDetail> {
  const inbox = await resolveInboxIdWithDeps(
    workspaceId,
    input.channel,
    input.inboxId,
    deps,
  );
  const { contact, local, window } = await getMessagingWindowWithDeps(
    workspaceId,
    {
      channel: input.channel,
      contactId: input.contactId,
    },
    deps,
  );

  if (input.channel === "telegram" && !local?.externalId) {
    throw badRequest(
      window.reason ??
        "Telegram bots can only message users who have started the bot. Pick a contact with an existing Telegram chat.",
      "telegram_chat_required",
    );
  }

  if (input.channel === "whatsapp") {
    if (window.requiresTemplate && !input.template) {
      throw badRequest(
        window.reason ??
          "WhatsApp requires an approved message template outside the 24-hour window.",
        "template_required",
      );
    }
  } else if (!window.open) {
    throw badRequest(
      window.reason ?? `${input.channel} messaging window is closed.`,
      "messaging_window_closed",
    );
  }

  if (input.channel === "support" && !input.subject?.trim()) {
    throw badRequest("Support tickets require a subject.", "subject_required");
  }

  const credentials = await deps.getChatwootCredentials(workspaceId);
  if (!credentials) throw badRequest("Chatwoot is not configured.");
  const client = deps.createChatwootClient(credentials);

  const { chatwootContactId, sourceId } = await ensureChatwootContact({
    channel: input.channel,
    contact,
    inboxId: inbox.id,
    sourceId: window.sourceId,
    existing: local,
    client,
  });

  const xUserId =
    input.channel === "x" ? normalizeXUserId(contact.xUserId) : null;

  // Prefer an existing Chatwoot X thread (e.g. conversation 17) when the
  // contact already has one in the Lemo-Design X inbox — even if local mirror
  // is missing / not yet linked.
  let reuseExternalId = local?.externalId?.trim() || null;
  let reuseInboxId = local?.inboxId ?? inbox.id;
  let reuseChannelType = local?.channelType ?? inbox.channelType;
  let reuseInboxName = local?.inboxName ?? inbox.name;
  let reuseUsername = local?.contactUsername ?? null;
  let reuseAvatar = local?.contactAvatarUrl ?? null;
  let reuseStatus = local?.status ?? "open";

  if (!reuseExternalId && input.channel === "x" && !input.template) {
    const remoteList = await client.listContactConversations(chatwootContactId);
    // Only reuse threads in the X inbox — never post into another channel.
    const match =
      pickInboxXConversation(
        remoteList,
        inbox.id,
        xUserId ?? "",
      ) ??
      remoteList.find((entry) => entry.inboxId === inbox.id) ??
      remoteList.find((entry) => entry.inboxId === X_LEMO_DESIGN_INBOX_ID) ??
      null;
    if (match) {
      reuseExternalId = match.id;
      reuseInboxId = match.inboxId ?? inbox.id;
      reuseChannelType = match.channelType ?? inbox.channelType;
      reuseUsername = match.contact.username;
      reuseAvatar = match.contact.avatarUrl;
      reuseStatus = match.status;
    }
  }

  // Reopen existing Chatwoot conversation when we already have one.
  if (reuseExternalId && !input.template) {
    if (reuseStatus === "resolved") {
      await client.toggleConversationStatus(reuseExternalId, "open");
    }
    const remoteMessage = await client.createMessage(reuseExternalId, {
      content: input.content,
    });
    const { conversation } = await deps.upsertConversationFromChatwoot(
      workspaceId,
      {
        id: reuseExternalId,
        inboxId: reuseInboxId,
        status: "open",
        channelType: reuseChannelType,
        contact: {
          id: chatwootContactId,
          name: contact.name,
          email: contact.email,
          phone: primaryPhone(contact),
          username: reuseUsername,
          identifier: xUserId,
          avatarUrl: reuseAvatar,
        },
        lastActivityAt: remoteMessage.createdAt,
        unreadCount: 0,
        lastMessagePreview: remoteMessage.content.slice(0, 280),
      },
      {
        inboxName: reuseInboxName,
        markUnread: false,
        reviveDeleted: true,
        lastMessagePreview: remoteMessage.content.slice(0, 280),
      },
    );
    await deps.linkConversationContact(conversation.id, contact.id);
    await deps.upsertMessageFromChatwoot(
      workspaceId,
      conversation.id,
      remoteMessage,
    );
    deps.publishChatUpdated({
      workspaceId,
      conversationId: conversation.id,
      messageId: null,
      kind: "conversation",
    });
    deps.notifyPeerOfEntityWrite({
      workspaceId,
      entity: "chat_conversation",
      entityId: conversation.id,
      reason: "chat.create",
      operation: "upsert",
    });
    const detail = await deps.getChatConversation(workspaceId, conversation.id);
    if (!detail) {
      throw badRequest("Conversation was created but could not be loaded.");
    }
    return detail;
  }

  if (
    (input.channel === "telegram" ||
      input.channel === "instagram" ||
      input.channel === "messenger") &&
    !local?.externalId
  ) {
    throw badRequest(
      input.channel === "telegram"
        ? "Telegram bots can only message users who have started the bot. Pick a contact with an existing Telegram chat."
        : `${input.channel} only allows replies after the contact messages you first.`,
      input.channel === "telegram"
        ? "telegram_chat_required"
        : "messaging_window_closed",
    );
  }

  const supportSubject = input.subject?.trim() || null;
  const outboundContent =
    input.channel === "support" && supportSubject
      ? `${supportSubject}\n\n${input.content}`
      : input.content;

  const additionalAttributes: Record<string, unknown> = {};
  if (input.channel === "support" && supportSubject) {
    additionalAttributes.mail_subject = supportSubject;
  }
  if (input.channel === "x" && xUserId) {
    additionalAttributes.x_user_id = xUserId;
  }

  const conversationCustomAttributes =
    input.channel === "x" && xUserId ? { x_user_id: xUserId } : undefined;

  // Fresh create (WhatsApp template / support email / new X thread).
  const created = await client.createConversation({
    inboxId: inbox.id,
    contactId: chatwootContactId,
    // WhatsApp template sends often fail when a fabricated source_id is sent.
    sourceId:
      input.channel === "whatsapp" && input.template ? null : sourceId,
    status: "open",
    additionalAttributes:
      Object.keys(additionalAttributes).length > 0
        ? additionalAttributes
        : undefined,
    customAttributes: conversationCustomAttributes,
    message: {
      content: outboundContent,
      templateParams: input.template
        ? {
            name: input.template.name,
            category: input.template.category,
            language: input.template.language,
            processedParams: input.template.processedParams,
          }
        : undefined,
    },
  });
  const remoteConversationId = created.id;
  const remoteInboxId = created.inboxId;

  const remote =
    (await client.getConversation(remoteConversationId)) ??
    ({
      id: remoteConversationId,
      inboxId: remoteInboxId,
      status: "open",
      channelType: inbox.channelType,
      contact: {
        id: chatwootContactId,
        name: contact.name,
        email: contact.email,
        phone: primaryPhone(contact),
        username: sourceId,
        identifier: xUserId,
        avatarUrl: null,
      },
      lastActivityAt: new Date().toISOString(),
      unreadCount: 0,
      lastMessagePreview: outboundContent.slice(0, 280),
    } as const);

  const { conversation } = await deps.upsertConversationFromChatwoot(
    workspaceId,
    {
      ...remote,
      channelType: remote.channelType ?? inbox.channelType,
    },
    {
      inboxName: inbox.name,
      markUnread: false,
      reviveDeleted: true,
      lastMessagePreview: outboundContent.slice(0, 280),
    },
  );
  await deps.linkConversationContact(conversation.id, contact.id);

  try {
    const messages = await client.listMessages(remoteConversationId);
    for (const message of messages) {
      await deps.upsertMessageFromChatwoot(
        workspaceId,
        conversation.id,
        message,
      );
    }
  } catch {
    // Message list can lag right after create — detail still returns.
  }

  deps.publishChatUpdated({
    workspaceId,
    conversationId: conversation.id,
    messageId: null,
    kind: "conversation",
  });
  deps.notifyPeerOfEntityWrite({
    workspaceId,
    entity: "chat_conversation",
    entityId: conversation.id,
    reason: "chat.create",
    operation: "upsert",
  });

  const detail = await deps.getChatConversation(workspaceId, conversation.id);
  if (!detail) {
    throw badRequest("Conversation was created but could not be loaded.");
  }
  return detail;
}
