import { initContract, type AppRouter } from "@ts-rest/core";
import { badRequestSchema, documentSchema, errorSchema } from "../schemas.js";
import * as s from "../schemas.js";
import { z } from "zod";

const c = initContract();

/** Space publishing and public space reads. */
export const spacesRoutes: AppRouter = c.router({
  getSpacePublishSettings: {
    method: "GET",
    path: "/api/v1/spaces/:spaceDocumentId/publish-settings",
    pathParams: z.object({ spaceDocumentId: z.string() }),
    responses: {
      200: s.spacePublishSettingsSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get Spaces publish settings for a space root folder",
  },
  updateSpacePublishSettings: {
    method: "PUT",
    path: "/api/v1/spaces/:spaceDocumentId/publish-settings",
    pathParams: z.object({ spaceDocumentId: z.string() }),
    body: s.updateSpacePublishSettingsSchema,
    responses: {
      200: s.spacePublishSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Update Spaces publish settings (domains, public base URL)",
  },
  createSpaceSiteKey: {
    method: "POST",
    path: "/api/v1/spaces/:spaceDocumentId/site-key",
    pathParams: z.object({ spaceDocumentId: z.string() }),
    body: s.createSpaceSiteKeySchema,
    responses: {
      201: s.spaceSiteKeyCreatedSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Create a labeled Spaces site key (plaintext returned once)",
  },
  revokeSpaceSiteKey: {
    method: "DELETE",
    path: "/api/v1/spaces/:spaceDocumentId/site-key/:keyId",
    pathParams: z.object({
      spaceDocumentId: z.string(),
      keyId: z.string(),
    }),
    body: null,
    responses: {
      200: s.spacePublishSettingsSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Revoke one Spaces site key by id",
  },
  putSpaceCover: {
    method: "PUT",
    path: "/api/v1/spaces/:spaceDocumentId/cover",
    pathParams: z.object({ spaceDocumentId: z.string() }),
    body: c.type<ArrayBuffer | Blob>(),
    responses: {
      200: documentSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      413: badRequestSchema,
    },
    summary: "Upload a cover / OG image for a space folder",
  },
  getSpaceCover: {
    method: "GET",
    path: "/api/v1/spaces/:spaceDocumentId/cover",
    pathParams: z.object({ spaceDocumentId: z.string() }),
    responses: {
      200: c.otherResponse({ contentType: "image/*", body: c.type<Blob>() }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Download the cover / OG image for a space folder",
  },
  deleteSpaceCover: {
    method: "DELETE",
    path: "/api/v1/spaces/:spaceDocumentId/cover",
    pathParams: z.object({ spaceDocumentId: z.string() }),
    body: null,
    responses: {
      200: documentSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Remove the cover / OG image for a space folder",
  },
  getPublicSpaceCover: {
    method: "GET",
    path: "/api/v1/public/spaces/:spaceDocumentId/cover",
    pathParams: z.object({ spaceDocumentId: z.string() }),
    responses: {
      200: c.otherResponse({ contentType: "image/*", body: c.type<Blob>() }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Public cover image for SEO/OG embeds (space site key required)",
  },
  listPublicSpaceArticles: {
    method: "GET",
    path: "/api/v1/public/spaces/:spaceDocumentId/articles",
    pathParams: z.object({ spaceDocumentId: z.string() }),
    responses: {
      200: z.object({
        articles: z.array(s.publicSpaceArticleListItemSchema),
      }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "List published Group articles for a space (site-key auth)",
  },
  getPublicSpaceArticle: {
    method: "GET",
    path: "/api/v1/public/spaces/:spaceDocumentId/article",
    pathParams: z.object({
      spaceDocumentId: z.string(),
    }),
    query: z.object({
      slug: z.string().min(1).max(500),
    }),
    responses: {
      200: s.publicSpaceArticleSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get a published Group article by slug (site-key auth)",
  },
});
