/**
 * Merged search routes (OS-73 / OS-76).
 *
 * Canonical path: `GET /api/v1/search` (agent document/task search + pagination).
 * Batch: `POST /api/v1/search/batch` — parallel search + document retrieve.
 * Alias: `GET /api/v1/global-search` → same module, multi-entity palette profile.
 * Task hits share key/status/projectId; palette task rows come from `searchTasks`.
 */
import type { Context, Hono } from "hono";

import {
  searchBatchRequestSchema,
  type SearchBatchQueryItem,
  type SearchBatchResponse,
} from "@backsteros/contracts";

import { requireScope } from "../middleware/auth.js";
import {
  ListQueryError,
  collectQueryParams,
  parseGlobalSearchQuery,
  parseSearchQuery,
} from "../lib/list-query.js";
import {
  parseExactMultiQueryValues,
  parseMultiQueryValues,
} from "../lib/document-property-filters.js";
import * as circleService from "../services/circle-domain.js";
import {
  runAgentRetrieve,
  runAgentSearch,
} from "../services/agent-search.js";
import {
  forbidden,
  getAuth,
  listQueryErrorBody,
  unauthorized,
} from "./route-helpers.js";

function parseStatusCsv(status: string | undefined): string[] {
  if (!status?.trim()) return [];
  return status
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

/** Agent search: type=task (paginated) or document types (+ optional include=task). */
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

  try {
    const payload = await runAgentSearch({
      workspaceId: auth.workspaceId,
      q: parsed.q,
      type: parsed.type,
      projectId: parsed.projectId,
      statuses: parsed.statuses.length ? parsed.statuses : undefined,
      limit: parsed.limit,
      cursor: parsed.cursor,
      includeTasks: parsed.includeTasks,
    });
    return c.json(payload);
  } catch (error) {
    if (error instanceof ListQueryError) {
      return c.json(listQueryErrorBody(error), 400);
    }
    throw error;
  }
}

async function runBatchItem(
  workspaceId: string,
  item: SearchBatchQueryItem,
): Promise<SearchBatchResponse["results"][number]> {
  try {
    if (item.kind === "retrieve") {
      const payload = await runAgentRetrieve({
        workspaceId,
        q: item.q,
        propertyType: parseMultiQueryValues(item.type),
        audience: parseMultiQueryValues(item.audience),
        status: parseMultiQueryValues(item.status),
        project: parseExactMultiQueryValues(item.project),
        budget: item.budget,
        limit: item.limit,
      });
      return {
        id: item.id,
        kind: "retrieve",
        results: payload.results,
        budget: payload.budget,
        truncated: payload.truncated,
        skipped: payload.skipped,
      };
    }

    const typeRaw = item.type;
    const type =
      typeRaw === "tasks"
        ? "task"
        : typeRaw === "task" ||
            typeRaw === "project" ||
            typeRaw === "knowledge" ||
            typeRaw === "journal"
          ? typeRaw
          : undefined;
    const includeTasks =
      item.include === "task" || item.include === "tasks"
        ? true
        : undefined;
    if (includeTasks && type === "task") {
      return {
        id: item.id,
        kind: "search",
        error: "include is only valid for document search",
        field: "include",
      };
    }

    const payload = await runAgentSearch({
      workspaceId,
      q: item.q,
      type,
      projectId: item.projectId,
      statuses: parseStatusCsv(item.status),
      limit: item.limit,
      cursor: item.cursor,
      includeTasks,
    });
    return {
      id: item.id,
      kind: "search",
      results: payload.results,
      nextCursor: payload.nextCursor ?? null,
    };
  } catch (error) {
    if (error instanceof ListQueryError) {
      return {
        id: item.id,
        kind: item.kind,
        error: error.message,
        field: error.field,
      };
    }
    throw error;
  }
}

async function handleSearchBatch(c: Context) {
  const auth = getAuth(c);
  if (!requireScope("search:query")(auth)) {
    return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
  }

  const parsed = searchBatchRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid request body",
        code: "bad_request" as const,
        field: parsed.error.issues[0]?.path.join(".") || "body",
      },
      400,
    );
  }
  const body = parsed.data;
  const needsDocumentsRead = body.queries.some((q) => q.kind === "retrieve");
  if (needsDocumentsRead && !requireScope("documents:read")(auth)) {
    return c.json(forbidden(), 403);
  }

  const results = await Promise.all(
    body.queries.map((item) => runBatchItem(auth.workspaceId, item)),
  );
  return c.json({ results } satisfies SearchBatchResponse);
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
  app.post("/api/v1/search/batch", handleSearchBatch);
  // Thin alias for callers (desktop/mobile command palette) that still use the old path.
  app.get("/api/v1/global-search", (c) => handleMergedSearch(c, "palette"));
}
