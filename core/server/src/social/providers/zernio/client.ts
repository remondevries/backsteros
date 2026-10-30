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

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
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

  /**
   * Live platform posts for a connected account (incl. posts not created via Zernio).
   * LinkedIn personal profiles typically return [] — LinkedIn does not grant
   * `r_member_social`, so only org pages (and posts published via Zernio) work.
   * @see https://docs.zernio.com/accounts/get-account-posts
   */
  async listAccountPosts(accountId: string): Promise<ZernioPlatformPostRaw[]> {
    const payload = await this.requestJson<unknown>(
      `/v1/accounts/${encodeURIComponent(accountId)}/posts`,
    );
    const record = asRecord(payload);
    const rows = Array.isArray(record?.posts)
      ? (record!.posts as unknown[])
      : Array.isArray(payload)
        ? payload
        : [];
    return rows
      .map((row) => parsePlatformPost(row))
      .filter((row): row is ZernioPlatformPostRaw => row != null);
  }

  /**
   * Posts authored through Zernio for an account (not the live platform listing).
   * Used to fill the Network inbox when LinkedIn refuses historical member posts.
   * @see https://docs.zernio.com/posts/list-posts
   */
  async listZernioPosts(input: {
    accountId: string;
    status?: string;
    limit?: number;
  }): Promise<ZernioAuthoredPostRaw[]> {
    const params = new URLSearchParams({
      accountId: input.accountId,
      source: "zernio",
      limit: String(input.limit ?? 25),
    });
    if (input.status) params.set("status", input.status);
    const payload = await this.requestJson<unknown>(`/v1/posts?${params}`);
    const record = asRecord(payload);
    const rows = Array.isArray(record?.posts)
      ? (record!.posts as unknown[])
      : Array.isArray(payload)
        ? payload
        : [];
    return rows
      .map((row) => parseAuthoredPost(row, input.accountId))
      .filter((row): row is ZernioAuthoredPostRaw => row != null);
  }

  async createPost(body: Record<string, unknown>): Promise<unknown> {
    return this.requestJson("/v1/posts", { method: "POST", body });
  }

  /** Update draft/scheduled/failed/cancelled posts (incl. `scheduledFor`). */
  async updatePost(
    postId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.requestJson(`/v1/posts/${encodeURIComponent(postId)}`, {
      method: "PUT",
      body,
    });
  }

  /**
   * Presign a direct-to-storage upload; use `publicUrl` in post mediaItems.
   * @see https://docs.zernio.com/media/presign
   */
  async presignMedia(input: {
    filename: string;
    contentType: string;
    size?: number;
  }): Promise<{ uploadUrl: string; publicUrl: string }> {
    const payload = await this.requestJson<Record<string, unknown>>(
      "/v1/media/presign",
      {
        method: "POST",
        body: {
          filename: input.filename,
          contentType: input.contentType,
          ...(input.size != null ? { size: input.size } : {}),
        },
      },
    );
    const uploadUrl =
      asString(payload.uploadUrl) ?? asString(payload.upload_url);
    const publicUrl =
      asString(payload.publicUrl) ?? asString(payload.public_url);
    if (!uploadUrl || !publicUrl) {
      throw new ZernioApiError(
        502,
        JSON.stringify(payload),
        "Zernio media presign did not return uploadUrl/publicUrl",
      );
    }
    return { uploadUrl, publicUrl };
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

  /** React to a post as `accountId` (`POST /v1/inbox/posts/{postId}/like`). */
  async likePost(
    postId: string,
    body: { accountId: string; reactionType?: string },
  ): Promise<unknown> {
    return this.requestJson(
      `/v1/inbox/posts/${encodeURIComponent(postId)}/like`,
      { method: "POST", body },
    );
  }

  /** Remove a reaction (`DELETE /v1/inbox/posts/{postId}/like?accountId=`). */
  async unlikePost(postId: string, accountId: string): Promise<unknown> {
    const params = new URLSearchParams({ accountId });
    return this.requestJson(
      `/v1/inbox/posts/${encodeURIComponent(postId)}/like?${params}`,
      { method: "DELETE" },
    );
  }

  /** React to a comment (`POST /v1/inbox/comments/{postId}/{commentId}/like`). */
  async likeComment(
    postId: string,
    commentId: string,
    body: { accountId: string; reactionType?: string },
  ): Promise<unknown> {
    return this.requestJson(
      `/v1/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/like`,
      { method: "POST", body },
    );
  }

  /** Remove a comment reaction (`DELETE …/like?accountId=`). */
  async unlikeComment(
    postId: string,
    commentId: string,
    accountId: string,
  ): Promise<unknown> {
    const params = new URLSearchParams({ accountId });
    return this.requestJson(
      `/v1/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/like?${params}`,
      { method: "DELETE" },
    );
  }

  /**
   * Per-post LinkedIn stats (includes saves on personal accounts).
   * `GET /v1/accounts/{accountId}/linkedin-post-analytics?urn=`
   */
  async getLinkedInPostAnalytics(
    accountId: string,
    urn: string,
  ): Promise<ZernioLinkedInPostAnalyticsRaw> {
    const params = new URLSearchParams({ urn });
    const payload = await this.requestJson<unknown>(
      `/v1/accounts/${encodeURIComponent(accountId)}/linkedin-post-analytics?${params}`,
      { analytics: true },
    );
    return parseLinkedInPostAnalytics(payload);
  }

  /**
   * Individual reactors on an org post.
   * `GET /v1/accounts/{accountId}/linkedin-post-reactions?urn=`
   */
  async getLinkedInPostReactions(
    accountId: string,
    urn: string,
    options?: { limit?: number; cursor?: number },
  ): Promise<unknown> {
    const params = new URLSearchParams({ urn });
    if (options?.limit != null) params.set("limit", String(options.limit));
    if (options?.cursor != null) params.set("cursor", String(options.cursor));
    return this.requestJson(
      `/v1/accounts/${encodeURIComponent(accountId)}/linkedin-post-reactions?${params}`,
      { analytics: true },
    );
  }

  /**
   * Resolve a LinkedIn profile/company URL to mention markup.
   * `GET /v1/accounts/{accountId}/linkedin-mentions?url=`
   */
  async resolveLinkedInMention(
    accountId: string,
    url: string,
  ): Promise<unknown> {
    const params = new URLSearchParams({ url });
    return this.requestJson(
      `/v1/accounts/${encodeURIComponent(accountId)}/linkedin-mentions?${params}`,
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
  avatarUrl: string | null;
  bio: string | null;
  followersCount: number | null;
};

export type ZernioPlatformPostRaw = {
  id: string;
  platform: string | null;
  message: string;
  createdTime: string | null;
  permalink: string | null;
  picture: string | null;
  mediaType: string | null;
  commentCount: number | null;
  likeCount: number | null;
  reactionCount: number | null;
  shareCount: number | null;
  saveCount: number | null;
};

export type ZernioLinkedInPostAnalyticsRaw = {
  urn: string | null;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  sends: number;
  clicks: number;
  views: number;
};

/** Post created via Zernio (`GET /v1/posts`), not the live platform listing. */
export type ZernioAuthoredPostRaw = {
  id: string;
  /** LinkedIn share/UGC id when Zernio has published to the platform. */
  platformPostId: string | null;
  message: string;
  createdTime: string | null;
  permalink: string | null;
  picture: string | null;
  status: string | null;
};

export type ZernioWebhookRaw = {
  id: string;
  url: string;
  name: string | null;
  isActive: boolean;
  events: string[];
};

function parsePlatformPost(row: unknown): ZernioPlatformPostRaw | null {
  const r = asRecord(row);
  if (!r) return null;
  const id = asString(r.id) ?? asString(r._id) ?? asString(r.postId);
  if (!id) return null;
  return {
    id,
    platform: asString(r.platform),
    message:
      asString(r.message) ??
      asString(r.content) ??
      asString(r.text) ??
      asString(r.caption) ??
      "",
    createdTime:
      asString(r.createdTime) ??
      asString(r.created_time) ??
      asString(r.createdAt) ??
      asString(r.publishedAt),
    permalink:
      asString(r.permalink) ??
      asString(r.url) ??
      asString(r.platformPostUrl),
    picture:
      asString(r.picture) ??
      asString(r.thumbnail) ??
      asString(r.thumbnailUrl) ??
      asString(r.imageUrl),
    mediaType: asString(r.mediaType) ?? asString(r.media_type),
    commentCount: asNumber(r.commentCount) ?? asNumber(r.comment_count),
    likeCount: asNumber(r.likeCount) ?? asNumber(r.like_count),
    reactionCount: asNumber(r.reactionCount) ?? asNumber(r.reaction_count),
    shareCount: asNumber(r.shareCount) ?? asNumber(r.share_count),
    saveCount:
      asNumber(r.saveCount) ??
      asNumber(r.save_count) ??
      asNumber(r.saves),
  };
}

function parseLinkedInPostAnalytics(
  payload: unknown,
): ZernioLinkedInPostAnalyticsRaw {
  const r = asRecord(payload) ?? {};
  const analytics = asRecord(r.analytics) ?? r;
  return {
    urn: asString(r.postUrn) ?? asString(r.urn),
    impressions: asNumber(analytics.impressions) ?? 0,
    reach: asNumber(analytics.reach) ?? 0,
    likes: asNumber(analytics.likes) ?? 0,
    comments: asNumber(analytics.comments) ?? 0,
    shares: asNumber(analytics.shares) ?? 0,
    saves: asNumber(analytics.saves) ?? 0,
    sends: asNumber(analytics.sends) ?? 0,
    clicks: asNumber(analytics.clicks) ?? 0,
    views: asNumber(analytics.views) ?? 0,
  };
}

function platformEntryAccountId(entry: Record<string, unknown>): string | null {
  const direct = asString(entry.accountId);
  if (direct) return direct;
  const nested = asRecord(entry.accountId);
  return nested
    ? (asString(nested._id) ?? asString(nested.id))
    : null;
}

function parseAuthoredPost(
  row: unknown,
  accountId: string,
): ZernioAuthoredPostRaw | null {
  const r = asRecord(row);
  if (!r) return null;
  const id = asString(r.id) ?? asString(r._id) ?? asString(r.postId);
  if (!id) return null;
  const platforms = Array.isArray(r.platforms) ? r.platforms : [];
  const matched =
    platforms
      .map((entry) => asRecord(entry))
      .find((entry) => entry && platformEntryAccountId(entry) === accountId) ??
    platforms.map((entry) => asRecord(entry)).find((entry) => entry != null) ??
    null;
  const mediaItems = Array.isArray(r.mediaItems) ? r.mediaItems : [];
  const firstMedia = mediaItems
    .map((entry) => asRecord(entry))
    .find((entry) => entry != null);
  return {
    id,
    platformPostId:
      asString(matched?.platformPostId) ??
      asString(matched?.platform_post_id) ??
      asString(matched?.postId) ??
      null,
    message:
      asString(r.content) ??
      asString(r.message) ??
      asString(r.text) ??
      asString(r.title) ??
      "",
    createdTime:
      asString(r.publishedAt) ??
      asString(r.createdAt) ??
      asString(r.scheduledFor) ??
      asString(matched?.publishedAt),
    permalink:
      asString(matched?.platformPostUrl) ??
      asString(matched?.url) ??
      asString(r.platformPostUrl) ??
      asString(r.url),
    picture:
      asString(firstMedia?.url) ??
      asString(firstMedia?.thumbnailUrl) ??
      asString(r.thumbnailUrl),
    status: asString(r.status) ?? asString(matched?.status),
  };
}

function vanityFromLinkedInUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const match = new URL(url).pathname.match(
      /\/(?:in|company)\/([^/?#]+)/i,
    );
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]).replace(/\/+$/, "") || null;
  } catch {
    return null;
  }
}

function parseAccount(row: unknown): ZernioAccountRaw | null {
  const r = asRecord(row);
  if (!r) return null;
  const id = asString(r._id) ?? asString(r.id);
  const platform = asString(r.platform);
  if (!id || !platform) return null;
  const metadata = asRecord(r.metadata);
  const profileData = asRecord(metadata?.profileData);
  const extraData = asRecord(profileData?.extraData);
  const organizationInfo = asRecord(metadata?.organizationInfo);
  const url =
    asString(r.url) ??
    asString(r.profileUrl) ??
    asString(r.profile_url) ??
    asString(profileData?.profileUrl) ??
    (asString(organizationInfo?.vanityName)
      ? `https://www.linkedin.com/company/${asString(organizationInfo?.vanityName)}/`
      : null);
  const vanity =
    asString(extraData?.vanityName) ??
    asString(organizationInfo?.vanityName) ??
    vanityFromLinkedInUrl(url);
  return {
    id,
    profileId: asString(r.profileId) ?? asString(r.profile_id),
    platform,
    accountType:
      asString(r.accountType) ??
      asString(r.account_type) ??
      asString(r.type) ??
      asString(metadata?.accountType),
    // Prefer LinkedIn vanity slug for @handle; Zernio username is often the display name.
    username: vanity ?? asString(r.username) ?? asString(r.handle),
    displayName:
      asString(r.displayName) ??
      asString(r.display_name) ??
      asString(r.name) ??
      asString(organizationInfo?.name) ??
      asString(profileData?.displayName),
    status: asString(r.status),
    url,
    avatarUrl:
      asString(r.profilePicture) ??
      asString(r.profile_picture) ??
      asString(r.avatarUrl) ??
      asString(r.avatar_url) ??
      asString(r.imageUrl) ??
      asString(r.image_url) ??
      asString(organizationInfo?.logoUrl),
    bio:
      asString(profileData?.bio) ??
      asString(r.bio) ??
      asString(r.description) ??
      asString(r.about) ??
      asString(organizationInfo?.description) ??
      asString(organizationInfo?.about),
    followersCount:
      asNumber(r.followersCount) ??
      asNumber(r.followers_count) ??
      asNumber(profileData?.followersCount) ??
      asNumber(profileData?.followers_count),
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
    if (
      code === "linkedin_reconnect_required" ||
      lower.includes("linkedin_reconnect_required")
    ) {
      return "LinkedIn needs a reconnect for reactions — reconnect in Settings → Social.";
    }
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
