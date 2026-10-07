/**
 * Normalized social types for the BacksterOS social layer.
 * Vendor payloads never leave provider modules — callers use these shapes only.
 */

export type SocialPlatform =
  | "facebook_page"
  | "instagram"
  | "linkedin_personal"
  | "linkedin_org"
  | "x"
  | "threads"
  | "bluesky"
  | "tiktok"
  | "youtube"
  | "reddit"
  | "telegram"
  | "whatsapp"
  | "google_business";

export type SocialAccountRelation = "connected" | "followed";

/** Per-account capability flags. UI reads these; it never hard-codes platform rules. */
export type SocialCapabilities = {
  publish: boolean;
  schedule: boolean;
  editPost: boolean;
  deletePost: boolean;
  readComments: boolean;
  replyComments: boolean;
  hideComments: boolean;
  deleteComments: boolean;
  dms: boolean;
  /** false → poll fallback for messaging */
  dmWebhooks: boolean;
  analytics: "none" | "basic" | "full";
  /** Reviews (e.g. Google Business Profile). */
  reviews: boolean;
};

export type SocialAccount = {
  id: string;
  workspaceId: string;
  platform: SocialPlatform;
  relation: SocialAccountRelation;
  /** Adapter provider id, e.g. `zernio`, `x_api`. */
  provider: string;
  externalId: string;
  handle: string | null;
  displayName: string | null;
  url: string | null;
  contactId: string | null;
  organizationId: string | null;
  capabilities: SocialCapabilities;
  /** Provider reported disconnect / needs reconnect. */
  disconnected: boolean;
  /** Missing scope / 412 — surface reconnect in settings. */
  needsReconnect: boolean;
};

export type SocialMediaItem = {
  kind: "image" | "video" | "gif" | "document";
  url: string;
};

export type SocialPostStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "failed"
  | "partial";

export type SocialPost = {
  id: string;
  workspaceId: string;
  accountId: string;
  platform: SocialPlatform;
  provider: string;
  externalId: string;
  url: string | null;
  authorHandle: string | null;
  authorExternalId: string | null;
  text: string;
  media: SocialMediaItem[];
  status: SocialPostStatus;
  scheduledAt: string | null;
  postedAt: string | null;
  engagement: {
    likes: number | null;
    comments: number | null;
    shares: number | null;
    impressions: number | null;
    reaches: number | null;
    saves: number | null;
    clicks: number | null;
    views: number | null;
    follows: number | null;
  } | null;
  contactId: string | null;
  organizationId: string | null;
};

export type SocialComment = {
  id: string;
  workspaceId: string;
  postId: string;
  accountId: string;
  externalId: string;
  authorHandle: string;
  authorExternalId: string | null;
  text: string;
  createdAt: string;
  parentCommentId: string | null;
  hidden: boolean;
  contactId: string | null;
};

export type SocialConversationKind = "dm" | "comment_thread" | "mention";

export type SocialConversation = {
  id: string;
  workspaceId: string;
  accountId: string;
  kind: SocialConversationKind;
  participantHandle: string | null;
  participantExternalId: string | null;
  contactId: string | null;
  ticketId: string | null;
  lastMessageAt: string;
};

export type SocialMessageDirection = "in" | "out";

export type SocialMessageStatus =
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "pending";

export type SocialMessage = {
  id: string;
  workspaceId: string;
  conversationId: string;
  externalId: string | null;
  direction: SocialMessageDirection;
  text: string;
  sentAt: string;
  status: SocialMessageStatus | null;
};

export type SocialPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type PublishPostInput = {
  text: string;
  media?: SocialMediaItem[];
};

export type SocialAnalyticsPoint = {
  postExternalId: string | null;
  accountId: string | null;
  platform: SocialPlatform | null;
  capturedAt: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  views: number;
  /** null when the platform does not report follows */
  follows: number | null;
};

export type SocialFollowerStats = {
  accountId: string;
  date: string;
  followers: number;
  following: number | null;
};

export type SocialNormalizedEvent =
  | {
      type: "comment.received";
      eventId: string;
      comment: SocialComment;
    }
  | {
      type: "message.received";
      eventId: string;
      message: SocialMessage;
      conversation: SocialConversation;
    }
  | {
      type: "message.status";
      eventId: string;
      message: SocialMessage;
    }
  | {
      type: "conversation.started";
      eventId: string;
      conversation: SocialConversation;
    }
  | {
      type: "post.status";
      eventId: string;
      post: SocialPost;
    }
  | {
      type: "account.disconnected";
      eventId: string;
      accountId: string;
      externalAccountId: string;
    }
  | {
      type: "analytics.synced";
      eventId: string;
      cursor: string | null;
    };
