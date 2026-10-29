import { initContract } from "@ts-rest/core";
import { z } from "zod";

import { badRequestSchema, errorSchema } from "./schemas.js";

export const socialCapabilitiesSchema = z.object({
  publish: z.boolean(),
  schedule: z.boolean(),
  editPost: z.boolean(),
  deletePost: z.boolean(),
  readComments: z.boolean(),
  replyComments: z.boolean(),
  hideComments: z.boolean(),
  deleteComments: z.boolean(),
  dms: z.boolean(),
  dmWebhooks: z.boolean(),
  analytics: z.enum(["none", "basic", "full"]),
  reviews: z.boolean(),
});

export const socialAccountSummarySchema = z.object({
  id: z.string(),
  platform: z.string(),
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  /** Public profile URL when the provider supplies one (used for LinkedIn vanity). */
  url: z.string().nullable(),
  /** Provider profile picture URL when the network supplies one. */
  avatarUrl: z.string().nullable(),
  /** Provider about/bio text when the network supplies one. */
  bio: z.string().nullable(),
  /** Provider follower count when the network supplies one. */
  followersCount: z.number().int().nonnegative().nullable(),
  disconnected: z.boolean(),
  needsReconnect: z.boolean(),
  capabilities: socialCapabilitiesSchema,
});

/** Settings for the owned-account social provider (Zernio behind the adapter). */
export const socialSettingsSchema = z.object({
  apiKeyConfigured: z.boolean(),
  apiKeyPreview: z.string().nullable(),
  profileId: z.string().nullable(),
  webhookConfigured: z.boolean(),
  connected: z.boolean(),
  analyticsCursor: z.string().nullable(),
  accounts: z.array(socialAccountSummarySchema),
});

export const updateSocialSettingsSchema = z.object({
  /** Set to a new key, or empty string to clear. Omit to leave unchanged. */
  apiKey: z.string().optional(),
  /** Override profile id, or null/empty to clear. Omit to leave unchanged. */
  profileId: z.string().nullable().optional(),
});

export const socialTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  profileId: z.string().nullable(),
  accountCount: z.number().int().nullable(),
});

export const socialConnectAccountInputSchema = z.object({
  platform: z.string().min(1),
  redirectUrl: z.string().url().optional(),
  reconnectAccountId: z.string().optional(),
});

export const socialConnectAccountResultSchema = z.object({
  url: z.string().url(),
});

export type SocialCapabilities = z.infer<typeof socialCapabilitiesSchema>;
export type SocialAccountSummary = z.infer<typeof socialAccountSummarySchema>;
export type SocialSettings = z.infer<typeof socialSettingsSchema>;
export type UpdateSocialSettingsInput = z.infer<
  typeof updateSocialSettingsSchema
>;
export type SocialTestConnectionResult = z.infer<
  typeof socialTestConnectionResultSchema
>;
export type SocialConnectAccountInput = z.infer<
  typeof socialConnectAccountInputSchema
>;
export type SocialConnectAccountResult = z.infer<
  typeof socialConnectAccountResultSchema
>;

/** Platforms the Network Planned composer can target (desktop mock set). */
export const socialPlannedPostPlatformSchema = z.enum([
  "facebook",
  "instagram",
  "x",
  "linkedin",
  "dev-null",
]);

export const socialPlannedPostAccountKindSchema = z.enum([
  "personal",
  "business",
]);

/** Canonical attachment on a planned post (platform adapters decide layout). */
export const socialPlannedPostMediaKindSchema = z.enum(["image", "video"]);

export const socialPlannedPostMediaSchema = z.object({
  id: z.string().min(1),
  kind: socialPlannedPostMediaKindSchema,
  /** Authenticated download path — not a public CDN URL. */
  url: z.string().min(1),
  contentType: z.string().min(1),
  filename: z.string().nullable().optional(),
});

/** Base64 (or data-URL) upload payload for create/update. */
export const socialPlannedPostMediaUploadSchema = z.object({
  data: z.string().min(1),
  contentType: z.string().optional(),
  filename: z.string().optional(),
  kind: socialPlannedPostMediaKindSchema.optional(),
});

export const socialPlannedPostSchema = z.object({
  id: z.string().min(1),
  body: z.string(),
  accountKind: socialPlannedPostAccountKindSchema,
  platforms: z.array(socialPlannedPostPlatformSchema).min(1),
  media: z.array(socialPlannedPostMediaSchema).default([]),
  /** ISO timestamp when scheduled; null = unscheduled tray chip. */
  scheduledAt: z.string().datetime().nullable(),
  status: z.enum(["draft", "scheduled"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const socialPlannedPostListSchema = z.object({
  posts: z.array(socialPlannedPostSchema),
});

export const createSocialPlannedPostSchema = z
  .object({
    body: z.string().default(""),
    accountKind: socialPlannedPostAccountKindSchema,
    platforms: z.array(socialPlannedPostPlatformSchema).min(1),
    scheduledAt: z.string().datetime().nullable().optional(),
    mediaUploads: z
      .array(socialPlannedPostMediaUploadSchema)
      .max(5)
      .optional(),
  })
  .refine(
    (value) =>
      value.body.trim().length > 0 || (value.mediaUploads?.length ?? 0) > 0,
    { message: "Body or media is required" },
  );

export const updateSocialPlannedPostSchema = z
  .object({
    body: z.string().optional(),
    accountKind: socialPlannedPostAccountKindSchema.optional(),
    platforms: z.array(socialPlannedPostPlatformSchema).min(1).optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    /** Appended to existing media (max 5 total after merge). */
    mediaUploads: z
      .array(socialPlannedPostMediaUploadSchema)
      .max(5)
      .optional(),
  })
  .refine(
    (value) =>
      value.body !== undefined ||
      value.accountKind !== undefined ||
      value.platforms !== undefined ||
      value.scheduledAt !== undefined ||
      value.mediaUploads !== undefined,
    { message: "At least one field is required" },
  );

/** Bearer download path for a planned-post media blob. */
export function socialPlannedPostMediaPath(
  postId: string,
  mediaId: string,
): string {
  return `/api/v1/social/planned-posts/${encodeURIComponent(postId)}/media/${encodeURIComponent(mediaId)}`;
}

export type SocialPlannedPostPlatform = z.infer<
  typeof socialPlannedPostPlatformSchema
>;
export type SocialPlannedPostAccountKind = z.infer<
  typeof socialPlannedPostAccountKindSchema
>;
export type SocialPlannedPostMedia = z.infer<typeof socialPlannedPostMediaSchema>;
export type SocialPlannedPostMediaUpload = z.infer<
  typeof socialPlannedPostMediaUploadSchema
>;
export type SocialPlannedPost = z.infer<typeof socialPlannedPostSchema>;
export type SocialPlannedPostList = z.infer<typeof socialPlannedPostListSchema>;
export type CreateSocialPlannedPostInput = z.infer<
  typeof createSocialPlannedPostSchema
>;
export type UpdateSocialPlannedPostInput = z.infer<
  typeof updateSocialPlannedPostSchema
>;

/** Live Network inbox card — shaped for the desktop feed list. */
export const socialFeedPostSchema = z.object({
  id: z.string().min(1),
  authorName: z.string(),
  authorHandle: z.string(),
  /** Connected-account avatar (Zernio profilePicture) when available. */
  authorAvatarUrl: z.string().nullable().optional(),
  /** Connected-account follower count when the provider supplies one. */
  authorFollowersCount: z.number().int().nonnegative().nullable().optional(),
  authorVerified: z.boolean().optional(),
  platform: socialPlannedPostPlatformSchema,
  accountKind: socialPlannedPostAccountKindSchema,
  body: z.string(),
  imageUrl: z.string().nullable().optional(),
  imageAlt: z.string().nullable().optional(),
  createdAt: z.string(),
  replyCount: z.number().int().nonnegative(),
  repostCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative(),
  /** LinkedIn “saves” on the post (personal analytics; usually 0 for org). */
  saveCount: z.number().int().nonnegative().default(0),
  permalink: z.string().nullable().optional(),
  feed: z.enum(["for-you", "following", "both"]).default("both"),
});

export const socialFeedListSchema = z.object({
  /** `live` = provider response (may be empty). */
  source: z.enum(["live"]),
  platform: socialPlannedPostPlatformSchema,
  accountKind: socialPlannedPostAccountKindSchema,
  posts: z.array(socialFeedPostSchema),
});

export const socialFeedQuerySchema = z.object({
  platform: socialPlannedPostPlatformSchema,
  accountKind: socialPlannedPostAccountKindSchema,
});

export type SocialFeedPost = z.infer<typeof socialFeedPostSchema>;
export type SocialFeedList = z.infer<typeof socialFeedListSchema>;
export type SocialFeedQuery = z.infer<typeof socialFeedQuerySchema>;

/** Comments on a live Network post (LinkedIn company page via Zernio). */
export const socialFeedCommentSchema = z.object({
  id: z.string().min(1),
  postId: z.string().min(1),
  authorName: z.string(),
  authorHandle: z.string(),
  authorAvatarUrl: z.string().nullable().optional(),
  authorVerified: z.boolean().optional(),
  body: z.string(),
  createdAt: z.string(),
  likeCount: z.number().int().nonnegative(),
});

export const socialFeedCommentsQuerySchema = z.object({
  platform: z.literal("linkedin"),
  accountKind: z.literal("business"),
  postId: z.string().min(1),
});

export const socialFeedCommentsListSchema = z.object({
  source: z.enum(["live"]),
  platform: z.literal("linkedin"),
  accountKind: z.literal("business"),
  postId: z.string(),
  comments: z.array(socialFeedCommentSchema),
});

export type SocialFeedComment = z.infer<typeof socialFeedCommentSchema>;
export type SocialFeedCommentsQuery = z.infer<
  typeof socialFeedCommentsQuerySchema
>;
export type SocialFeedCommentsList = z.infer<
  typeof socialFeedCommentsListSchema
>;

/** Publish now to a connected LinkedIn account via Zernio (text-first). */
export const publishSocialPostInputSchema = z.object({
  platform: z.literal("linkedin"),
  accountKind: socialPlannedPostAccountKindSchema,
  body: z.string().trim().min(1).max(3000),
});

export const publishSocialPostResultSchema = z.object({
  posts: z.array(
    z.object({
      id: z.string(),
      platform: z.string(),
      accountId: z.string(),
      status: z.string(),
      text: z.string(),
      postedAt: z.string().nullable(),
    }),
  ),
});

export type PublishSocialPostInput = z.infer<typeof publishSocialPostInputSchema>;
export type PublishSocialPostResult = z.infer<
  typeof publishSocialPostResultSchema
>;

const linkedInReactionTypeSchema = z.enum([
  "LIKE",
  "PRAISE",
  "EMPATHY",
  "INTEREST",
  "APPRECIATION",
  "ENTERTAINMENT",
]);

/** React to a live Network LinkedIn post (Zernio inbox like). */
export const likeSocialFeedPostInputSchema = z.object({
  platform: z.literal("linkedin"),
  accountKind: socialPlannedPostAccountKindSchema,
  postId: z.string().min(1),
  reactionType: linkedInReactionTypeSchema.optional(),
});

export const likeSocialFeedPostResultSchema = z.object({
  liked: z.boolean(),
  alreadyReacted: z.boolean().optional(),
  reactionType: z.string().optional(),
});

export const unlikeSocialFeedPostInputSchema = z.object({
  platform: z.literal("linkedin"),
  accountKind: socialPlannedPostAccountKindSchema,
  postId: z.string().min(1),
});

export const unlikeSocialFeedPostResultSchema = z.object({
  liked: z.literal(false),
});

export type LikeSocialFeedPostInput = z.infer<
  typeof likeSocialFeedPostInputSchema
>;
export type LikeSocialFeedPostResult = z.infer<
  typeof likeSocialFeedPostResultSchema
>;
export type UnlikeSocialFeedPostInput = z.infer<
  typeof unlikeSocialFeedPostInputSchema
>;
export type UnlikeSocialFeedPostResult = z.infer<
  typeof unlikeSocialFeedPostResultSchema
>;

/** Edit text on a live Network LinkedIn post (Zernio published-post edit). */
export const editSocialFeedPostInputSchema = z.object({
  platform: z.literal("linkedin"),
  accountKind: socialPlannedPostAccountKindSchema,
  postId: z.string().min(1),
  body: z.string().trim().min(1).max(3000),
});

export const editSocialFeedPostResultSchema = z.object({
  id: z.string().min(1),
  body: z.string(),
});

export type EditSocialFeedPostInput = z.infer<
  typeof editSocialFeedPostInputSchema
>;
export type EditSocialFeedPostResult = z.infer<
  typeof editSocialFeedPostResultSchema
>;

const c = initContract();

export const socialContract = c.router({
  getSocialSettings: {
    method: "GET",
    path: "/api/v1/settings/social",
    responses: {
      200: socialSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get social (owned-account) integration settings",
  },
  updateSocialSettings: {
    method: "PATCH",
    path: "/api/v1/settings/social",
    body: updateSocialSettingsSchema,
    responses: {
      200: socialSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Update social API key / profile",
  },
  testSocialConnection: {
    method: "GET",
    path: "/api/v1/settings/social/test",
    responses: {
      200: socialTestConnectionResultSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Test social provider connection",
  },
  syncSocialAccounts: {
    method: "POST",
    path: "/api/v1/settings/social/sync-accounts",
    body: z.undefined().optional(),
    responses: {
      200: socialSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Sync connected social accounts from the provider",
  },
  connectSocialAccount: {
    method: "POST",
    path: "/api/v1/settings/social/connect",
    body: socialConnectAccountInputSchema,
    responses: {
      200: socialConnectAccountResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Start headless connect for a social platform account",
  },
  disconnectSocialAccount: {
    method: "POST",
    path: "/api/v1/settings/social/accounts/:accountId/disconnect",
    pathParams: z.object({ accountId: z.string().min(1) }),
    body: z.undefined().optional(),
    responses: {
      200: socialSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Disconnect a social account",
  },
  listSocialPlannedPosts: {
    method: "GET",
    path: "/api/v1/social/planned-posts",
    responses: {
      200: socialPlannedPostListSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List local Network Planned posts (draft + scheduled)",
  },
  createSocialPlannedPost: {
    method: "POST",
    path: "/api/v1/social/planned-posts",
    body: createSocialPlannedPostSchema,
    responses: {
      201: socialPlannedPostSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Create a local Network Planned post",
  },
  updateSocialPlannedPost: {
    method: "PATCH",
    path: "/api/v1/social/planned-posts/:id",
    pathParams: z.object({ id: z.string().min(1) }),
    body: updateSocialPlannedPostSchema,
    responses: {
      200: socialPlannedPostSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Update a local Network Planned post",
  },
  deleteSocialPlannedPost: {
    method: "DELETE",
    path: "/api/v1/social/planned-posts/:id",
    pathParams: z.object({ id: z.string().min(1) }),
    body: z.undefined().optional(),
    responses: {
      204: z.undefined().optional(),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Soft-delete a local Network Planned post",
  },
  getSocialPlannedPostMedia: {
    method: "GET",
    path: "/api/v1/social/planned-posts/:id/media/:mediaId",
    pathParams: z.object({
      id: z.string().min(1),
      mediaId: z.string().min(1),
    }),
    responses: {
      200: z.any(),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Download planned-post media bytes (Bearer auth)",
  },
  listSocialFeedPosts: {
    method: "GET",
    path: "/api/v1/social/feed",
    query: socialFeedQuerySchema,
    responses: {
      200: socialFeedListSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "List live Network inbox posts for a connected platform account (LinkedIn first)",
  },
  listSocialFeedComments: {
    method: "GET",
    path: "/api/v1/social/feed/comments",
    query: socialFeedCommentsQuerySchema,
    responses: {
      200: socialFeedCommentsListSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "List comments on a live Network LinkedIn company-page post (Zernio inbox)",
  },
  publishSocialPost: {
    method: "POST",
    path: "/api/v1/social/publish",
    body: publishSocialPostInputSchema,
    responses: {
      200: publishSocialPostResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Publish now to a connected LinkedIn account (Zernio)",
  },
  likeSocialFeedPost: {
    method: "POST",
    path: "/api/v1/social/feed/like",
    body: likeSocialFeedPostInputSchema,
    responses: {
      200: likeSocialFeedPostResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Like (react to) a live Network LinkedIn post via Zernio",
  },
  unlikeSocialFeedPost: {
    method: "POST",
    path: "/api/v1/social/feed/unlike",
    body: unlikeSocialFeedPostInputSchema,
    responses: {
      200: unlikeSocialFeedPostResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Remove a LinkedIn reaction from a live Network post via Zernio",
  },
  editSocialFeedPost: {
    method: "POST",
    path: "/api/v1/social/feed/edit",
    body: editSocialFeedPostInputSchema,
    responses: {
      200: editSocialFeedPostResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "Edit text on a live Network LinkedIn post published through Zernio",
  },
});
