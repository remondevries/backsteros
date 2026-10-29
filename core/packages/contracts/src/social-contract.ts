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

export const socialPlannedPostSchema = z.object({
  id: z.string().min(1),
  body: z.string(),
  accountKind: socialPlannedPostAccountKindSchema,
  platforms: z.array(socialPlannedPostPlatformSchema).min(1),
  /** ISO timestamp when scheduled; null = unscheduled tray chip. */
  scheduledAt: z.string().datetime().nullable(),
  status: z.enum(["draft", "scheduled"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const socialPlannedPostListSchema = z.object({
  posts: z.array(socialPlannedPostSchema),
});

export const createSocialPlannedPostSchema = z.object({
  body: z.string().trim().min(1),
  accountKind: socialPlannedPostAccountKindSchema,
  platforms: z.array(socialPlannedPostPlatformSchema).min(1),
  scheduledAt: z.string().datetime().nullable().optional(),
});

export const updateSocialPlannedPostSchema = z
  .object({
    body: z.string().trim().min(1).optional(),
    accountKind: socialPlannedPostAccountKindSchema.optional(),
    platforms: z.array(socialPlannedPostPlatformSchema).min(1).optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (value) =>
      value.body !== undefined ||
      value.accountKind !== undefined ||
      value.platforms !== undefined ||
      value.scheduledAt !== undefined,
    { message: "At least one field is required" },
  );

export type SocialPlannedPostPlatform = z.infer<
  typeof socialPlannedPostPlatformSchema
>;
export type SocialPlannedPostAccountKind = z.infer<
  typeof socialPlannedPostAccountKindSchema
>;
export type SocialPlannedPost = z.infer<typeof socialPlannedPostSchema>;
export type SocialPlannedPostList = z.infer<typeof socialPlannedPostListSchema>;
export type CreateSocialPlannedPostInput = z.infer<
  typeof createSocialPlannedPostSchema
>;
export type UpdateSocialPlannedPostInput = z.infer<
  typeof updateSocialPlannedPostSchema
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
});
