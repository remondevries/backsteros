import { initContract } from "@ts-rest/core";
import { z } from "zod";

import { badRequestSchema, errorSchema } from "./schemas.js";
import * as s from "./schemas.js";

const c = initContract();

/**
 * Cloudflare routes live in a separate router so `apiContract` stays under
 * TypeScript's declaration serialization limit (TS7056).
 */
export const cloudflareContract = c.router(
  {
    getCloudflareStatus: {
      method: "GET",
      path: "/api/v1/cloudflare/status",
      responses: {
        200: s.cloudflareStatusSchema,
        401: errorSchema,
        403: errorSchema,
      },
      summary: "Whether a Cloudflare API token is configured on this core",
    },
    getCloudflareSettings: {
      method: "GET",
      path: "/api/v1/settings/cloudflare",
      responses: {
        200: s.cloudflareSettingsSchema,
        401: errorSchema,
        403: errorSchema,
      },
      summary: "Get Cloudflare integration settings (API token redacted)",
    },
    updateCloudflareSettings: {
      method: "PATCH",
      path: "/api/v1/settings/cloudflare",
      body: s.updateCloudflareSettingsSchema,
      responses: {
        200: s.cloudflareSettingsSchema,
        400: badRequestSchema,
        401: errorSchema,
        403: errorSchema,
      },
      summary: "Update Cloudflare API token",
    },
    testCloudflareConnection: {
      method: "GET",
      path: "/api/v1/settings/cloudflare/test",
      responses: {
        200: s.cloudflareTestConnectionResultSchema,
        401: errorSchema,
        403: errorSchema,
      },
      summary: "Test Cloudflare API token by listing zones",
    },
    matchCloudflareZones: {
      method: "POST",
      path: "/api/v1/cloudflare/zones/match",
      body: z.undefined().optional(),
      responses: {
        200: s.cloudflareZoneMatchResultSchema,
        400: badRequestSchema,
        401: errorSchema,
        403: errorSchema,
      },
      summary:
        "Match Catalog Domains to Cloudflare zones by hostname and store zone ids",
    },
    listCloudflareDnsRecords: {
      method: "GET",
      path: "/api/v1/cloudflare/zones/:zoneId/dns-records",
      pathParams: z.object({ zoneId: z.string().min(1) }),
      responses: {
        200: s.cloudflareDnsRecordsResultSchema,
        400: badRequestSchema,
        401: errorSchema,
        403: errorSchema,
      },
      summary: "List DNS records for a Cloudflare zone",
    },
    purgeCloudflareCache: {
      method: "POST",
      path: "/api/v1/cloudflare/zones/:zoneId/purge-cache",
      pathParams: z.object({ zoneId: z.string().min(1) }),
      body: z.undefined().optional(),
      responses: {
        200: s.cloudflarePurgeCacheResultSchema,
        400: badRequestSchema,
        401: errorSchema,
        403: errorSchema,
      },
      summary: "Purge all cached files for a Cloudflare zone",
    },
  },
  {
    pathPrefix: "",
  },
);

export type CloudflareContract = typeof cloudflareContract;
