/**
 * Thin Chatwoot Platform API client (account-scoped).
 * Auth: User Access Token via `api_access_token` header (never PowerSync).
 * @see https://developers.chatwoot.com/api-reference/introduction
 */

export class ChatwootApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message?: string,
  ) {
    super(message ?? `Chatwoot API error (${status})`);
    this.name = "ChatwootApiError";
  }
}

export type ChatwootClientOptions = {
  baseUrl: string;
  accountId: string;
  apiAccessToken: string;
};

export type ChatwootInboxSummary = {
  id: string;
  name: string;
  channelType: string | null;
};

export type ChatwootContactSummary = {
  id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  /** Channel username (Telegram @handle without @). */
  username: string | null;
  /**
   * Chatwoot `identifier` — for X this is the numeric user id (never @handle).
   */
  identifier: string | null;
  /**
   * Numeric X user id from `custom_attributes.x_user_id` or a numeric
   * `identifier` when present.
   */
  xUserId?: string | null;
  /**
   * Telegram bot chat_id from `contact_inboxes` source_id when the channel is
   * Telegram (digits). Distinct from a public @username.
   */
  telegramChatId?: string | null;
  /** Raw Chatwoot custom_attributes (may include `x_user_id`). */
  customAttributes?: Record<string, unknown> | null;
  avatarUrl: string | null;
};

export type ChatwootContactInboxSummary = {
  sourceId: string | null;
  inboxId: string | null;
  channelType: string | null;
};

export type ChatwootWhatsAppTemplateSummary = {
  name: string;
  category: string | null;
  language: string | null;
  status: string | null;
  body: string | null;
};

export type ChatwootCreateConversationInput = {
  inboxId: string;
  /** Required for most channels; WhatsApp template sends often omit it. */
  sourceId?: string | null;
  contactId?: string | null;
  status?: "open" | "resolved" | "pending";
  /** Optional Chatwoot additional_attributes (e.g. mail_subject for email). */
  additionalAttributes?: Record<string, unknown>;
  /** Optional Chatwoot custom_attributes (e.g. x_user_id for X DMs). */
  customAttributes?: Record<string, unknown>;
  message: {
    content: string;
    templateParams?: {
      name: string;
      category: string;
      language: string;
      processedParams?: Record<string, unknown>;
    };
  };
};

export type ChatwootConversationSummary = {
  id: string;
  inboxId: string | null;
  status: string;
  channelType: string | null;
  contact: ChatwootContactSummary;
  lastActivityAt: string | null;
  unreadCount: number;
  lastMessagePreview: string | null;
  /** Conversation additional_attributes (may include `x_user_id`). */
  additionalAttributes?: Record<string, unknown> | null;
  /** Conversation custom_attributes (may include `x_user_id`). */
  customAttributes?: Record<string, unknown> | null;
  /**
   * Numeric X user id from conversation custom/additional attributes when
   * present.
   */
  xUserId?: string | null;
};

export type ChatwootMessageSummary = {
  id: string;
  conversationId: string;
  content: string;
  contentType: string | null;
  messageType: "incoming" | "outgoing" | "activity";
  private: boolean;
  senderName: string | null;
  createdAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Digits-only id (X user id / Messenger PSID); rejects @handles. */
function numericOnlyId(raw: unknown): string | null {
  const text = asString(raw);
  if (!text) return null;
  return /^\d+$/.test(text) ? text : null;
}

/**
 * Prefer `custom_attributes.x_user_id`, then a numeric `identifier`.
 * Never returns an @handle.
 */
export function xUserIdFromChatwootFields(input: {
  identifier?: string | null;
  customAttributes?: Record<string, unknown> | null;
  additionalAttributes?: Record<string, unknown> | null;
}): string | null {
  const custom = input.customAttributes ?? null;
  const additional = input.additionalAttributes ?? null;
  return (
    numericOnlyId(custom?.x_user_id) ??
    numericOnlyId(additional?.x_user_id) ??
    numericOnlyId(input.identifier) ??
    null
  );
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function mapMessageType(
  raw: unknown,
): "incoming" | "outgoing" | "activity" {
  if (raw === 0 || raw === "incoming" || raw === "0") return "incoming";
  if (raw === 1 || raw === "outgoing" || raw === "1") return "outgoing";
  return "activity";
}

function unixOrIsoToIso(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value.trim());
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const n = asNumber(value);
  if (n == null) return null;
  // Chatwoot often sends unix seconds.
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeChannelUsername(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^@+/, "");
  if (!trimmed) return null;
  const tMe = trimmed.match(/(?:https?:\/\/)?(?:www\.)?t\.me\/([^/?#]+)/i);
  const handle = (tMe?.[1] ?? trimmed).replace(/^\/+|\/+$/g, "").split("/")[0];
  return handle?.trim() || null;
}

/**
 * X / Twitter (and some Chatwoot API proxies) put the screen name in the
 * display name as `Display (@handle)` when `username` / `screen_name` is empty.
 */
function usernameFromParenHandle(name: string | null): string | null {
  if (!name) return null;
  const match = name.match(/\(@([A-Za-z0-9_]{1,15})\)/);
  return match?.[1] ?? null;
}

/**
 * Facebook/Messenger PSIDs usually live on `contact_inboxes[].source_id`,
 * not in `additional_attributes` (those often only have an avatar hash).
 */
function usernameFromContactInboxes(
  inboxes: unknown,
  channelType?: string | null,
): string | null {
  if (!Array.isArray(inboxes)) return null;
  const preferred = (channelType ?? "").toLowerCase();
  const wantWhatsApp = preferred.includes("whatsapp");
  const wantX =
    preferred.includes("twitter") ||
    preferred.includes("channel::x") ||
    preferred === "x";
  const wantInstagram = preferred.includes("instagram");
  const wantFacebook =
    !preferred ||
    preferred.includes("facebook") ||
    preferred.includes("messenger");
  const wantTelegram = preferred.includes("telegram");
  let facebookFallback: string | null = null;
  let telegramFallback: string | null = null;
  let instagramFallback: string | null = null;
  let whatsappFallback: string | null = null;
  let xFallback: string | null = null;
  for (const item of inboxes) {
    const row = asRecord(item);
    if (!row) continue;
    const sourceId = normalizeChannelUsername(asString(row.source_id));
    if (!sourceId) continue;
    const inbox = asRecord(row.inbox);
    const inboxChannel = (
      asString(inbox?.channel_type) ??
      asString(row.channel_type) ??
      ""
    ).toLowerCase();
    if (inboxChannel.includes("whatsapp")) {
      // WhatsApp source_id is typically the E.164 phone (digits).
      whatsappFallback ??= sourceId;
    }
    if (
      inboxChannel.includes("twitter") ||
      inboxChannel.includes("channel::x") ||
      inboxChannel === "x"
    ) {
      // Prefer screen_name from attributes; source_id is often a numeric user id.
      xFallback ??= sourceId;
    }
    if (inboxChannel.includes("instagram")) {
      // Prefer @username from attributes when present; source_id is a numeric
      // Instagram-scoped id and is a weaker social match key.
      instagramFallback ??= sourceId;
    }
    if (inboxChannel.includes("facebook") || inboxChannel.includes("messenger")) {
      if (
        wantFacebook &&
        !wantTelegram &&
        !wantInstagram &&
        !wantWhatsApp &&
        !wantX
      ) {
        return sourceId;
      }
      facebookFallback ??= sourceId;
    }
    if (inboxChannel.includes("telegram")) {
      // Prefer @username from attributes when present; source_id is a numeric
      // Telegram user id and is a weaker social match key.
      telegramFallback ??= sourceId;
    }
  }
  if (wantWhatsApp) return whatsappFallback;
  if (wantX) return xFallback;
  if (wantInstagram) return instagramFallback;
  if (wantTelegram) return telegramFallback;
  if (wantFacebook) return facebookFallback;
  return (
    whatsappFallback ??
    xFallback ??
    instagramFallback ??
    facebookFallback ??
    telegramFallback
  );
}

function parseContact(
  raw: unknown,
  options?: { channelType?: string | null },
): ChatwootContactSummary {
  const record = asRecord(raw) ?? {};
  const additional = asRecord(record.additional_attributes) ?? {};
  const socialProfiles = asRecord(additional.social_profiles) ?? {};
  // Prefer public @handles (Telegram / Instagram / X) over opaque platform ids.
  // Facebook/Messenger often only expose a PSID — store that for Messenger ID.
  // WhatsApp identity is the phone number (also used as contact_inboxes source_id).
  // X / Twitter expose `screen_name` on additional_attributes.
  const phone =
    asString(record.phone_number) ?? asString(record.phone) ?? null;
  const channelLower = (options?.channelType ?? "").toLowerCase();
  const displayName =
    asString(record.name) ?? asString(record.available_name) ?? null;
  const identifier = asString(record.identifier);
  const customAttributes = asRecord(record.custom_attributes);
  const username =
    normalizeChannelUsername(asString(additional.username)) ??
    normalizeChannelUsername(asString(additional.screen_name)) ??
    normalizeChannelUsername(asString(additional.social_twitter_user_name)) ??
    normalizeChannelUsername(asString(additional.social_x_user_name)) ??
    normalizeChannelUsername(asString(socialProfiles.twitter)) ??
    normalizeChannelUsername(asString(socialProfiles.x)) ??
    normalizeChannelUsername(asString(additional.social_telegram_user_name)) ??
    normalizeChannelUsername(asString(additional.social_instagram_user_name)) ??
    normalizeChannelUsername(asString(socialProfiles.instagram)) ??
    normalizeChannelUsername(asString(record.username)) ??
    normalizeChannelUsername(asString(additional.social_facebook_user_id)) ??
    normalizeChannelUsername(asString(additional.social_facebook_user_name)) ??
    normalizeChannelUsername(identifier) ??
    usernameFromContactInboxes(record.contact_inboxes, options?.channelType) ??
    (channelLower.includes("whatsapp") && phone
      ? phone.replace(/[^\d+]/g, "").replace(/^\+/, "") || null
      : null) ??
    // X / API proxies often only expose the handle inside the display name
    // (`Display (@screen_name)`). Safe last resort — pattern is distinctive.
    usernameFromParenHandle(displayName);
  const telegramChatId =
    usernameFromContactInboxes(record.contact_inboxes, "Channel::Telegram") ??
    (channelLower.includes("telegram")
      ? normalizeChannelUsername(asString(record.identifier))?.match(
          /^\d{3,32}$/,
        )
        ? normalizeChannelUsername(asString(record.identifier))
        : null
      : null);

  return {
    id: asString(record.id),
    name: displayName,
    email: asString(record.email),
    phone,
    username,
    identifier,
    telegramChatId: telegramChatId?.match(/^\d{3,32}$/)
      ? telegramChatId
      : null,
    xUserId: xUserIdFromChatwootFields({
      identifier,
      customAttributes,
      additionalAttributes: additional,
    }),
    customAttributes,
    avatarUrl:
      asString(record.thumbnail) ??
      asString(record.avatar_url) ??
      asString(record.avatar),
  };
}

function parseConversation(raw: unknown): ChatwootConversationSummary | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = asString(record.id);
  if (!id) return null;
  const meta = asRecord(record.meta);
  const channelType =
    asString(record.channel) ??
    asString(meta?.channel) ??
    null;
  const sender = meta
    ? parseContact(meta.sender, { channelType })
    : parseContact(record.meta, { channelType });
  const messages = Array.isArray(record.messages) ? record.messages : [];
  const lastMsg = messages.length > 0 ? asRecord(messages[messages.length - 1]) : null;
  const unread =
    asNumber(record.unread_count) ??
    asNumber(record.agent_last_seen_at) ??
    0;
  const additionalAttributes = asRecord(record.additional_attributes);
  const customAttributes = asRecord(record.custom_attributes);
  return {
    id,
    inboxId: asString(record.inbox_id),
    status: (asString(record.status) ?? "open").toLowerCase(),
    channelType,
    contact: sender,
    lastActivityAt:
      unixOrIsoToIso(record.last_activity_at) ??
      unixOrIsoToIso(record.timestamp) ??
      unixOrIsoToIso(lastMsg?.created_at) ??
      null,
    unreadCount: Math.max(0, unread),
    lastMessagePreview: asString(lastMsg?.content) ?? asString(record.last_non_activity_message),
    additionalAttributes,
    customAttributes,
    xUserId: xUserIdFromChatwootFields({
      identifier: sender.identifier,
      customAttributes,
      additionalAttributes,
    }),
  };
}

/**
 * Resolve the conversation from a Chatwoot webhook body.
 * `message_*` payloads put the message id at the top level and nest the
 * conversation — never treat the message id as the conversation external id.
 */
function parseConversationFromWebhookPayload(
  payload: unknown,
  event?: string | null,
): ChatwootConversationSummary | null {
  const record = asRecord(payload);
  if (!record) return null;
  const eventName = (event ?? asString(record.event) ?? "").toLowerCase();
  const nested = asRecord(record.conversation);
  if (eventName.startsWith("message_") || nested) {
    if (nested) {
      const fromNested = parseConversation(nested);
      if (fromNested) return fromNested;
    }
    // Minimal fallback when only conversation_id is present on a message event.
    const conversationId = asString(record.conversation_id);
    if (conversationId) {
      const contact = parseContact(record.sender);
      const additionalAttributes = asRecord(record.additional_attributes);
      const customAttributes = asRecord(record.custom_attributes);
      return {
        id: conversationId,
        inboxId: asString(record.inbox_id),
        status: "open",
        channelType: null,
        contact,
        lastActivityAt: unixOrIsoToIso(record.created_at),
        unreadCount: 0,
        lastMessagePreview: asString(record.content),
        additionalAttributes,
        customAttributes,
        xUserId: xUserIdFromChatwootFields({
          identifier: contact.identifier,
          customAttributes,
          additionalAttributes,
        }),
      };
    }
    if (eventName.startsWith("message_")) return null;
  }
  return parseConversation(payload);
}

function parseMessage(
  raw: unknown,
  fallbackConversationId?: string | null,
): ChatwootMessageSummary | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = asString(record.id);
  if (!id) return null;
  const conversation =
    asRecord(record.conversation) ??
    (typeof record.conversation_id !== "undefined"
      ? { id: record.conversation_id }
      : null);
  const conversationId =
    asString(conversation?.id) ??
    asString(record.conversation_id) ??
    fallbackConversationId ??
    null;
  if (!conversationId) return null;
  const sender = parseContact(record.sender);
  const createdAt =
    unixOrIsoToIso(record.created_at) ??
    unixOrIsoToIso(record.timestamp) ??
    new Date().toISOString();
  return {
    id,
    conversationId,
    content: asString(record.content) ?? "",
    contentType: asString(record.content_type),
    messageType: mapMessageType(record.message_type),
    private: Boolean(record.private),
    senderName: sender.name,
    createdAt,
  };
}

export class ChatwootClient {
  private readonly baseUrl: string;
  private readonly accountId: string;
  private readonly apiAccessToken: string;

  constructor(options: ChatwootClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.accountId = options.accountId.trim();
    this.apiAccessToken = options.apiAccessToken.trim();
  }

  private accountPath(suffix: string): string {
    const path = suffix.startsWith("/") ? suffix : `/${suffix}`;
    return `${this.baseUrl}/api/v1/accounts/${encodeURIComponent(this.accountId)}${path}`;
  }

  private async requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      // Use dashed form — reverse proxies (Caddy) often drop underscore headers.
      "Api-Access-Token": this.apiAccessToken,
    };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const response = await fetch(this.accountPath(path), {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new ChatwootApiError(
        response.status,
        text,
        response.status === 401 || response.status === 403
          ? "Chatwoot rejected the access token (unauthorized)."
          : `Chatwoot request failed (${response.status})`,
      );
    }
    if (!text.trim()) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ChatwootApiError(response.status, text, "Invalid Chatwoot JSON");
    }
  }

  async listInboxes(): Promise<ChatwootInboxSummary[]> {
    const payload = await this.requestJson<unknown>("GET", "/inboxes");
    const record = asRecord(payload);
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(record?.payload)
        ? record!.payload
        : Array.isArray(record?.data)
          ? record!.data
          : [];
    const out: ChatwootInboxSummary[] = [];
    for (const item of list) {
      const row = asRecord(item);
      if (!row) continue;
      const id = asString(row.id);
      if (!id) continue;
      out.push({
        id,
        name: asString(row.name) ?? `Inbox ${id}`,
        channelType: asString(row.channel_type) ?? asString(row.channel),
      });
    }
    return out;
  }

  async listConversations(options?: {
    status?: string;
    page?: number;
  }): Promise<ChatwootConversationSummary[]> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.page) params.set("page", String(options.page));
    const qs = params.toString();
    const payload = await this.requestJson<unknown>(
      "GET",
      `/conversations${qs ? `?${qs}` : ""}`,
    );
    const record = asRecord(payload);
    const data = asRecord(record?.data);
    const list = Array.isArray(data?.payload)
      ? data!.payload
      : Array.isArray(record?.payload)
        ? record!.payload
        : Array.isArray(record?.data)
          ? record!.data
          : Array.isArray(payload)
            ? payload
            : [];
    const out: ChatwootConversationSummary[] = [];
    for (const item of list) {
      const parsed = parseConversation(item);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  async getConversation(
    conversationId: string,
  ): Promise<ChatwootConversationSummary | null> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/conversations/${encodeURIComponent(conversationId)}`,
    );
    return parseConversation(payload) ?? parseConversation(asRecord(payload)?.payload);
  }

  /**
   * Full contact record (includes `contact_inboxes` with Facebook PSIDs).
   */
  async getContact(
    contactId: string,
    options?: { channelType?: string | null },
  ): Promise<ChatwootContactSummary | null> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/contacts/${encodeURIComponent(contactId)}`,
    );
    const record =
      asRecord(payload)?.payload != null
        ? asRecord(asRecord(payload)?.payload)
        : asRecord(payload);
    if (!record) return null;
    const contact = parseContact(record, {
      channelType: options?.channelType,
    });
    return contact.id ? contact : null;
  }

  async listMessages(
    conversationId: string,
  ): Promise<ChatwootMessageSummary[]> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    const record = asRecord(payload);
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(record?.payload)
        ? record!.payload
        : Array.isArray(asRecord(record?.payload)?.messages)
          ? (asRecord(record!.payload)!.messages as unknown[])
          : Array.isArray(record?.messages)
            ? record!.messages
            : [];
    const out: ChatwootMessageSummary[] = [];
    for (const item of list) {
      const parsed = parseMessage(item, conversationId);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  async createMessage(
    conversationId: string,
    input: {
      content: string;
      private?: boolean;
      templateParams?: ChatwootCreateConversationInput["message"]["templateParams"];
    },
  ): Promise<ChatwootMessageSummary> {
    const body: Record<string, unknown> = {
      content: input.content,
      message_type: "outgoing",
      private: Boolean(input.private),
    };
    if (input.templateParams) {
      body.template_params = {
        name: input.templateParams.name,
        category: input.templateParams.category,
        language: input.templateParams.language,
        ...(input.templateParams.processedParams
          ? { processed_params: input.templateParams.processedParams }
          : {}),
      };
    }
    const payload = await this.requestJson<unknown>(
      "POST",
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      body,
    );
    const parsed =
      parseMessage(payload, conversationId) ??
      parseMessage(asRecord(payload)?.payload, conversationId);
    if (!parsed) {
      throw new ChatwootApiError(
        200,
        typeof payload === "string" ? payload : JSON.stringify(payload),
        "Chatwoot create message returned an unexpected payload",
      );
    }
    return parsed;
  }

  /**
   * Create a conversation (optionally with the first outbound message).
   * @see https://developers.chatwoot.com/api-reference/conversations/create-new-conversation
   */
  async createConversation(
    input: ChatwootCreateConversationInput,
  ): Promise<{ id: string; inboxId: string | null }> {
    const body: Record<string, unknown> = {
      inbox_id: Number(input.inboxId) || input.inboxId,
      status: input.status ?? "open",
      message: {
        content: input.message.content,
        message_type: "outgoing",
        private: false,
        content_type: "text",
        ...(input.message.templateParams
          ? {
              template_params: {
                name: input.message.templateParams.name,
                category: input.message.templateParams.category,
                language: input.message.templateParams.language,
                ...(input.message.templateParams.processedParams
                  ? {
                      processed_params:
                        input.message.templateParams.processedParams,
                    }
                  : {}),
              },
            }
          : {}),
      },
    };
    const sourceId = input.sourceId?.trim();
    if (sourceId) body.source_id = sourceId;
    const contactId = input.contactId?.trim();
    if (contactId) {
      body.contact_id = Number(contactId) || contactId;
    }
    if (
      input.additionalAttributes &&
      Object.keys(input.additionalAttributes).length > 0
    ) {
      body.additional_attributes = input.additionalAttributes;
    }
    if (
      input.customAttributes &&
      Object.keys(input.customAttributes).length > 0
    ) {
      body.custom_attributes = input.customAttributes;
    }
    const payload = await this.requestJson<unknown>(
      "POST",
      "/conversations",
      body,
    );
    const record =
      asRecord(payload) ?? asRecord(asRecord(payload)?.payload) ?? null;
    const id = asString(record?.id);
    if (!id) {
      throw new ChatwootApiError(
        200,
        typeof payload === "string" ? payload : JSON.stringify(payload),
        "Chatwoot create conversation returned an unexpected payload",
      );
    }
    return {
      id,
      inboxId: asString(record?.inbox_id) ?? input.inboxId,
    };
  }

  async searchContacts(query: string): Promise<ChatwootContactSummary[]> {
    const q = query.trim();
    if (!q) return [];
    const params = new URLSearchParams({ q });
    const payload = await this.requestJson<unknown>(
      "GET",
      `/contacts/search?${params.toString()}`,
    );
    const record = asRecord(payload);
    const list = Array.isArray(record?.payload)
      ? record!.payload
      : Array.isArray(asRecord(record?.payload)?.payload)
        ? (asRecord(record!.payload)!.payload as unknown[])
        : Array.isArray(payload)
          ? payload
          : [];
    const out: ChatwootContactSummary[] = [];
    for (const item of list) {
      const contact = parseContact(item);
      if (contact.id) out.push(contact);
    }
    return out;
  }

  async createContact(input: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    identifier?: string | null;
    customAttributes?: Record<string, unknown>;
  }): Promise<ChatwootContactSummary> {
    const body: Record<string, unknown> = {};
    if (input.name?.trim()) body.name = input.name.trim();
    if (input.email?.trim()) body.email = input.email.trim();
    if (input.phone?.trim()) body.phone_number = input.phone.trim();
    if (input.identifier?.trim()) body.identifier = input.identifier.trim();
    if (
      input.customAttributes &&
      Object.keys(input.customAttributes).length > 0
    ) {
      body.custom_attributes = input.customAttributes;
    }
    const payload = await this.requestJson<unknown>("POST", "/contacts", body);
    const record =
      asRecord(asRecord(payload)?.payload) ?? asRecord(payload) ?? {};
    const contact = parseContact(record);
    if (!contact.id) {
      throw new ChatwootApiError(
        200,
        typeof payload === "string" ? payload : JSON.stringify(payload),
        "Chatwoot create contact returned an unexpected payload",
      );
    }
    return contact;
  }

  async updateContact(
    contactId: string,
    input: {
      customAttributes?: Record<string, unknown>;
      identifier?: string | null;
    },
  ): Promise<ChatwootContactSummary> {
    const body: Record<string, unknown> = {};
    if (input.identifier?.trim()) body.identifier = input.identifier.trim();
    if (
      input.customAttributes &&
      Object.keys(input.customAttributes).length > 0
    ) {
      body.custom_attributes = input.customAttributes;
    }
    const payload = await this.requestJson<unknown>(
      "PUT",
      `/contacts/${encodeURIComponent(contactId)}`,
      body,
    );
    const record =
      asRecord(asRecord(payload)?.payload) ?? asRecord(payload) ?? {};
    const contact = parseContact(record);
    if (!contact.id) {
      const identifier = input.identifier?.trim() || null;
      const customAttributes = input.customAttributes ?? null;
      return {
        id: contactId,
        name: null,
        email: null,
        phone: null,
        username: null,
        identifier,
        xUserId: xUserIdFromChatwootFields({ identifier, customAttributes }),
        customAttributes,
        avatarUrl: null,
      };
    }
    return contact;
  }

  /**
   * Filter contacts by a custom attribute (e.g. x_user_id for inbox-8 reuse).
   * @see https://developers.chatwoot.com/api-reference/contacts/contact-filter
   */
  async filterContactsByCustomAttribute(input: {
    attributeKey: string;
    value: string;
  }): Promise<ChatwootContactSummary[]> {
    const key = input.attributeKey.trim();
    const value = input.value.trim();
    if (!key || !value) return [];
    const payload = await this.requestJson<unknown>("POST", "/contacts/filter", {
      payload: [
        {
          attribute_key: key,
          filter_operator: "equal_to",
          values: [value],
          attribute_model: "custom_attributes",
          custom_attribute_type: "contact_attribute",
        },
      ],
    });
    const record = asRecord(payload);
    const list = Array.isArray(record?.payload)
      ? record!.payload
      : Array.isArray(asRecord(record?.payload)?.payload)
        ? (asRecord(record!.payload)!.payload as unknown[])
        : Array.isArray(payload)
          ? payload
          : [];
    const out: ChatwootContactSummary[] = [];
    for (const item of list) {
      const contact = parseContact(item);
      if (contact.id) out.push(contact);
    }
    return out;
  }

  /**
   * Filter conversations by custom/additional attribute (x_user_id) and optional
   * inbox — used to find the inbox-8 X thread when contact identifier is empty.
   */
  async filterConversationsByAttribute(input: {
    attributeKey: string;
    value: string;
    inboxId?: string | null;
  }): Promise<ChatwootConversationSummary[]> {
    const key = input.attributeKey.trim();
    const value = input.value.trim();
    if (!key || !value) return [];
    const filters: Record<string, unknown>[] = [
      {
        attribute_key: key,
        filter_operator: "equal_to",
        values: [value],
        attribute_model: "custom_attributes",
        custom_attribute_type: "conversation_attribute",
        query_operator: input.inboxId?.trim() ? "AND" : undefined,
      },
    ];
    const inboxId = input.inboxId?.trim();
    if (inboxId) {
      filters.push({
        attribute_key: "inbox_id",
        filter_operator: "equal_to",
        values: [Number(inboxId) || inboxId],
        attribute_model: "standard",
      });
    }
    const payload = await this.requestJson<unknown>(
      "POST",
      "/conversations/filter",
      { payload: filters },
    );
    const record = asRecord(payload);
    const list = Array.isArray(record?.payload)
      ? record!.payload
      : Array.isArray(asRecord(record?.payload)?.payload)
        ? (asRecord(record!.payload)!.payload as unknown[])
        : Array.isArray(payload)
          ? payload
          : [];
    const out: ChatwootConversationSummary[] = [];
    for (const item of list) {
      const parsed = parseConversation(item);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  /** Conversations for a Chatwoot contact (used to reuse X thread / conv 17). */
  async listContactConversations(
    contactId: string,
  ): Promise<ChatwootConversationSummary[]> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/contacts/${encodeURIComponent(contactId)}/conversations`,
    );
    const record = asRecord(payload);
    const list = Array.isArray(record?.payload)
      ? record!.payload
      : Array.isArray(asRecord(record?.payload)?.payload)
        ? (asRecord(record!.payload)!.payload as unknown[])
        : Array.isArray(payload)
          ? payload
          : [];
    const out: ChatwootConversationSummary[] = [];
    for (const item of list) {
      const parsed = parseConversation(item);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  async createContactInbox(input: {
    contactId: string;
    inboxId: string;
    sourceId: string;
  }): Promise<ChatwootContactInboxSummary> {
    const payload = await this.requestJson<unknown>(
      "POST",
      `/contacts/${encodeURIComponent(input.contactId)}/contact_inboxes`,
      {
        inbox_id: Number(input.inboxId) || input.inboxId,
        source_id: input.sourceId,
      },
    );
    const record =
      asRecord(asRecord(payload)?.payload) ?? asRecord(payload) ?? {};
    const inbox = asRecord(record.inbox);
    return {
      sourceId: asString(record.source_id),
      inboxId: asString(inbox?.id) ?? asString(record.inbox_id) ?? input.inboxId,
      channelType: asString(inbox?.channel_type),
    };
  }

  async getContactInboxes(
    contactId: string,
  ): Promise<ChatwootContactInboxSummary[]> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/contacts/${encodeURIComponent(contactId)}`,
    );
    const record =
      asRecord(asRecord(payload)?.payload) ?? asRecord(payload) ?? {};
    const inboxes = Array.isArray(record.contact_inboxes)
      ? record.contact_inboxes
      : [];
    const out: ChatwootContactInboxSummary[] = [];
    for (const item of inboxes) {
      const row = asRecord(item);
      if (!row) continue;
      const inbox = asRecord(row.inbox);
      out.push({
        sourceId: asString(row.source_id),
        inboxId: asString(inbox?.id) ?? asString(row.inbox_id),
        channelType:
          asString(inbox?.channel_type) ?? asString(row.channel_type),
      });
    }
    return out;
  }

  async listMessageTemplates(
    inboxId: string,
  ): Promise<ChatwootWhatsAppTemplateSummary[]> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/inboxes/${encodeURIComponent(inboxId)}/message_templates`,
    );
    const record = asRecord(payload);
    const list = Array.isArray(record?.payload)
      ? record!.payload
      : Array.isArray(payload)
        ? payload
        : [];
    const out: ChatwootWhatsAppTemplateSummary[] = [];
    for (const item of list) {
      const row = asRecord(item);
      if (!row) continue;
      const name = asString(row.name) ?? asString(row.element_name);
      if (!name) continue;
      const components = Array.isArray(row.components) ? row.components : [];
      let body: string | null = null;
      for (const component of components) {
        const part = asRecord(component);
        if (!part) continue;
        if ((asString(part.type) ?? "").toLowerCase() === "body") {
          body = asString(part.text);
          break;
        }
      }
      out.push({
        name,
        category: asString(row.category),
        language:
          asString(row.language) ??
          asString(asRecord(row.language)?.code) ??
          null,
        status: asString(row.status),
        body,
      });
    }
    return out;
  }

  async toggleConversationStatus(
    conversationId: string,
    status: string,
  ): Promise<ChatwootConversationSummary | null> {
    const payload = await this.requestJson<unknown>(
      "POST",
      `/conversations/${encodeURIComponent(conversationId)}/toggle_status`,
      { status },
    );
    return (
      parseConversation(payload) ??
      parseConversation(asRecord(payload)?.payload) ??
      null
    );
  }

  /**
   * Tell Chatwoot the agent is typing so the website widget shows the
   * typing bubble (and vice versa when Chatwoot broadcasts contact typing).
   */
  async toggleTypingStatus(
    conversationId: string,
    typing: boolean,
    options?: { isPrivate?: boolean },
  ): Promise<void> {
    await this.requestJson<unknown>(
      "POST",
      `/conversations/${encodeURIComponent(conversationId)}/toggle_typing_status`,
      {
        typing_status: typing ? "on" : "off",
        is_private: Boolean(options?.isPrivate),
      },
    );
  }
}

export {
  parseConversation as parseChatwootConversationPayload,
  parseConversationFromWebhookPayload as parseChatwootConversationFromWebhookPayload,
  parseMessage as parseChatwootMessagePayload,
  mapMessageType as mapChatwootMessageType,
  asRecord as chatwootAsRecord,
  asString as chatwootAsString,
  unixOrIsoToIso as chatwootUnixOrIsoToIso,
};
