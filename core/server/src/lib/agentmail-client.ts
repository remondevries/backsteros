/**
 * Thin AgentMail REST client (API v0).
 * @see https://docs.agentmail.to/api-reference
 */

const AGENTMAIL_API_BASE = "https://api.agentmail.to/v0";

export type AgentMailAuthMe = {
  scopeType: string;
  scopeId: string;
  organizationId: string;
  podId: string | null;
  inboxId: string | null;
  apiKeyId: string | null;
};

export type AgentMailInbox = {
  inboxId: string;
  email: string;
  displayName: string | null;
  podId: string | null;
};

export class AgentMailApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, message?: string) {
    super(message ?? formatAgentMailApiError(status, body));
    this.name = "AgentMailApiError";
    this.status = status;
    this.body = body;
  }
}

export function formatAgentMailApiError(status: number, body: string): string {
  const trimmedBody = body.trim();
  if (!trimmedBody) return `AgentMail API error (${status})`;
  try {
    const parsed = JSON.parse(trimmedBody) as Record<string, unknown>;
    let detail: string | null = null;
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      detail = parsed.message.trim();
    } else if (typeof parsed.error === "string" && parsed.error.trim()) {
      detail = parsed.error.trim();
    } else if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      detail = parsed.detail.trim();
    }
    if (detail) return `AgentMail: ${detail}`;
  } catch {
    if (trimmedBody.length <= 400) return `AgentMail: ${trimmedBody}`;
  }
  return `AgentMail API error (${status})`;
}

function asOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function asRequiredString(value: unknown, field: string): string {
  const parsed = asOptionalString(value);
  if (!parsed) {
    throw new Error(`AgentMail response missing ${field}`);
  }
  return parsed;
}

export function mapAgentMailAuthMe(raw: Record<string, unknown>): AgentMailAuthMe {
  return {
    scopeType: asRequiredString(raw.scope_type, "scope_type"),
    scopeId: asRequiredString(raw.scope_id, "scope_id"),
    organizationId: asRequiredString(raw.organization_id, "organization_id"),
    podId: asOptionalString(raw.pod_id),
    inboxId: asOptionalString(raw.inbox_id),
    apiKeyId: asOptionalString(raw.api_key_id),
  };
}

export function mapAgentMailInbox(raw: Record<string, unknown>): AgentMailInbox {
  return {
    inboxId: asRequiredString(raw.inbox_id, "inbox_id"),
    email: asRequiredString(raw.email, "email"),
    displayName: asOptionalString(raw.display_name),
    podId: asOptionalString(raw.pod_id),
  };
}

export type AgentMailMessageSummary = {
  inboxId: string;
  threadId: string;
  messageId: string;
  subject: string;
  from: string;
  preview: string | null;
  timestamp: string;
};

export type AgentMailMessageDetail = AgentMailMessageSummary & {
  text: string | null;
  html: string | null;
  extractedText: string | null;
  extractedHtml: string | null;
  to: string[];
  labels: string[];
  inReplyTo: string | null;
};

export type AgentMailThread = {
  inboxId: string;
  threadId: string;
  subject: string;
  messages: AgentMailMessageDetail[];
};

export type AgentMailDraftSummary = {
  inboxId: string;
  draftId: string;
  subject: string | null;
  preview: string | null;
  text: string | null;
  inReplyTo: string | null;
  clientId: string | null;
  updatedAt: string;
  createdAt: string;
};

export type AgentMailDraftDetail = AgentMailDraftSummary & {
  html: string | null;
  to: string[];
};

export function formatAgentMailAddress(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map(formatAgentMailAddress).filter(Boolean).join(", ");
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const email =
      asOptionalString(rec.email) ?? asOptionalString(rec.address);
    const name =
      asOptionalString(rec.name) ?? asOptionalString(rec.display_name);
    if (name && email) return `${name} <${email}>`;
    return email ?? name ?? "";
  }
  return "";
}

function asTimestamp(value: unknown, fallback?: unknown): string {
  for (const candidate of [value, fallback]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return new Date(candidate).toISOString();
    }
  }
  throw new Error("AgentMail response missing timestamp");
}

export function mapAgentMailMessageSummary(
  raw: Record<string, unknown>,
): AgentMailMessageSummary {
  return {
    inboxId: asRequiredString(raw.inbox_id, "inbox_id"),
    threadId: asOptionalString(raw.thread_id) ?? "",
    messageId: asRequiredString(raw.message_id, "message_id"),
    subject: asOptionalString(raw.subject) ?? "",
    from: formatAgentMailAddress(raw.from),
    preview: asOptionalString(raw.preview),
    timestamp: asTimestamp(raw.timestamp, raw.created_at),
  };
}

export function mapAgentMailMessageDetail(
  raw: Record<string, unknown>,
): AgentMailMessageDetail {
  return {
    ...mapAgentMailMessageSummary(raw),
    text: asOptionalString(raw.text),
    html: asOptionalString(raw.html),
    extractedText: asOptionalString(raw.extracted_text),
    extractedHtml: asOptionalString(raw.extracted_html),
    to: mapAddressList(raw.to),
    labels: Array.isArray(raw.labels)
      ? raw.labels.filter((label): label is string => typeof label === "string")
      : [],
    inReplyTo: asOptionalString(raw.in_reply_to),
  };
}

function mapAddressList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => formatAgentMailAddress(entry))
    .filter(Boolean);
}

export function mapAgentMailDraftSummary(
  raw: Record<string, unknown>,
): AgentMailDraftSummary {
  return {
    inboxId: asRequiredString(raw.inbox_id, "inbox_id"),
    draftId: asRequiredString(raw.draft_id, "draft_id"),
    subject: asOptionalString(raw.subject),
    preview: asOptionalString(raw.preview),
    text: asOptionalString(raw.text),
    inReplyTo: asOptionalString(raw.in_reply_to),
    clientId: asOptionalString(raw.client_id),
    updatedAt: asTimestamp(raw.updated_at, raw.created_at),
    createdAt: asTimestamp(raw.created_at, raw.updated_at),
  };
}

export function mapAgentMailDraftDetail(
  raw: Record<string, unknown>,
): AgentMailDraftDetail {
  return {
    ...mapAgentMailDraftSummary(raw),
    html: asOptionalString(raw.html),
    to: mapAddressList(raw.to),
  };
}

export type AgentMailClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
};

const DEFAULT_AGENTMAIL_REQUEST_TIMEOUT_MS = 15_000;

export class AgentMailClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(options: AgentMailClientOptions) {
    this.apiKey = options.apiKey.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_AGENTMAIL_REQUEST_TIMEOUT_MS;
  }

  private requestAbortSignal(init?: RequestInit): AbortSignal | undefined {
    if (init?.signal) return init.signal;
    if (typeof AbortSignal === "undefined" || !("timeout" in AbortSignal)) {
      return undefined;
    }
    return (AbortSignal as typeof AbortSignal & {
      timeout: (ms: number) => AbortSignal;
    }).timeout(this.requestTimeoutMs);
  }

  private async requestVoid(path: string, init?: RequestInit): Promise<void> {
    const url = `${AGENTMAIL_API_BASE}${path}`;
    const response = await this.fetchImpl(url, {
      ...init,
      signal: this.requestAbortSignal(init),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new AgentMailApiError(response.status, body);
    }
  }

  private async requestJson<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const url = `${AGENTMAIL_API_BASE}${path}`;
    const response = await this.fetchImpl(url, {
      ...init,
      signal: this.requestAbortSignal(init),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });
    const body = await response.text();
    if (!response.ok) {
      throw new AgentMailApiError(response.status, body);
    }
    if (!body.trim()) {
      return {} as T;
    }
    return JSON.parse(body) as T;
  }

  async authMe(): Promise<AgentMailAuthMe> {
    const raw = await this.requestJson<Record<string, unknown>>("/auth/me");
    return mapAgentMailAuthMe(raw);
  }

  async listInboxes(options?: {
    limit?: number;
    pageToken?: string;
  }): Promise<AgentMailInbox[]> {
    const params = new URLSearchParams();
    if (options?.limit != null) {
      params.set("limit", String(options.limit));
    }
    if (options?.pageToken) {
      params.set("page_token", options.pageToken);
    }
    const query = params.toString();
    const raw = await this.requestJson<Record<string, unknown>>(
      `/inboxes${query ? `?${query}` : ""}`,
    );
    const rows = Array.isArray(raw.inboxes) ? raw.inboxes : [];
    return rows
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
      .map((row) => mapAgentMailInbox(row));
  }

  async listMessages(
    inboxId: string,
    options?: { limit?: number; pageToken?: string },
  ): Promise<AgentMailMessageSummary[]> {
    const params = new URLSearchParams();
    if (options?.limit != null) {
      params.set("limit", String(options.limit));
    }
    if (options?.pageToken) {
      params.set("page_token", options.pageToken);
    }
    const query = params.toString();
    const encodedInboxId = encodeURIComponent(inboxId);
    const raw = await this.requestJson<Record<string, unknown>>(
      `/inboxes/${encodedInboxId}/messages${query ? `?${query}` : ""}`,
    );
    const rows = Array.isArray(raw.messages) ? raw.messages : [];
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return [];
      try {
        return [
          mapAgentMailMessageSummary({
            ...(row as Record<string, unknown>),
            inbox_id:
              (row as Record<string, unknown>).inbox_id ?? inboxId,
          }),
        ];
      } catch {
        return [];
      }
    });
  }

  async getMessage(
    inboxId: string,
    messageId: string,
  ): Promise<AgentMailMessageDetail> {
    const raw = await this.requestJson<Record<string, unknown>>(
      `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
    );
    return mapAgentMailMessageDetail(raw);
  }

  async getThread(
    inboxId: string,
    threadId: string,
  ): Promise<AgentMailThread> {
    const raw = await this.requestJson<Record<string, unknown>>(
      `/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadId)}`,
    );
    const rows = Array.isArray(raw.messages) ? raw.messages : [];
    const messages = rows.flatMap((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return [];
      try {
        return [
          mapAgentMailMessageDetail({
            ...(row as Record<string, unknown>),
            inbox_id:
              (row as Record<string, unknown>).inbox_id ?? inboxId,
            thread_id:
              (row as Record<string, unknown>).thread_id ?? threadId,
          }),
        ];
      } catch {
        return [];
      }
    });
    return {
      inboxId: asRequiredString(raw.inbox_id ?? inboxId, "inbox_id"),
      threadId: asRequiredString(raw.thread_id ?? threadId, "thread_id"),
      subject: asOptionalString(raw.subject) ?? messages[0]?.subject ?? "",
      messages,
    };
  }

  async listDrafts(
    inboxId: string,
    options?: { limit?: number; pageToken?: string },
  ): Promise<AgentMailDraftSummary[]> {
    const params = new URLSearchParams();
    if (options?.limit != null) {
      params.set("limit", String(options.limit));
    }
    if (options?.pageToken) {
      params.set("page_token", options.pageToken);
    }
    const query = params.toString();
    const raw = await this.requestJson<Record<string, unknown>>(
      `/inboxes/${encodeURIComponent(inboxId)}/drafts${query ? `?${query}` : ""}`,
    );
    const rows = Array.isArray(raw.drafts) ? raw.drafts : [];
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return [];
      try {
        return [
          mapAgentMailDraftSummary({
            ...(row as Record<string, unknown>),
            inbox_id:
              (row as Record<string, unknown>).inbox_id ?? inboxId,
          }),
        ];
      } catch {
        return [];
      }
    });
  }

  async getDraft(
    inboxId: string,
    draftId: string,
  ): Promise<AgentMailDraftDetail> {
    const raw = await this.requestJson<Record<string, unknown>>(
      `/inboxes/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(draftId)}`,
    );
    return mapAgentMailDraftDetail(raw);
  }

  async createDraft(
    inboxId: string,
    body: Record<string, unknown>,
  ): Promise<AgentMailDraftDetail> {
    const raw = await this.requestJson<Record<string, unknown>>(
      `/inboxes/${encodeURIComponent(inboxId)}/drafts`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return mapAgentMailDraftDetail(raw);
  }

  async updateDraft(
    inboxId: string,
    draftId: string,
    body: Record<string, unknown>,
  ): Promise<AgentMailDraftDetail> {
    const raw = await this.requestJson<Record<string, unknown>>(
      `/inboxes/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(draftId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    return mapAgentMailDraftDetail(raw);
  }

  async sendDraft(
    inboxId: string,
    draftId: string,
    body: Record<string, unknown> = {},
  ): Promise<AgentMailMessageDetail> {
    const raw = await this.requestJson<Record<string, unknown>>(
      `/inboxes/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(draftId)}/send`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return mapAgentMailMessageDetail(raw);
  }

  async deleteDraft(inboxId: string, draftId: string): Promise<void> {
    await this.requestVoid(
      `/inboxes/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(draftId)}`,
      { method: "DELETE" },
    );
  }

  async deleteMessage(inboxId: string, messageId: string): Promise<void> {
    await this.requestVoid(
      `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
      { method: "DELETE" },
    );
  }

  async deleteThread(inboxId: string, threadId: string): Promise<void> {
    await this.requestVoid(
      `/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadId)}`,
      { method: "DELETE" },
    );
  }

  async updateMessageLabels(
    inboxId: string,
    messageId: string,
    input: { addLabels?: string[]; removeLabels?: string[] },
  ): Promise<void> {
    await this.requestJson(
      `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...(input.addLabels?.length ? { add_labels: input.addLabels } : {}),
          ...(input.removeLabels?.length
            ? { remove_labels: input.removeLabels }
            : {}),
        }),
      },
    );
  }

  async updateThreadLabels(
    inboxId: string,
    threadId: string,
    input: { addLabels?: string[]; removeLabels?: string[] },
  ): Promise<void> {
    await this.requestJson(
      `/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...(input.addLabels?.length ? { add_labels: input.addLabels } : {}),
          ...(input.removeLabels?.length
            ? { remove_labels: input.removeLabels }
            : {}),
        }),
      },
    );
  }

  async createListEntry(
    inboxId: string,
    direction: "send" | "receive" | "reply",
    type: "allow" | "block",
    input: { entry: string; reason?: string },
  ): Promise<void> {
    await this.requestJson(
      `/inboxes/${encodeURIComponent(inboxId)}/lists/${encodeURIComponent(direction)}/${encodeURIComponent(type)}`,
      {
        method: "POST",
        body: JSON.stringify({
          entry: input.entry,
          ...(input.reason ? { reason: input.reason } : {}),
        }),
      },
    );
  }

  async createWebhook(input: {
    url: string;
    eventTypes: string[];
    inboxIds?: string[];
    clientId?: string;
  }): Promise<AgentMailWebhook> {
    const raw = await this.requestJson<Record<string, unknown>>("/webhooks", {
      method: "POST",
      body: JSON.stringify({
        url: input.url,
        event_types: input.eventTypes,
        ...(input.inboxIds ? { inbox_ids: input.inboxIds } : {}),
        ...(input.clientId ? { client_id: input.clientId } : {}),
      }),
    });
    return mapAgentMailWebhook(raw);
  }

  async listWebhooks(): Promise<AgentMailWebhook[]> {
    const raw = await this.requestJson<Record<string, unknown>>("/webhooks");
    const rows = Array.isArray(raw.webhooks) ? raw.webhooks : [];
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return [];
      try {
        return [mapAgentMailWebhook(row as Record<string, unknown>)];
      } catch {
        return [];
      }
    });
  }

  async getWebhook(webhookId: string): Promise<AgentMailWebhook> {
    const raw = await this.requestJson<Record<string, unknown>>(
      `/webhooks/${encodeURIComponent(webhookId)}`,
    );
    return mapAgentMailWebhook(raw);
  }

  async updateWebhook(
    webhookId: string,
    input: {
      addInboxIds?: string[];
      removeInboxIds?: string[];
      eventTypes?: string[];
    },
  ): Promise<AgentMailWebhook> {
    const raw = await this.requestJson<Record<string, unknown>>(
      `/webhooks/${encodeURIComponent(webhookId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...(input.addInboxIds ? { add_inbox_ids: input.addInboxIds } : {}),
          ...(input.removeInboxIds
            ? { remove_inbox_ids: input.removeInboxIds }
            : {}),
          ...(input.eventTypes ? { event_types: input.eventTypes } : {}),
        }),
      },
    );
    return mapAgentMailWebhook(raw);
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.requestVoid(`/webhooks/${encodeURIComponent(webhookId)}`, {
      method: "DELETE",
    });
  }
}

export type AgentMailWebhook = {
  webhookId: string;
  url: string;
  secret: string;
  enabled: boolean;
  eventTypes: string[];
  inboxIds: string[];
};

export function mapAgentMailWebhook(
  raw: Record<string, unknown>,
): AgentMailWebhook {
  const eventTypes = Array.isArray(raw.event_types)
    ? raw.event_types.filter((value): value is string => typeof value === "string")
    : Array.isArray(raw.eventTypes)
      ? raw.eventTypes.filter((value): value is string => typeof value === "string")
      : [];
  const inboxIds = Array.isArray(raw.inbox_ids)
    ? raw.inbox_ids.filter((value): value is string => typeof value === "string")
    : Array.isArray(raw.inboxIds)
      ? raw.inboxIds.filter((value): value is string => typeof value === "string")
      : [];
  return {
    webhookId: asRequiredString(raw.webhook_id ?? raw.webhookId, "webhook_id"),
    url: asRequiredString(raw.url, "url"),
    secret: asRequiredString(raw.secret, "secret"),
    enabled: Boolean(raw.enabled),
    eventTypes,
    inboxIds,
  };
}
