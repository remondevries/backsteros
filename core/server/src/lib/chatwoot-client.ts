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
  avatarUrl: string | null;
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

function parseContact(raw: unknown): ChatwootContactSummary {
  const record = asRecord(raw) ?? {};
  return {
    id: asString(record.id),
    name: asString(record.name) ?? asString(record.available_name),
    email: asString(record.email),
    phone: asString(record.phone_number) ?? asString(record.phone),
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
  const sender = meta ? parseContact(meta.sender) : parseContact(record.meta);
  const messages = Array.isArray(record.messages) ? record.messages : [];
  const lastMsg = messages.length > 0 ? asRecord(messages[messages.length - 1]) : null;
  const unread =
    asNumber(record.unread_count) ??
    asNumber(record.agent_last_seen_at) ??
    0;
  return {
    id,
    inboxId: asString(record.inbox_id),
    status: (asString(record.status) ?? "open").toLowerCase(),
    channelType:
      asString(record.channel) ??
      asString(asRecord(record.meta)?.channel) ??
      null,
    contact: sender,
    lastActivityAt:
      unixOrIsoToIso(record.last_activity_at) ??
      unixOrIsoToIso(record.timestamp) ??
      unixOrIsoToIso(lastMsg?.created_at) ??
      null,
    unreadCount: Math.max(0, unread),
    lastMessagePreview: asString(lastMsg?.content) ?? asString(record.last_non_activity_message),
  };
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
    input: { content: string; private?: boolean },
  ): Promise<ChatwootMessageSummary> {
    const payload = await this.requestJson<unknown>(
      "POST",
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        content: input.content,
        message_type: "outgoing",
        private: Boolean(input.private),
      },
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
}

export {
  parseConversation as parseChatwootConversationPayload,
  parseMessage as parseChatwootMessagePayload,
  mapMessageType as mapChatwootMessageType,
  asRecord as chatwootAsRecord,
  asString as chatwootAsString,
  unixOrIsoToIso as chatwootUnixOrIsoToIso,
};
