/**
 * Shared agent search / retrieve execution with short-TTL caching (OS-76).
 *
 * Used by GET /search, GET /documents/retrieve, and POST /search/batch so
 * chained agent lookups in one turn do not always pay full per-call cost.
 */

import type {
  DocumentSearchResult,
  DocumentType,
  SearchResult,
  TaskSearchResult,
} from "@backsteros/contracts";

import { ListQueryError } from "../lib/list-query.js";
import { AgentReadCache, stableCacheKey } from "../lib/agent-read-cache.js";
import { resolveProjectRef } from "../lib/entity-refs.js";
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

export function clearAgentSearchCachesForTests(): void {
  searchCache.clear();
  retrieveCache.clear();
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
  const cacheKey = stableCacheKey({
    op: "search",
    workspaceId: input.workspaceId,
    q: input.q,
    type: input.type ?? null,
    projectId: input.projectId ?? null,
    statuses: input.statuses ?? [],
    limit: input.limit ?? 20,
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
        limit: input.limit,
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

    const docsPromise = documentService.searchDocuments({
      workspaceId: input.workspaceId,
      q: input.q,
      type: docType,
      projectId,
      limit: input.limit,
    });

    if (!input.includeTasks) {
      const rows = await docsPromise;
      return { results: rows.map(toSearchResult) as AgentSearchHit[] };
    }

    const [rows, taskPage] = await Promise.all([
      docsPromise,
      taskProjectService.searchTasks({
        workspaceId: input.workspaceId,
        q: input.q,
        projectId,
        statuses: input.statuses?.length ? input.statuses : undefined,
        limit: input.limit,
      }),
    ]);

    const docs = rows.map(toSearchResult) as DocumentSearchResult[];
    const tasks = taskPage.results as TaskSearchResult[];
    return {
      results: [...docs, ...tasks] as AgentSearchHit[],
      nextCursor: taskPage.nextCursor,
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
  const cacheKey = stableCacheKey({
    op: "retrieve",
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
