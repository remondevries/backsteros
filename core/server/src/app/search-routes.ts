/**
 * Merged search routes (OS-73).
 *
 * Canonical path: `GET /api/v1/search` (agent document/task search + pagination).
 * Alias: `GET /api/v1/global-search` → same module, multi-entity palette profile.
 * Task hits share key/status/projectId; palette task rows come from `searchTasks`.
 */
import type { Context, Hono } from "hono";

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
import {
  forbidden,
  getAuth,
  listQueryErrorBody,
  unauthorized,
} from "./route-helpers.js";

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

/** Multi-entity command-palette search (formerly only on /global-search). */
async function handlePaletteSearch(c: Context) {
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
}

/** Agent search: type=task (paginated) or document types. */
async function handleAgentSearch(c: Context) {
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
}

/**
 * Single merged search implementation.
 * - `profile: "agent"` → /api/v1/search
 * - `profile: "palette"` → /api/v1/global-search (thin alias)
 */
async function handleMergedSearch(
  c: Context,
  profile: "agent" | "palette",
) {
  if (profile === "palette") {
    return handlePaletteSearch(c);
  }
  return handleAgentSearch(c);
}

export function registerSearchRoutes(app: Hono) {
  app.get("/api/v1/search", (c) => handleMergedSearch(c, "agent"));
  // Thin alias for callers (desktop/mobile command palette) that still use the old path.
  app.get("/api/v1/global-search", (c) => handleMergedSearch(c, "palette"));
}
