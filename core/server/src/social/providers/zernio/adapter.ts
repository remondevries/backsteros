import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import { newId } from "../../../lib/crypto.js";
import type { OwnedAccountAdapter } from "../../owned-account-adapter.js";
import type {
  PublishPostInput,
  SocialAccount,
  SocialAnalyticsPoint,
  SocialComment,
  SocialConversation,
  SocialFollowerStats,
  SocialMessage,
  SocialNormalizedEvent,
  SocialPage,
  SocialPost,
} from "../../types.js";
import { zernioCapabilities } from "./capabilities.js";
import {
  ZernioApiError,
  ZernioClient,
  type ZernioAccountRaw,
} from "./client.js";
import { mapZernioPlatform, toZernioConnectPlatform } from "./platform.js";
import { setZernioAccountCount } from "./request-gate.js";
import {
  translateZernioWebhook,
  verifyZernioWebhookSignature,
} from "./webhook.js";

const PROVIDER = "zernio";

export type ZernioOwnedAccountAdapterOptions = {
  workspaceId: string;
  apiKey: string;
  profileId: string | null;
  webhookSecret: string | null;
  client?: ZernioClient;
};

/**
 * First OwnedAccountAdapter provider. All Zernio HTTP and webhook parsing
 * stay inside this module tree.
 */
export class ZernioOwnedAccountAdapter implements OwnedAccountAdapter {
  readonly provider = PROVIDER;
  private readonly workspaceId: string;
  private readonly profileId: string | null;
  private readonly webhookSecret: string | null;
  private readonly client: ZernioClient;

  constructor(options: ZernioOwnedAccountAdapterOptions) {
    this.workspaceId = options.workspaceId;
    this.profileId = options.profileId;
    this.webhookSecret = options.webhookSecret;
    this.client =
      options.client ??
      new ZernioClient({
        apiKey: options.apiKey,
        rateKey: options.workspaceId,
      });
  }

  async listAccounts(): Promise<SocialAccount[]> {
    const raw = await this.client.listAccounts({
      profileId: this.profileId ?? undefined,
    });
    setZernioAccountCount(this.workspaceId, raw.length);
    const mapped = raw
      .map((row) => this.mapAccount(row))
      .filter((row): row is SocialAccount => row != null);

    await this.upsertAccounts(mapped);
    return mapped;
  }

  async publishPost(
    accountIds: string[],
    post: PublishPostInput,
  ): Promise<SocialPost[]> {
    return this.createPosts(accountIds, post, { publishNow: true });
  }

  async schedulePost(
    accountIds: string[],
    post: PublishPostInput,
    at: string,
  ): Promise<SocialPost[]> {
    return this.createPosts(accountIds, post, { scheduledFor: at });
  }

  async editPost(
    postId: string,
    patch: { text: string; accountId?: string },
  ): Promise<SocialPost> {
    const externalPostId = stripPrefix(postId, "zernio-post:");
    const account = patch.accountId
      ? await this.resolveAccount(patch.accountId)
      : null;
    const platform = account
      ? toZernioConnectPlatform(account.platform)
      : "twitter";
    await this.client.editPublishedPost(externalPostId, {
      platform,
      content: patch.text,
      ...(account ? { accountId: account.externalId } : {}),
    });
    return {
      id: `zernio-post:${externalPostId}`,
      workspaceId: this.workspaceId,
      accountId: account?.id ?? "",
      platform: account?.platform ?? "x",
      provider: PROVIDER,
      externalId: externalPostId,
      url: null,
      authorHandle: null,
      authorExternalId: null,
      text: patch.text,
      media: [],
      status: "published",
      scheduledAt: null,
      postedAt: null,
      engagement: null,
      contactId: null,
      organizationId: null,
    };
  }

  async deletePost(
    postId: string,
    options?: { accountId?: string },
  ): Promise<void> {
    const externalPostId = stripPrefix(postId, "zernio-post:");
    if (options?.accountId) {
      const account = await this.resolveAccount(options.accountId);
      if (!account.capabilities.deletePost) {
        throw new ZernioApiError(
          400,
          "",
          `deletePost is not supported for ${account.platform} via Zernio`,
        );
      }
      await this.client.unpublishPost(externalPostId, {
        platform: toZernioConnectPlatform(account.platform),
        accountId: account.externalId,
      });
      return;
    }
    await this.client.deletePost(externalPostId);
  }

  async listComments(
    postId: string,
    cursor?: string,
  ): Promise<SocialPage<SocialComment>> {
    const externalPostId = stripPrefix(postId, "zernio-post:");
    const payload = await this.client.listComments(externalPostId, {
      cursor,
      limit: 50,
    });
    const items = extractArray(payload, ["comments", "data", "items"]).map(
      (row) => this.mapCommentRow(row, externalPostId),
    );
    const nextCursor = extractCursor(payload);
    return {
      items: items.filter((c): c is SocialComment => c != null),
      nextCursor,
    };
  }

  async replyToComment(
    commentId: string,
    text: string,
  ): Promise<SocialComment> {
    const { postExternalId, commentExternalId, accountExternalId } =
      parseCommentRef(commentId);
    const payload = await this.client.replyToComment(postExternalId, {
      accountId: accountExternalId,
      message: text,
      commentId: commentExternalId,
    });
    const mapped = this.mapCommentRow(payload, postExternalId);
    if (!mapped) {
      return {
        id: `zernio-comment:${commentExternalId}:reply`,
        workspaceId: this.workspaceId,
        postId: `zernio-post:${postExternalId}`,
        accountId: `zernio-account:${accountExternalId}`,
        externalId: commentExternalId,
        authorHandle: "me",
        authorExternalId: null,
        text,
        createdAt: new Date().toISOString(),
        parentCommentId: commentExternalId,
        hidden: false,
        contactId: null,
      };
    }
    return mapped;
  }

  async hideComment(commentId: string): Promise<void> {
    const { postExternalId, commentExternalId, accountExternalId } =
      parseCommentRef(commentId);
    await this.client.hideComment(postExternalId, commentExternalId, {
      accountId: accountExternalId,
    });
  }

  async deleteComment(commentId: string): Promise<void> {
    const { postExternalId, commentExternalId, accountExternalId } =
      parseCommentRef(commentId);
    await this.client.deleteComment(postExternalId, {
      accountId: accountExternalId,
      commentId: commentExternalId,
    });
  }

  async listConversations(
    accountId: string,
    cursor?: string,
  ): Promise<SocialPage<SocialConversation>> {
    const account = await this.resolveAccount(accountId);
    const payload = await this.client.listConversations({
      accountId: account.externalId,
      profileId: this.profileId ?? undefined,
      cursor,
      limit: 50,
    });
    const items = extractArray(payload, [
      "conversations",
      "data",
      "items",
    ]).map((row) => this.mapConversationRow(row, account.id));
    return {
      items: items.filter((c): c is SocialConversation => c != null),
      nextCursor: extractCursor(payload),
    };
  }

  async listMessages(
    conversationId: string,
    cursor?: string,
  ): Promise<SocialPage<SocialMessage>> {
    const externalId = stripPrefix(conversationId, "zernio-conversation:");
    const payload = await this.client.listMessages(externalId, {
      cursor,
      limit: 50,
    });
    const items = extractArray(payload, ["messages", "data", "items"]).map(
      (row) => this.mapMessageRow(row, conversationId),
    );
    return {
      items: items.filter((m): m is SocialMessage => m != null),
      nextCursor: extractCursor(payload),
    };
  }

  async sendMessage(
    conversationId: string,
    text: string,
  ): Promise<SocialMessage> {
    const externalId = stripPrefix(conversationId, "zernio-conversation:");
    const account = await this.firstDmAccount();
    const payload = await this.client.sendMessage(externalId, {
      accountId: account.externalId,
      message: text,
    });
    return (
      this.mapMessageRow(payload, conversationId) ?? {
        id: `zernio-message:${newId()}`,
        workspaceId: this.workspaceId,
        conversationId,
        externalId: null,
        direction: "out",
        text,
        sentAt: new Date().toISOString(),
        status: "sent",
      }
    );
  }

  /**
   * Poll fallback for accounts without DM webhooks (X).
   * Returns normalized message.received events for new conversations/messages.
   */
  async pollMessages(accountId: string): Promise<SocialNormalizedEvent[]> {
    const account = await this.resolveAccount(accountId);
    if (account.capabilities.dmWebhooks || !account.capabilities.dms) {
      return [];
    }
    const page = await this.listConversations(accountId);
    const events: SocialNormalizedEvent[] = [];
    for (const conversation of page.items.slice(0, 10)) {
      const messages = await this.listMessages(conversation.id);
      const latest = messages.items[0];
      if (!latest || latest.direction !== "in") continue;
      events.push({
        type: "message.received",
        eventId: `poll:${conversation.id}:${latest.id}`,
        message: latest,
        conversation,
      });
    }
    return events;
  }

  async getPostAnalytics(options?: {
    accountId?: string;
    postExternalId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<SocialAnalyticsPoint[]> {
    const query: Record<string, string> = {};
    if (this.profileId) query.profileId = this.profileId;
    if (options?.postExternalId) query.postId = options.postExternalId;
    if (options?.fromDate) query.fromDate = options.fromDate;
    if (options?.toDate) query.toDate = options.toDate;
    if (options?.accountId) {
      const account = await this.resolveAccount(options.accountId);
      query.accountId = account.externalId;
      query.platform = toZernioConnectPlatform(account.platform);
    }
    const payload = await this.client.getAnalytics(query);
    return extractArray(payload, ["analytics", "data", "items", "posts"]).map(
      (row) => this.mapAnalyticsRow(row),
    );
  }

  async getFollowerStats(
    accountIds: string[],
    options?: { fromDate?: string; toDate?: string },
  ): Promise<SocialFollowerStats[]> {
    const externals: string[] = [];
    for (const id of accountIds) {
      const account = await this.resolveAccount(id);
      externals.push(account.externalId);
    }
    const query: Record<string, string> = {
      accountIds: externals.join(","),
    };
    if (this.profileId) query.profileId = this.profileId;
    if (options?.fromDate) query.fromDate = options.fromDate;
    if (options?.toDate) query.toDate = options.toDate;
    const payload = await this.client.getFollowerStats(query);
    return extractArray(payload, ["stats", "data", "items", "accounts"]).map(
      (row) => {
        const r = asRecord(row) ?? {};
        return {
          accountId: asString(r.accountId)
            ? `zernio-account:${asString(r.accountId)}`
            : "",
          date: asString(r.date) ?? asString(r.day) ?? "",
          followers: numberOrZero(r.followers ?? r.followerCount),
          following: numberOrNull(r.following ?? r.followingCount),
        };
      },
    );
  }

  async getAnalyticsDelta(
    cursor: string | null,
  ): Promise<{ items: SocialAnalyticsPoint[]; nextCursor: string | null }> {
    const query: Record<string, string> = {};
    if (cursor) query.cursor = cursor;
    if (this.profileId) query.profileId = this.profileId;
    const payload = await this.client.getAnalyticsDelta(query);
    const record = asRecord(payload) ?? {};
    const items = extractArray(payload, ["entries", "data", "items", "changes"]).map(
      (row) => this.mapAnalyticsRow(row),
    );
    const nextCursor =
      asString(record.nextCursor) ??
      asString(record.cursor) ??
      asString(record.next_cursor) ??
      null;
    return { items, nextCursor };
  }

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    if (!this.webhookSecret) return false;
    return verifyZernioWebhookSignature(
      this.webhookSecret,
      rawBody,
      headers["x-zernio-signature"] ?? headers["X-Zernio-Signature"],
    );
  }

  translateWebhook(
    headers: Record<string, string>,
    rawBody: string,
  ): SocialNormalizedEvent[] {
    return translateZernioWebhook(headers, rawBody, {
      workspaceId: this.workspaceId,
    });
  }

  private async createPosts(
    accountIds: string[],
    post: PublishPostInput,
    timing: { publishNow?: boolean; scheduledFor?: string },
  ): Promise<SocialPost[]> {
    const accounts = await Promise.all(
      accountIds.map((id) => this.resolveAccount(id)),
    );
    for (const account of accounts) {
      if (!account.capabilities.publish) {
        throw new ZernioApiError(
          400,
          "",
          `publish is not supported for ${account.platform}`,
        );
      }
      if (timing.scheduledFor && !account.capabilities.schedule) {
        throw new ZernioApiError(
          400,
          "",
          `schedule is not supported for ${account.platform}`,
        );
      }
    }
    const platforms = accounts.map((account) => ({
      platform: toZernioConnectPlatform(account.platform),
      accountId: account.externalId,
    }));
    const body: Record<string, unknown> = {
      content: post.text,
      platforms,
      ...(post.media?.length
        ? {
            mediaItems: post.media.map((m) => ({
              url: m.url,
              type: m.kind,
            })),
          }
        : {}),
      ...(timing.publishNow ? { publishNow: true } : {}),
      ...(timing.scheduledFor ? { scheduledFor: timing.scheduledFor } : {}),
    };
    const payload = await this.client.createPost(body);
    const externalId =
      asString(asRecord(payload)?.id) ??
      asString(asRecord(payload)?._id) ??
      newId();
    return accounts.map((account) => ({
      id: `zernio-post:${externalId}:${account.externalId}`,
      workspaceId: this.workspaceId,
      accountId: account.id,
      platform: account.platform,
      provider: PROVIDER,
      externalId,
      url: null,
      authorHandle: account.handle,
      authorExternalId: account.externalId,
      text: post.text,
      media: post.media ?? [],
      status: timing.scheduledFor ? "scheduled" : "published",
      scheduledAt: timing.scheduledFor ?? null,
      postedAt: timing.publishNow ? new Date().toISOString() : null,
      engagement: null,
      contactId: null,
      organizationId: null,
    }));
  }

  private mapAccount(row: ZernioAccountRaw): SocialAccount | null {
    const platform = mapZernioPlatform(row.platform, row.accountType);
    if (!platform) return null;
    const status = (row.status ?? "").toLowerCase();
    const disconnected =
      status.includes("disconnect") ||
      status.includes("revoked") ||
      status === "inactive";
    const needsReconnect =
      status.includes("reconnect") || status.includes("expired");
    return {
      id: `zernio-account:${row.id}`,
      workspaceId: this.workspaceId,
      platform,
      relation: "connected",
      provider: PROVIDER,
      externalId: row.id,
      handle: row.username,
      displayName: row.displayName,
      url: row.url,
      contactId: null,
      organizationId: null,
      capabilities: zernioCapabilities(platform),
      disconnected,
      needsReconnect,
    };
  }

  private async upsertAccounts(accounts: SocialAccount[]): Promise<void> {
    for (const account of accounts) {
      await db
        .insert(socialAccounts)
        .values({
          id: account.id,
          workspaceId: this.workspaceId,
          platform: account.platform,
          relation: account.relation,
          provider: account.provider,
          externalId: account.externalId,
          handle: account.handle,
          displayName: account.displayName,
          url: account.url,
          capabilities: account.capabilities,
          disconnected: account.disconnected,
          needsReconnect: account.needsReconnect,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: socialAccounts.id,
          set: {
            platform: account.platform,
            handle: account.handle,
            displayName: account.displayName,
            url: account.url,
            capabilities: account.capabilities,
            disconnected: account.disconnected,
            needsReconnect: account.needsReconnect,
            updatedAt: new Date(),
            deletedAt: null,
          },
        });
    }
  }

  private async resolveAccount(accountId: string): Promise<SocialAccount> {
    const externalId = stripPrefix(accountId, "zernio-account:");
    const [row] = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, this.workspaceId),
          eq(socialAccounts.externalId, externalId),
          eq(socialAccounts.provider, PROVIDER),
          isNull(socialAccounts.deletedAt),
        ),
      )
      .limit(1);
    if (row) {
      return {
        id: row.id,
        workspaceId: row.workspaceId,
        platform: row.platform as SocialAccount["platform"],
        relation: row.relation as SocialAccount["relation"],
        provider: row.provider,
        externalId: row.externalId,
        handle: row.handle,
        displayName: row.displayName,
        url: row.url,
        contactId: row.contactId,
        organizationId: row.organizationId,
        capabilities: row.capabilities as SocialAccount["capabilities"],
        disconnected: row.disconnected,
        needsReconnect: row.needsReconnect,
      };
    }
    const listed = await this.listAccounts();
    const found = listed.find((a) => a.externalId === externalId || a.id === accountId);
    if (!found) {
      throw new ZernioApiError(404, "", `Social account not found: ${accountId}`);
    }
    return found;
  }

  private async firstDmAccount(): Promise<SocialAccount> {
    const accounts = await this.listAccounts();
    const dm = accounts.find((a) => a.capabilities.dms && !a.disconnected);
    if (!dm) {
      throw new ZernioApiError(400, "", "No connected account supports DMs");
    }
    return dm;
  }

  private mapCommentRow(
    row: unknown,
    postExternalId: string,
  ): SocialComment | null {
    const r = asRecord(row) ?? asRecord(asRecord(row)?.comment);
    if (!r) return null;
    const externalId = asString(r.id) ?? asString(r._id) ?? asString(r.commentId);
    if (!externalId) return null;
    const accountExternalId =
      asString(r.accountId) ?? asString(r.account_id) ?? "";
    return {
      id: accountExternalId
        ? `zernio-comment:${postExternalId}:${externalId}:${accountExternalId}`
        : `zernio-comment:${postExternalId}:${externalId}`,
      workspaceId: this.workspaceId,
      postId: `zernio-post:${postExternalId}`,
      accountId: accountExternalId
        ? `zernio-account:${accountExternalId}`
        : "",
      externalId,
      authorHandle:
        asString(r.authorUsername) ??
        asString(r.authorHandle) ??
        asString(asRecord(r.author)?.username) ??
        "unknown",
      authorExternalId:
        asString(r.authorId) ?? asString(asRecord(r.author)?.id) ?? null,
      text: asString(r.message) ?? asString(r.text) ?? asString(r.content) ?? "",
      createdAt:
        asString(r.createdAt) ??
        asString(r.timestamp) ??
        new Date().toISOString(),
      parentCommentId: asString(r.parentId) ?? asString(r.parentCommentId),
      hidden: r.hidden === true,
      contactId: null,
    };
  }

  private mapConversationRow(
    row: unknown,
    accountId: string,
  ): SocialConversation | null {
    const r = asRecord(row);
    if (!r) return null;
    const externalId = asString(r.id) ?? asString(r._id);
    if (!externalId) return null;
    return {
      id: `zernio-conversation:${externalId}`,
      workspaceId: this.workspaceId,
      accountId,
      kind: "dm",
      participantHandle:
        asString(r.participantUsername) ??
        asString(asRecord(r.participant)?.username) ??
        null,
      participantExternalId:
        asString(r.participantId) ??
        asString(asRecord(r.participant)?.id) ??
        null,
      contactId: null,
      ticketId: null,
      lastMessageAt:
        asString(r.lastMessageAt) ??
        asString(r.updatedAt) ??
        new Date().toISOString(),
    };
  }

  private mapMessageRow(
    row: unknown,
    conversationId: string,
  ): SocialMessage | null {
    const r = asRecord(row) ?? asRecord(asRecord(row)?.message);
    if (!r) return null;
    const externalId = asString(r.id) ?? asString(r._id) ?? asString(r.messageId);
    const directionRaw = asString(r.direction) ?? "in";
    const direction =
      directionRaw === "out" ||
      directionRaw === "outbound" ||
      directionRaw === "sent"
        ? "out"
        : "in";
    return {
      id: externalId
        ? `zernio-message:${externalId}`
        : `zernio-message:${newId()}`,
      workspaceId: this.workspaceId,
      conversationId,
      externalId,
      direction,
      text: asString(r.text) ?? asString(r.message) ?? asString(r.content) ?? "",
      sentAt:
        asString(r.createdAt) ??
        asString(r.timestamp) ??
        new Date().toISOString(),
      status: null,
    };
  }

  private mapAnalyticsRow(row: unknown): SocialAnalyticsPoint {
    const r = asRecord(row) ?? {};
    const metrics = asRecord(r.metrics) ?? r;
    return {
      postExternalId: asString(r.postId) ?? asString(r.id),
      accountId: asString(r.accountId)
        ? `zernio-account:${asString(r.accountId)}`
        : null,
      platform: mapZernioPlatform(asString(r.platform)),
      capturedAt:
        asString(r.date) ??
        asString(r.capturedAt) ??
        asString(r.updatedAt) ??
        new Date().toISOString(),
      impressions: numberOrZero(metrics.impressions),
      reach: numberOrZero(metrics.reach),
      likes: numberOrZero(metrics.likes),
      comments: numberOrZero(metrics.comments),
      shares: numberOrZero(metrics.shares),
      saves: numberOrZero(metrics.saves),
      clicks: numberOrZero(metrics.clicks),
      views: numberOrZero(metrics.views),
      follows: numberOrNull(metrics.follows),
    };
  }
}

function parseCommentRef(commentId: string): {
  postExternalId: string;
  commentExternalId: string;
  accountExternalId: string;
} {
  // Formats:
  // zernio-comment:{post}:{comment}:{account}
  // zernio-comment:{comment}
  const raw = stripPrefix(commentId, "zernio-comment:");
  const parts = raw.split(":");
  if (parts.length >= 3) {
    return {
      postExternalId: parts[0]!,
      commentExternalId: parts[1]!,
      accountExternalId: parts[2]!,
    };
  }
  if (parts.length === 2) {
    return {
      postExternalId: parts[0]!,
      commentExternalId: parts[1]!,
      accountExternalId: "",
    };
  }
  throw new ZernioApiError(
    400,
    "",
    "commentId must encode post + comment (+ account) ids",
  );
}

function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function extractArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function extractCursor(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;
  return (
    asString(record.nextCursor) ??
    asString(record.cursor) ??
    asString(record.next_cursor) ??
    null
  );
}

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

function numberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
