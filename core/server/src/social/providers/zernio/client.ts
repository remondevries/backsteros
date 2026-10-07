/**
 * Thin Zernio REST client (server-only). Bearer API key from workspace secrets.
 * @see https://zernio.com/openapi.json
 */

import { enqueueZernioRequest } from "./request-gate.js";

const ZERNIO_API_BASE = "https://zernio.com/api";

export class ZernioApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly code: string | null;

  constructor(
    status: number,
    body: string,
    message?: string,
    code?: string | null,
  ) {
    super(message ?? `Zernio API error (${status})`);
    this.name = "ZernioApiError";
    this.status = status;
    this.body = body;
    this.code = code ?? null;
  }
}

export type ZernioClientOptions = {
  apiKey: string;
  /** Workspace key for in-process rate gating. */
  rateKey?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ZernioClient {
  private readonly apiKey: string;
  private readonly rateKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;

  constructor(options: ZernioClientOptions) {
    this.apiKey = options.apiKey.trim();
    this.rateKey = options.rateKey?.trim() || "default";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 4;
  }

  async verify(): Promise<{ ok: boolean; userId: string | null }> {
    const payload = await this.requestJson<{
      user?: { _id?: string; id?: string };
      _id?: string;
      id?: string;
    }>("/v1/auth/verify");
    const userId =
      asString(payload?.user?._id) ??
      asString(payload?.user?.id) ??
      asString(payload?._id) ??
      asString(payload?.id);
    return { ok: true, userId };
  }

  async listProfiles(): Promise<
    Array<{ id: string; name: string; timezone: string | null }>
  > {
    const payload = await this.requestJson<unknown>("/v1/profiles");
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(asRecord(payload)?.profiles)
        ? (asRecord(payload)!.profiles as unknown[])
        : Array.isArray(asRecord(payload)?.data)
          ? (asRecord(payload)!.data as unknown[])
          : [];
    return rows
      .map((row) => {
        const r = asRecord(row);
        if (!r) return null;
        const id = asString(r._id) ?? asString(r.id);
        const name = asString(r.name) ?? "";
        if (!id) return null;
        return {
          id,
          name,
          timezone: asString(r.timezone),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }

  async createProfile(input: {
    name: string;
    timezone?: string;
  }): Promise<{ id: string; name: string }> {
    const payload = await this.requestJson<Record<string, unknown>>(
      "/v1/profiles",
      {
        method: "POST",
        body: {
          name: input.name,
          ...(input.timezone ? { timezone: input.timezone } : {}),
        },
      },
    );
    const id = asString(payload._id) ?? asString(payload.id);
    if (!id) throw new ZernioApiError(500, "", "Zernio create profile missing id");
    return { id, name: asString(payload.name) ?? input.name };
  }

  async listAccounts(options?: {
    profileId?: string;
  }): Promise<ZernioAccountRaw[]> {
    const params = new URLSearchParams();
    if (options?.profileId) params.set("profileId", options.profileId);
    const qs = params.toString();
    const payload = await this.requestJson<unknown>(
      `/v1/accounts${qs ? `?${qs}` : ""}`,
    );
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(asRecord(payload)?.accounts)
        ? (asRecord(payload)!.accounts as unknown[])
        : Array.isArray(asRecord(payload)?.data)
          ? (asRecord(payload)!.data as unknown[])
          : [];
    return rows
      .map((row) => parseAccount(row))
      .filter((row): row is ZernioAccountRaw => row != null);
  }

  async disconnectAccount(accountId: string): Promise<void> {
    await this.requestVoid(`/v1/accounts/${encodeURIComponent(accountId)}`, {
      method: "DELETE",
    });
  }

  async getConnectUrl(input: {
    platform: string;
    profileId: string;
    headless?: boolean;
    redirectUrl?: string;
    reconnectAccountId?: string;
  }): Promise<{ url: string }> {
    const params = new URLSearchParams({
      profileId: input.profileId,
    });
    if (input.headless !== false) params.set("headless", "true");
    if (input.redirectUrl) params.set("redirect_url", input.redirectUrl);
    if (input.reconnectAccountId) {
      params.set("reconnectAccountId", input.reconnectAccountId);
    }
    const payload = await this.requestJson<Record<string, unknown>>(
      `/v1/connect/${encodeURIComponent(input.platform)}?${params}`,
    );
    const url =
      asString(payload.url) ??
      asString(payload.authUrl) ??
      asString(payload.connectUrl);
    if (!url) {
      throw new ZernioApiError(500, JSON.stringify(payload), "Connect URL missing");
    }
    return { url };
  }

  async createPost(body: Record<string, unknown>): Promise<unknown> {
    return this.requestJson("/v1/posts", { method: "POST", body });
  }

  async editPublishedPost(
    postId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.requestJson(`/v1/posts/${encodeURIComponent(postId)}/edit`, {
      method: "POST",
      body,
    });
  }

  async unpublishPost(
    postId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await this.requestVoid(`/v1/posts/${encodeURIComponent(postId)}/unpublish`, {
      method: "POST",
      body,
    });
  }

  async deletePost(postId: string): Promise<void> {
    await this.requestVoid(`/v1/posts/${encodeURIComponent(postId)}`, {
      method: "DELETE",
    });
  }

  async listComments(
    postId: string,
    options?: { accountId?: string; cursor?: string; limit?: number },
  ): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.accountId) params.set("accountId", options.accountId);
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.limit != null) params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.requestJson(
      `/v1/inbox/comments/${encodeURIComponent(postId)}${qs ? `?${qs}` : ""}`,
    );
  }

  async replyToComment(
    postId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.requestJson(
      `/v1/inbox/comments/${encodeURIComponent(postId)}`,
      { method: "POST", body },
    );
  }

  async hideComment(
    postId: string,
    commentId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await this.requestVoid(
      `/v1/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/hide`,
      { method: "POST", body },
    );
  }

  async deleteComment(
    postId: string,
    options: { accountId: string; commentId: string },
  ): Promise<void> {
    const params = new URLSearchParams({
      accountId: options.accountId,
      commentId: options.commentId,
    });
    await this.requestVoid(
      `/v1/inbox/comments/${encodeURIComponent(postId)}?${params}`,
      { method: "DELETE" },
    );
  }

  async listConversations(options?: {
    profileId?: string;
    accountId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.profileId) params.set("profileId", options.profileId);
    if (options?.accountId) params.set("accountId", options.accountId);
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.limit != null) params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.requestJson(`/v1/inbox/conversations${qs ? `?${qs}` : ""}`);
  }

  async listMessages(
    conversationId: string,
    options?: { accountId?: string; cursor?: string; limit?: number },
  ): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.accountId) params.set("accountId", options.accountId);
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.limit != null) params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.requestJson(
      `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages${qs ? `?${qs}` : ""}`,
    );
  }

  async sendMessage(
    conversationId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.requestJson(
      `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: "POST", body },
    );
  }

  async getAnalytics(
    query: Record<string, string>,
  ): Promise<unknown> {
    const params = new URLSearchParams(query);
    return this.requestJson(`/v1/analytics?${params}`, { analytics: true });
  }

  async getAnalyticsDelta(query: Record<string, string>): Promise<unknown> {
    const params = new URLSearchParams(query);
    return this.requestJson(`/v1/analytics/delta?${params}`, {
      analytics: true,
    });
  }

  async getDailyMetrics(query: Record<string, string>): Promise<unknown> {
    const params = new URLSearchParams(query);
    return this.requestJson(`/v1/analytics/daily-metrics?${params}`, {
      analytics: true,
    });
  }

  async getFollowerStats(query: Record<string, string>): Promise<unknown> {
    const params = new URLSearchParams(query);
    return this.requestJson(`/v1/accounts/follower-stats?${params}`, {
      analytics: true,
    });
  }

  async listWebhooks(): Promise<ZernioWebhookRaw[]> {
    const payload = await this.requestJson<unknown>("/v1/webhooks/settings");
    const rows = Array.isArray(asRecord(payload)?.webhooks)
      ? (asRecord(payload)!.webhooks as unknown[])
      : Array.isArray(payload)
        ? payload
        : [];
    return rows
      .map((row) => {
        const r = asRecord(row);
        if (!r) return null;
        const id = asString(r._id) ?? asString(r.id) ?? asString(r.webhookId);
        const url = asString(r.url);
        if (!id || !url) return null;
        return {
          id,
          url,
          name: asString(r.name),
          isActive: r.isActive !== false,
          events: Array.isArray(r.events)
            ? r.events.filter((e): e is string => typeof e === "string")
            : [],
        };
      })
      .filter((row): row is ZernioWebhookRaw => row != null);
  }

  async createWebhook(body: {
    name: string;
    url: string;
    secret: string;
    events: string[];
  }): Promise<ZernioWebhookRaw> {
    const payload = await this.requestJson<Record<string, unknown>>(
      "/v1/webhooks/settings",
      { method: "POST", body },
    );
    const id =
      asString(payload._id) ??
      asString(payload.id) ??
      asString(payload.webhookId);
    if (!id) {
      throw new ZernioApiError(500, JSON.stringify(payload), "Webhook id missing");
    }
    return {
      id,
      url: asString(payload.url) ?? body.url,
      name: asString(payload.name) ?? body.name,
      isActive: payload.isActive !== false,
      events: body.events,
    };
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    const params = new URLSearchParams({ webhookId });
    await this.requestVoid(`/v1/webhooks/settings?${params}`, {
      method: "DELETE",
    });
  }

  private async requestJson<T>(
    path: string,
    options?: {
      method?: string;
      body?: unknown;
      analytics?: boolean;
    },
  ): Promise<T> {
    const text = await this.requestText(path, options);
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ZernioApiError(500, text, "Invalid Zernio JSON");
    }
  }

  private async requestVoid(
    path: string,
    options?: { method?: string; body?: unknown; analytics?: boolean },
  ): Promise<void> {
    await this.requestText(path, options);
  }

  private async requestText(
    path: string,
    options?: {
      method?: string;
      body?: unknown;
      analytics?: boolean;
    },
  ): Promise<string> {
    return enqueueZernioRequest(
      this.rateKey,
      () => this.requestTextOnce(path, options),
      { analytics: options?.analytics },
    );
  }

  private async requestTextOnce(
    path: string,
    options?: {
      method?: string;
      body?: unknown;
    },
  ): Promise<string> {
    let attempt = 0;
    for (;;) {
      const response = await this.fetchImpl(`${ZERNIO_API_BASE}${path}`, {
        method: options?.method ?? "GET",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          accept: "application/json",
          ...(options?.body != null
            ? { "content-type": "application/json" }
            : {}),
        },
        body:
          options?.body != null ? JSON.stringify(options.body) : undefined,
      });
      const text = await response.text();

      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const backoffMs = Number.isFinite(retryAfter)
          ? Math.min(30_000, Math.max(250, retryAfter * 1000))
          : Math.min(30_000, 500 * 2 ** attempt);
        attempt += 1;
        await sleep(backoffMs);
        continue;
      }

      if (!response.ok) {
        const code = extractErrorCode(text);
        const message = messageForStatus(response.status, text, code);
        throw new ZernioApiError(response.status, text, message, code);
      }
      return text;
    }
  }
}

export type ZernioAccountRaw = {
  id: string;
  profileId: string | null;
  platform: string;
  accountType: string | null;
  username: string | null;
  displayName: string | null;
  status: string | null;
  url: string | null;
};

export type ZernioWebhookRaw = {
  id: string;
  url: string;
  name: string | null;
  isActive: boolean;
  events: string[];
};

function parseAccount(row: unknown): ZernioAccountRaw | null {
  const r = asRecord(row);
  if (!r) return null;
  const id = asString(r._id) ?? asString(r.id);
  const platform = asString(r.platform);
  if (!id || !platform) return null;
  return {
    id,
    profileId: asString(r.profileId) ?? asString(r.profile_id),
    platform,
    accountType:
      asString(r.accountType) ??
      asString(r.account_type) ??
      asString(r.type),
    username: asString(r.username) ?? asString(r.handle),
    displayName: asString(r.displayName) ?? asString(r.display_name) ?? asString(r.name),
    status: asString(r.status),
    url: asString(r.url) ?? asString(r.profileUrl) ?? asString(r.profile_url),
  };
}

function extractErrorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return (
      asString(parsed.code) ??
      asString(parsed.errorCode) ??
      asString(asRecord(parsed.error)?.code)
    );
  } catch {
    return null;
  }
}

function messageForStatus(
  status: number,
  body: string,
  code: string | null,
): string {
  const lower = body.toLowerCase();
  if (status === 412) {
    return "Zernio reports a missing OAuth scope — reconnect the account.";
  }
  if (status === 402 || status === 403) {
    if (lower.includes("analytics") && lower.includes("add-on")) {
      return "Zernio analytics access denied (legacy add-on wording or plan).";
    }
    if (status === 402) return "Zernio payment required.";
    return "Zernio forbidden.";
  }
  if (status === 401) return "Zernio rejected the API key (unauthorized).";
  if (status === 429) return "Zernio rate limit exceeded.";
  if (code) return `Zernio API error (${status}: ${code})`;
  return `Zernio API error (${status})`;
}
