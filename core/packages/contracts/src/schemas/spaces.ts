import { z } from "zod";
export const spaceSeoAddressSchema = z.object({
  streetAddress: z.string().max(500).optional(),
  addressLocality: z.string().max(200).optional(),
  addressRegion: z.string().max(200).optional(),
  postalCode: z.string().max(40).optional(),
  addressCountry: z.string().max(120).optional(),
});

export const spaceSeoSocialSchema = z.object({
  facebook: z.string().max(2000).optional(),
  twitter: z.string().max(2000).optional(),
  linkedin: z.string().max(2000).optional(),
  instagram: z.string().max(2000).optional(),
  youtube: z.string().max(2000).optional(),
  github: z.string().max(2000).optional(),
});

/** Space-level SEO / Schema.org / Open Graph entity metadata. */
export const spaceSeoMetaSchema = z.object({
  siteName: z.string().max(200).optional(),
  organizationName: z.string().max(200).optional(),
  phone: z.string().max(80).optional(),
  email: z.string().max(320).optional(),
  address: spaceSeoAddressSchema.optional(),
  social: spaceSeoSocialSchema.optional(),
});

export const spaceSiteKeySchema = z.object({
  id: z.string(),
  label: z.string(),
  siteKeyPrefix: z.string(),
  createdAt: z.string().datetime(),
});

export const spacePublishSettingsSchema = z.object({
  spaceDocumentId: z.string(),
  publicBaseUrl: z.string().nullable(),
  allowedDomains: z.array(z.string()),
  seoMeta: spaceSeoMetaSchema,
  siteKeys: z.array(spaceSiteKeySchema),
  /** Derived: siteKeys.length > 0 */
  siteKeyPresent: z.boolean(),
  updatedAt: z.string().datetime(),
});

export const updateSpacePublishSettingsSchema = z
  .object({
    publicBaseUrl: z.string().max(2000).nullable().optional(),
    allowedDomains: z.array(z.string().max(255)).max(100).optional(),
    seoMeta: spaceSeoMetaSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const createSpaceSiteKeySchema = z.object({
  label: z.string().trim().min(1).max(80),
});

export const spaceSiteKeyCreatedSchema = z.object({
  siteKey: z.string(),
  key: spaceSiteKeySchema,
  settings: spacePublishSettingsSchema,
});

export const publicSpaceArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  path: z.string(),
  updatedAt: z.string().datetime(),
  content: z.string(),
});

export const publicSpaceArticleListItemSchema = publicSpaceArticleSchema.omit({
  content: true,
});

export type SpacePublishSettings = z.infer<typeof spacePublishSettingsSchema>;

export type UpdateSpacePublishSettingsInput = z.infer<
  typeof updateSpacePublishSettingsSchema
>;

export type SpaceSeoMeta = z.infer<typeof spaceSeoMetaSchema>;

export type SpaceSeoAddress = z.infer<typeof spaceSeoAddressSchema>;

export type SpaceSeoSocial = z.infer<typeof spaceSeoSocialSchema>;

export type SpaceSiteKey = z.infer<typeof spaceSiteKeySchema>;

export type CreateSpaceSiteKeyInput = z.infer<typeof createSpaceSiteKeySchema>;

export type SpaceSiteKeyCreated = z.infer<typeof spaceSiteKeyCreatedSchema>;

export type PublicSpaceArticle = z.infer<typeof publicSpaceArticleSchema>;

export type PublicSpaceArticleListItem = z.infer<
  typeof publicSpaceArticleListItemSchema
>;
