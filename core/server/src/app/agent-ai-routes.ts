/**
 * Agent PTY, AI, workspace settings PATCH, and mentions (OS-73 split).
 */
import type { Hono } from "hono";
import { z } from "zod";

import {
  spellcheckRequestSchema,
  researchRequestSchema,
} from "@backsteros/contracts";
import {
  AgentPtyUnavailableError,
  getAgentPtyConnection,
} from "../services/agent-pty.js";
import {
  researchText,
  SpellcheckError,
  spellcheckText,
} from "../services/cursor-spellcheck.js";
import * as circleService from "../services/circle-domain.js";
import * as cursorSettingsService from "../services/cursor-settings.js";
import { newId } from "../lib/crypto.js";
import {
  recordMentionRestSyncEvent,
  recordWorkspaceSettingRestSyncEvent,
} from "../services/sync.js";
import {
  buildMentionRestPayload,
  buildWorkspaceSettingRestPayload,
  commitRestEntityWrite,
  isRestLeaderFirstWrite,
} from "../services/rest-leader-write.js";
import {
  can,
  forbidden,
  getAuth,
  notFound,
} from "./route-helpers.js";

const { sanitizeWorkspaceSettings } = cursorSettingsService;

export function registerAgentAiRoutes(app: Hono) {
  app.get("/api/v1/agent-pty/connection", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    try {
      return c.json(getAgentPtyConnection());
    } catch (error) {
      if (error instanceof AgentPtyUnavailableError) {
        return c.json(
          { error: error.message, code: error.code },
          503,
        );
      }
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Agent terminal unavailable",
          code: "agent_pty_unavailable",
        },
        503,
      );
    }
  });
  app.post("/api/v1/ai/spellcheck", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const parsed = spellcheckRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid spellcheck request", code: "bad_request" }, 400);
    }
    try {
      return c.json(await spellcheckText(auth.workspaceId, parsed.data));
    } catch (error) {
      if (error instanceof SpellcheckError) {
        const status =
          error.code === "disabled" || error.code === "missing_key" ? 400 : 502;
        return c.json(
          {
            error: error.message,
            code: error.code === "upstream" ? "upstream_error" : "bad_request",
          },
          status,
        );
      }
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Spellcheck failed",
          code: "upstream_error",
        },
        502,
      );
    }
  });
  app.post("/api/v1/ai/research", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const parsed = researchRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid research request", code: "bad_request" }, 400);
    }
    try {
      return c.json(await researchText(auth.workspaceId, parsed.data));
    } catch (error) {
      if (error instanceof SpellcheckError) {
        const status =
          error.code === "disabled" || error.code === "missing_key" ? 400 : 502;
        return c.json(
          {
            error: error.message,
            code: error.code === "upstream" ? "upstream_error" : "bad_request",
          },
          status,
        );
      }
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Research failed",
          code: "upstream_error",
        },
        502,
      );
    }
  });
  app.patch("/api/v1/settings", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = z.record(z.unknown()).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid settings", code: "bad_request" }, 400);
    const sanitized = sanitizeWorkspaceSettings(parsed.data);
    if (process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") {
      delete sanitized.vaultPath;
    }
    if (isRestLeaderFirstWrite()) {
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "workspace_setting",
        entityId: auth.workspaceId,
        operation: "upsert",
        payload: buildWorkspaceSettingRestPayload(auth.workspaceId, sanitized),
      });
      const settings = sanitizeWorkspaceSettings(
        (await circleService.getSettings(auth.workspaceId)) as Record<
          string,
          unknown
        >,
      );
      return c.json({ settings });
    }
    const settings = sanitizeWorkspaceSettings(
      (await circleService.updateSettings(
        auth.workspaceId,
        sanitized,
      )) as Record<string, unknown>,
    );
    await recordWorkspaceSettingRestSyncEvent(auth.workspaceId, settings);
    return c.json({ settings });
  });

  app.get("/api/v1/mentions", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    return c.json({ mentions: await circleService.listMentions(auth.workspaceId, auth.userId) });
  });
  app.post("/api/v1/mentions", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const parsed = z.object({
      userId: z.string().nullable().optional(),
      sourceType: z.string().min(1).max(64),
      sourceId: z.string().min(1),
      excerpt: z.string().max(1000).optional(),
    }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid mention", code: "bad_request" }, 400);
    if (isRestLeaderFirstWrite()) {
      const mentionId = newId();
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "mention",
        entityId: mentionId,
        operation: "upsert",
        payload: buildMentionRestPayload(mentionId, parsed.data),
      });
      const row = await circleService.getMentionById(
        auth.workspaceId,
        mentionId,
      );
      if (!row) {
        return c.json({ error: "Mention create failed", code: "internal" }, 500);
      }
      return c.json(row, 201);
    }
    const row = await circleService.createMention(auth.workspaceId, parsed.data);
    await recordMentionRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(row, 201);
  });
  app.post("/api/v1/mentions/:id/read", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const mentionId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getMentionById(
        auth.workspaceId,
        mentionId,
      );
      if (!existing) return c.json(notFound("Mention"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "mention",
        entityId: mentionId,
        operation: "upsert",
        payload: buildMentionRestPayload(mentionId, {
          userId: existing.userId,
          sourceType: existing.sourceType,
          sourceId: existing.sourceId,
          excerpt: existing.excerpt,
          readAt: new Date().toISOString(),
          createdAt: existing.createdAt.toISOString(),
        }),
      });
      const row = await circleService.getMentionById(
        auth.workspaceId,
        mentionId,
      );
      return row ? c.json(row) : c.json(notFound("Mention"), 404);
    }
    const row = await circleService.markMentionRead(
      auth.workspaceId,
      mentionId,
    );
    if (!row) return c.json(notFound("Mention"), 404);
    await recordMentionRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(row);
  });
}
