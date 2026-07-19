import {
  getKnowledgeHref,
  getProjectDocumentHref,
  getProjectsHref,
  sectionForSearchResultType,
  type CommandPaletteHit,
} from "@backsteros/ui";
import type { GlobalSearchResult } from "@backsteros/contracts";

import { useDesktopApi } from "./api-context";

export function hrefForSearchResult(result: GlobalSearchResult): string {
  switch (result.type) {
    case "project":
      return getProjectsHref(result.id);
    case "task":
      return `/tasks/${result.id}`;
    case "organization":
      return `/organizations/${encodeURIComponent(result.id)}`;
    case "contact":
      return `/contacts/${encodeURIComponent(result.id)}`;
    case "letter":
      return `/letters/${encodeURIComponent(result.id)}`;
    case "document": {
      const path = result.path?.trim() || result.id;
      if (result.documentType === "knowledge") {
        return getKnowledgeHref(path);
      }
      if (result.projectId) {
        return getProjectDocumentHref(result.projectId, path);
      }
      return "/projects";
    }
    default:
      return "/projects";
  }
}

export function useCommandPaletteSearchFn() {
  const { client } = useDesktopApi();

  return async (
    query: string,
    options?: { searchParams?: URLSearchParams },
  ): Promise<CommandPaletteHit[]> => {
    const params =
      options?.searchParams ??
      new URLSearchParams({ q: query, limit: "20" });
    if (!params.has("q")) params.set("q", query);
    if (!params.has("limit")) params.set("limit", "20");

    const body = await client.requestJson<{ results: GlobalSearchResult[] }>(
      `/api/v1/global-search?${params.toString()}`,
    );
    return body.results
      .map((result): CommandPaletteHit | null => {
        const section = sectionForSearchResultType(
          result.type,
          result.documentType ?? null,
        );
        if (!section) return null;
        return {
          id: result.id,
          type: result.type,
          title: result.title,
          subtitle: result.snippet,
          href: hrefForSearchResult(result),
          section,
        };
      })
      .filter((hit): hit is CommandPaletteHit => hit != null);
  };
}
