/**
 * Agent + command-palette search routes.
 * Task hits from `/search?type=task` and `/global-search` share key/status/projectId.
 */
import type { Context, Hono } from "hono";

import type { AuthContext } from "../middleware/auth.js";
import { requireScope } from "../middleware/auth.js";
import { resolveProjectRef } from "../lib/entity-refs.js";
import {
  ListQueryError,
  collectQueryParams,
  parseGlobalSearchQuery,
  parseSearchQuery,
} from "../lib/list-query.js";
import { toSearchResult } from "../lib/mappers.js";
import * as circleService from "../services/circle-domain.js";
import * as documentService from "../services/documents.js";
import * as taskProjectService from "../services/tasks-projects.js";

function getAuth(c: Context): AuthContext {
  return c.get("auth");
}

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

function forbidden() {
  return { error: "Insufficient scope", code: "forbidden" as const };
}

function listQueryErrorBody(error: ListQueryError) {
  return {
    error: error.message,
    code: error.code,
    field: error.field,
  };
}

async function requireResolvedProjectId(
  workspaceId: string,
  ref: string,
): Promise<string> {
  const resolved = await resolveProjectRef(workspaceId, ref);
  if (!resolved) {
    throw new ListQueryError("Unknown project", "projectId");
  }
  return resolved;
}

export function registerSearchRoutes(app: Hono) {
  app.get("/api/v1/global-search", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("search:query")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseGlobalSearchQuery(raw);
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }
    if (parsed.limitClamped) {
      c.header(
        "X-BacksterOS-Hint",
        "limit clamped to 100 (maximum for global-search).",
      );
    }

    return c.json({
      results: await circleService.globalSearch(
        auth.workspaceId,
        parsed.q,
        parsed.limit,
        {
          mode: parsed.mode,
          contextKind: parsed.contextKind,
          projectId: parsed.projectId,
          projectSection: parsed.projectSection,
          contactId: parsed.contactId,
          contactSection: parsed.contactSection,
          organizationId: parsed.organizationId,
          organizationSection: parsed.organizationSection,
        },
      ),
    });
  });

  app.get("/api/v1/search", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("search:query")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseSearchQuery(raw);
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }

    if (parsed.type === "task") {
      let projectId = parsed.projectId;
      if (projectId) {
        try {
          projectId = await requireResolvedProjectId(auth.workspaceId, projectId);
        } catch (error) {
          if (error instanceof ListQueryError) {
            return c.json(listQueryErrorBody(error), 400);
          }
          throw error;
        }
      }

      try {
        const { results, nextCursor } = await taskProjectService.searchTasks({
          workspaceId: auth.workspaceId,
          q: parsed.q,
          projectId,
          statuses: parsed.statuses.length ? parsed.statuses : undefined,
          limit: parsed.limit,
          cursor: parsed.cursor,
        });
        return c.json({ results, nextCursor });
      } catch (error) {
        if (error instanceof ListQueryError) {
          return c.json(listQueryErrorBody(error), 400);
        }
        throw error;
      }
    }

    const rows = await documentService.searchDocuments({
      workspaceId: auth.workspaceId,
      q: parsed.q,
      type: parsed.type,
      projectId: parsed.projectId,
      limit: parsed.limit,
    });

    return c.json({ results: rows.map(toSearchResult) });
  });
}
