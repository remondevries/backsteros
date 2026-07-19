"use client";

import type { GlobalSearchResult } from "@backsteros/contracts";
import {
  CommandPaletteView,
  getKnowledgeHref,
  getProjectDocumentHref,
  sectionForSearchResultType,
  type CommandPaletteHit,
} from "@backsteros/ui";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  useCommandPaletteContextNames,
  useResolvedSearchContextIds,
} from "@/hooks/use-command-palette-context-names";
import { useAppApi } from "@/lib/api-context";

function hrefForSearchResult(result: GlobalSearchResult): string {
  switch (result.type) {
    case "project":
      return `/projects/${result.id}`;
    case "task":
      return `/tasks/${result.id}`;
    case "document": {
      const path = result.path?.trim() || "";
      if (result.documentType === "knowledge") {
        return getKnowledgeHref(path);
      }
      if (result.projectId) {
        return getProjectDocumentHref(result.projectId, path);
      }
      return "/projects";
    }
    case "organization":
      return `/organizations/${result.id}`;
    case "contact":
      return `/contacts/${result.id}`;
    case "letter":
      return `/letters/${result.id}`;
    default:
      return "/";
  }
}

function mapSearchResults(results: GlobalSearchResult[]): CommandPaletteHit[] {
  return results
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
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const { client } = useAppApi();
  const entityNames = useCommandPaletteContextNames();
  const resolvedIds = useResolvedSearchContextIds(pathname);

  const search = useCallback(
    async (
      query: string,
      options?: { searchParams?: URLSearchParams },
    ): Promise<CommandPaletteHit[]> => {
      const params =
        options?.searchParams ??
        new URLSearchParams({ q: query, limit: "20" });
      if (!params.has("q")) params.set("q", query);
      if (!params.has("limit")) params.set("limit", "20");

      const response = await client.requestJson<{
        results: GlobalSearchResult[];
      }>(`/api/v1/global-search?${params.toString()}`);
      return mapSearchResults(response.results);
    },
    [client],
  );

  const resolveContextIds = useMemo(
    () => () => ({
      projectId: resolvedIds.projectId,
      contactId: resolvedIds.contactId,
      organizationId: resolvedIds.organizationId,
    }),
    [resolvedIds],
  );

  return (
    <CommandPaletteView
      navigate={(href) => router.push(href)}
      pathname={pathname}
      entityNames={entityNames}
      resolveContextIds={resolveContextIds}
      search={search}
    />
  );
}
