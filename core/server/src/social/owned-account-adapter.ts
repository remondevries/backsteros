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
} from "./types.js";

/**
 * Act as yourself on connected accounts: publish, comments, optional DMs, analytics.
 * Implementations live under `providers/`; callers never import vendor modules.
 */
export interface OwnedAccountAdapter {
  readonly provider: string;

  listAccounts(): Promise<SocialAccount[]>;

  publishPost(
    accountIds: string[],
    post: PublishPostInput,
  ): Promise<SocialPost[]>;

  schedulePost(
    accountIds: string[],
    post: PublishPostInput,
    at: string,
  ): Promise<SocialPost[]>;

  editPost(
    postId: string,
    patch: { text: string; accountId?: string },
  ): Promise<SocialPost>;

  deletePost(postId: string, options?: { accountId?: string }): Promise<void>;

  listComments(
    postId: string,
    cursor?: string,
  ): Promise<SocialPage<SocialComment>>;

  replyToComment(commentId: string, text: string): Promise<SocialComment>;

  hideComment?(commentId: string): Promise<void>;

  deleteComment?(commentId: string): Promise<void>;

  listConversations?(
    accountId: string,
    cursor?: string,
  ): Promise<SocialPage<SocialConversation>>;

  listMessages?(
    conversationId: string,
    cursor?: string,
  ): Promise<SocialPage<SocialMessage>>;

  sendMessage?(
    conversationId: string,
    text: string,
  ): Promise<SocialMessage>;

  /**
   * Poll messaging for platforms without DM webhooks (e.g. X).
   * No-op when every connected account has `dmWebhooks`.
   */
  pollMessages?(accountId: string): Promise<SocialNormalizedEvent[]>;

  getPostAnalytics?(
    options?: {
      accountId?: string;
      postExternalId?: string;
      fromDate?: string;
      toDate?: string;
    },
  ): Promise<SocialAnalyticsPoint[]>;

  getFollowerStats?(
    accountIds: string[],
    options?: { fromDate?: string; toDate?: string },
  ): Promise<SocialFollowerStats[]>;

  getAnalyticsDelta?(
    cursor: string | null,
  ): Promise<{ items: SocialAnalyticsPoint[]; nextCursor: string | null }>;

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean;

  translateWebhook(
    headers: Record<string, string>,
    rawBody: string,
  ): SocialNormalizedEvent[];
}
