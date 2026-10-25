import { initContract, type AppRouter } from "@ts-rest/core";
import {
  apiKeyAuditLogSchema,
  apiKeyRequestLogSchema,
  apiKeySchema,
  badRequestSchema,
  createApiKeyResponseSchema,
  createApiKeySchema,
  errorSchema,
  healthSchema,
  listApiKeyAuditLogsQuerySchema,
  listApiKeyRequestLogsQuerySchema,
  revealApiKeySecretResponseSchema,
  updateApiKeySchema,
} from "../schemas.js";
import * as s from "../schemas.js";
import { z } from "zod";

const c = initContract();

/** Health, API keys, devices, ops, sync and PowerSync. */
export const platformRoutes: AppRouter = c.router({
  health: {
    method: "GET",
    path: "/health",
    responses: {
      200: healthSchema,
    },
    summary: "Health check (build version + optional peer mismatch)",
  },
  healthV1: {
    method: "GET",
    path: "/api/v1/health",
    responses: {
      200: healthSchema,
    },
    summary: "Health check under /api/v1 (no auth; same body as /health)",
  },
  listApiKeys: {
    method: "GET",
    path: "/api/v1/api-keys",
    responses: {
      200: z.object({ apiKeys: z.array(apiKeySchema) }),
      401: errorSchema,
    },
    summary: "List API keys (Clerk session)",
  },
  listApiKeyAuditLogs: {
    method: "GET",
    path: "/api/v1/api-keys/audit-logs",
    query: listApiKeyAuditLogsQuerySchema,
    responses: {
      200: z.object({ auditLogs: z.array(apiKeyAuditLogSchema) }),
      401: errorSchema,
    },
    summary: "List API key audit events (create / revoke / rotate)",
  },
  listApiKeyRequestLogs: {
    method: "GET",
    path: "/api/v1/api-keys/request-logs",
    query: listApiKeyRequestLogsQuerySchema,
    responses: {
      200: z.object({ requestLogs: z.array(apiKeyRequestLogSchema) }),
      401: errorSchema,
    },
    summary:
      "List recent API key request history on this core (bounded retention)",
  },
  createApiKey: {
    method: "POST",
    path: "/api/v1/api-keys",
    body: createApiKeySchema,
    responses: {
      201: createApiKeyResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
    },
    summary: "Create API key (Clerk session; secret shown once)",
  },
  updateApiKey: {
    method: "PATCH",
    path: "/api/v1/api-keys/:id",
    pathParams: z.object({ id: z.string() }),
    body: updateApiKeySchema,
    responses: {
      200: apiKeySchema,
      400: badRequestSchema,
      401: errorSchema,
      404: errorSchema,
    },
    summary: "Update API key name, contact, or expiry",
  },
  rotateApiKey: {
    method: "POST",
    path: "/api/v1/api-keys/:id/rotate",
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: createApiKeyResponseSchema,
      401: errorSchema,
      404: errorSchema,
    },
    summary:
      "Rotate API key secret (shown once); keeps id, name, scopes, contact, expiry",
  },
  revealApiKeySecret: {
    method: "GET",
    path: "/api/v1/api-keys/:id/secret",
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: revealApiKeySecretResponseSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Reveal the full API key secret when stored encrypted (new keys only)",
  },
  revokeApiKey: {
    method: "DELETE",
    path: "/api/v1/api-keys/:id",
    pathParams: z.object({ id: z.string() }),
    body: null,
    responses: {
      204: c.noBody(),
      401: errorSchema,
      404: errorSchema,
    },
    summary: "Revoke API key (Clerk session)",
  },
  upsertDevicePushToken: {
    method: "PUT",
    path: "/api/v1/devices/push-token",
    body: s.upsertDevicePushTokenSchema,
    responses: {
      200: z.object({ ok: z.literal(true) }),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Register or refresh a device push token (Clerk user)",
  },
  deleteDevicePushToken: {
    method: "DELETE",
    path: "/api/v1/devices/push-token",
    body: s.deleteDevicePushTokenSchema,
    responses: {
      200: z.object({ ok: z.literal(true) }),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Unregister a device push token (Clerk user)",
  },
  /**
   * @deprecated DEAD — legacy Linear-style sync. Kept for storage-health
   * probes. Do not build new clients against this. Use PowerSync upload
   * (`POST /api/v1/powersync/write`) instead.
   */
  syncBootstrap: {
    method: "POST",
    path: "/api/v1/sync/bootstrap",
    body: null,
    responses: { 200: s.syncBootstrapSchema, 401: errorSchema },
    summary: "[DEAD] Legacy sync bootstrap — storage-health only",
  },
  /**
   * @deprecated DEAD — legacy Linear-style sync. Kept for storage-health
   * probes. Do not build new clients against this.
   */
  syncPull: {
    method: "GET",
    path: "/api/v1/sync/pull",
    query: z.object({
      cursor: z.coerce.number().int().nonnegative().optional(),
    }),
    responses: {
      200: s.syncPullSchema,
      400: badRequestSchema,
      401: errorSchema,
    },
    summary: "[DEAD] Legacy sync pull — storage-health only",
  },
  /**
   * @deprecated DEAD — legacy Linear-style sync. Kept for storage-health
   * probes. Do not build new clients against this.
   */
  syncPush: {
    method: "POST",
    path: "/api/v1/sync/push",
    body: s.syncPushSchema,
    responses: {
      200: s.syncPushResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      404: errorSchema,
    },
    summary: "[DEAD] Legacy sync push — storage-health only",
  },
  getPowerSyncCredentials: {
    method: "GET",
    path: "/api/v1/powersync/token",
    responses: {
      200: s.powerSyncCredentialsSchema,
      401: errorSchema,
      503: errorSchema,
    },
    summary: "Get short-lived PowerSync credentials",
  },
  powerSyncWrite: {
    method: "POST",
    path: "/api/v1/powersync/write",
    body: s.powerSyncWriteSchema,
    responses: {
      200: s.okSchema,
      400: badRequestSchema,
      401: errorSchema,
      404: errorSchema,
    },
    summary: "Apply a PowerSync write batch",
  },
  opsSyncHealth: {
    method: "GET",
    path: "/api/v1/ops/sync-health",
    responses: {
      200: s.opsSyncHealthSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Owner ops: sync cursor + recent devices",
  },
  opsLogs: {
    method: "GET",
    path: "/api/v1/ops/logs",
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
    responses: {
      200: s.opsLogsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Owner ops: recent process log tail",
  },
  listRecurringTasks: {
    method: "GET",
    path: "/api/v1/ops/recurring-tasks",
    responses: {
      200: z.object({ recurringTasks: z.array(s.recurringTaskSchema) }),
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Owner ops: list recurring task templates",
  },
  createRecurringTask: {
    method: "POST",
    path: "/api/v1/ops/recurring-tasks",
    body: s.createRecurringTaskSchema,
    responses: {
      201: s.recurringTaskSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Owner ops: create a recurring task template",
  },
  updateRecurringTask: {
    method: "PATCH",
    path: "/api/v1/ops/recurring-tasks/:id",
    pathParams: z.object({ id: z.string() }),
    body: s.updateRecurringTaskSchema,
    responses: {
      200: s.recurringTaskSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Owner ops: update a recurring task template",
  },
  deleteRecurringTask: {
    method: "DELETE",
    path: "/api/v1/ops/recurring-tasks/:id",
    pathParams: z.object({ id: z.string() }),
    responses: {
      204: z.void(),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Owner ops: soft-delete a recurring task template",
  },
});
