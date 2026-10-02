/**
 * Shared agent search / retrieve execution with short-TTL caching (OS-76).
 *
 * Used by GET /search, GET /documents/retrieve, and POST /search/batch so
 * chained agent lookups in one turn do not always pay full per-call cost.
 *
 * `include=task` pagination: document hits are only on the first page (no
 * cursor). A present `cursor` paginates tasks only. Combined first-page hits
 * are ranked by `updatedAt` desc and capped at `limit`.
 */

import type {
  DocumentSearchResult,
  DocumentType,
  SearchResult,
  TaskSearchResult,
} from "@backsteros/contracts";

import { ListQueryError } from "../lib/list-query.js";
import { AgentReadCache, stableCacheKey } from "../lib/agent-read-cache.js";
import {
  bumpAgentSearchCache,
  clearAgentSearchCacheEpochsForTests,
  getAgentSearchCacheEpoch,
} from "../lib/agent-search-cache.js";
import { resolveProjectRef } from "../lib/entity-refs.js";
import { encodeUpdatedAtCursor } from "../lib/list-query.js";
import { toSearchResult } from "../lib/mappers.js";
import * as documentService from "./documents.js";
import * as taskProjectService from "./tasks-projects.js";

export type AgentSearchHit = SearchResult;
export type AgentRetrievePayload = {
  results: Awaited<
    ReturnType<typeof documentService.retrieveDocuments>
  >["results"];
  budget: number;
  truncated: boolean;
  skipped: number;
};

export type AgentSearchPayload = {
  results: AgentSearchHit[];
  nextCursor?: string | null;
};

const searchCache = new AgentReadCache<AgentSearchPayload>({
  ttlMs: 15_000,
  maxEntries: 256,
});
const retrieveCache = new AgentReadCache<AgentRetrievePayload>({
  ttlMs: 15_000,
  maxEntries: 128,
});

export { bumpAgentSearchCache };

export function clearAgentSearchCachesForTests(): void {
  searchCache.clear();
  retrieveCache.clear();
  clearAgentSearchCacheEpochsForTests();
}

async function resolveOptionalProjectId(
  workspaceId: string,
  ref: string | undefined,
): Promise<string | undefined> {
  if (!ref) return undefined;
  const resolved = await resolveProjectRef(workspaceId, ref);
  if (!resolved) {
    throw new ListQueryError("Unknown project", "projectId");
  }
  return resolved;
}

/** Rank document + task hits by updatedAt desc, then id, and cap at limit. */
export function mergeIncludeTaskHits(
  docs: DocumentSearchResult[],
  tasks: TaskSearchResult[],
  limit: number,
): AgentSearchHit[] {
  const merged: AgentSearchHit[] = [...docs, ...tasks];
  merged.sort((a, b) => {
    const ta = Date.parse(a.updatedAt);
    const tb = Date.parse(b.updatedAt);
    if (tb !== ta) return tb - ta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return merged.slice(0, Math.max(0, limit));
}

function nextCursorAfterIncludedTasks(
  taskPage: { results: TaskSearchResult[]; nextCursor: string | null },
  includedTasks: TaskSearchResult[],
  nowMs: number,
): string | null {
  if (includedTasks.length === 0) {
    // Docs filled the merge window but tasks exist — continue from the start
    // of the task page (cursor just before the first task result).
    const first = taskPage.results[0];
    if (!first) return null;
    // Cursor means "rows strictly after this point". Encode a point just newer
    // than the first task so the next page includes it.
    const firstMs = Date.parse(first.updatedAt);
    return encodeUpdatedAtCursor(
      {
        id: "",
        updatedAt: new Date(firstMs + 1).toISOString(),
      },
      nowMs,
    );
  }

  const lastIncluded = includedTasks[includedTasks.length - 1]!;
  const lastIndex = taskPage.results.findIndex((t) => t.id === lastIncluded.id);
  const hasUnshownInPage =
    lastIndex >= 0 && lastIndex < taskPage.results.length - 1;
  if (hasUnshownInPage || taskPage.nextCursor) {
    return encodeUpdatedAtCursor(
      {
        id: lastIncluded.id,
        updatedAt: lastIncluded.updatedAt,
      },
      nowMs,
    );
  }
  return null;
}

export type RunAgentSearchInput = {
  workspaceId: string;
  q: string;
  type?: DocumentType | "task";
  projectId?: string;
  statuses?: string[];
  limit?: number;
  cursor?: string;
  /** When searching documents, also run task search and merge hits (OS-76). */
  includeTasks?: boolean;
};

export async function runAgentSearch(
  input: RunAgentSearchInput,
): Promise<AgentSearchPayload> {
  const limit = input.limit ?? 20;
  const epoch = getAgentSearchCacheEpoch(input.workspaceId);
  const cacheKey = stableCacheKey({
    op: "search",
    epoch,
    workspaceId: input.workspaceId,
    q: input.q,
    type: input.type ?? null,
    projectId: input.projectId ?? null,
    statuses: input.statuses ?? [],
    limit,
    cursor: input.cursor ?? null,
    includeTasks: Boolean(input.includeTasks),
  });

  return searchCache.getOrLoad(cacheKey, async () => {
    const projectId = await resolveOptionalProjectId(
      input.workspaceId,
      input.projectId,
    );

    if (input.type === "task") {
      const { results, nextCursor } = await taskProjectService.searchTasks({
        workspaceId: input.workspaceId,
        q: input.q,
        projectId,
        statuses: input.statuses?.length ? input.statuses : undefined,
        limit,
        cursor: input.cursor,
      });
      return {
        results: results as AgentSearchHit[],
        nextCursor,
      };
    }

    const docType =
      input.type === "project" ||
      input.type === "knowledge" ||
      input.type === "journal"
        ? input.type
        : undefined;

    if (!input.includeTasks) {
      const rows = await documentService.searchDocuments({
        workspaceId: input.workspaceId,
        q: input.q,
        type: docType,
        projectId,
        limit,
      });
      return { results: rows.map(toSearchResult) as AgentSearchHit[] };
    }

    // include=task: document hits only on the first page (no cursor).
    // A cursor paginates tasks only so agents can follow nextCursor to the end.
    if (input.cursor?.trim()) {
      const { results, nextCursor } = await taskProjectService.searchTasks({
        workspaceId: input.workspaceId,
        q: input.q,
        projectId,
        statuses: input.statuses?.length ? input.statuses : undefined,
        limit,
        cursor: input.cursor,
      });
      return {
        results: results as AgentSearchHit[],
        nextCursor,
      };
    }

    const nowMs = Date.now();
    const [rows, taskPage] = await Promise.all([
      documentService.searchDocuments({
        workspaceId: input.workspaceId,
        q: input.q,
        type: docType,
        projectId,
        limit,
      }),
      taskProjectService.searchTasks({
        workspaceId: input.workspaceId,
        q: input.q,
        projectId,
        statuses: input.statuses?.length ? input.statuses : undefined,
        limit,
      }),
    ]);

    const docs = rows.map(toSearchResult) as DocumentSearchResult[];
    const tasks = taskPage.results as TaskSearchResult[];
    const results = mergeIncludeTaskHits(docs, tasks, limit);
    const includedTasks = results.filter(
      (hit): hit is TaskSearchResult => hit.type === "task",
    );

    return {
      results,
      nextCursor: nextCursorAfterIncludedTasks(
        { results: tasks, nextCursor: taskPage.nextCursor },
        includedTasks,
        nowMs,
      ),
    };
  });
}

export type RunAgentRetrieveInput = {
  workspaceId: string;
  q: string;
  propertyType?: string[];
  audience?: string[];
  status?: string[];
  project?: string[];
  budget?: number;
  limit?: number;
};

export async function runAgentRetrieve(
  input: RunAgentRetrieveInput,
): Promise<AgentRetrievePayload> {
  const epoch = getAgentSearchCacheEpoch(input.workspaceId);
  const cacheKey = stableCacheKey({
    op: "retrieve",
    epoch,
    workspaceId: input.workspaceId,
    q: input.q,
    propertyType: input.propertyType ?? [],
    audience: input.audience ?? [],
    status: input.status ?? [],
    project: input.project ?? [],
    budget: input.budget ?? null,
    limit: input.limit ?? null,
  });

  return retrieveCache.getOrLoad(cacheKey, async () => {
    const result = await documentService.retrieveDocuments(input);
    return {
      results: result.results,
      budget: result.budget,
      truncated: result.truncated,
      skipped: result.skipped,
    };
  });
}
