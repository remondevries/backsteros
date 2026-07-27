"use client";

import { useCallback, useMemo } from "react";
import type { GlobalSearchResult } from "@backsteros/contracts";
import {
  CommandPaletteView,
  type CommandPaletteHit,
} from "@backsteros/ui";

import { useConsoleApi } from "@/lib/api-context";
import {
  CONSOLE_COMMAND_DESTINATIONS,
  CONSOLE_GO_NAVIGATION_ITEMS,
  consolePathnameForPalette,
  mapConsoleSearchResults,
} from "@/lib/command-palette-search";

export function ConsoleCommandPalette({
  locationPath,
  selectedProjectId,
  selectedProjectName,
  codebaseProjectIds,
  onNavigate,
}: {
  locationPath: string;
  selectedProjectId: string | null;
  selectedProjectName: string | null;
  /** Project ids loaded for this console (`GET /projects?type=codebase`). */
  codebaseProjectIds: readonly string[];
  onNavigate: (href: string) => void;
}) {
  const { client } = useConsoleApi();

  const allowedProjectIds = useMemo(
    () => new Set(codebaseProjectIds),
    [codebaseProjectIds],
  );

  const pathname = useMemo(
    () => consolePathnameForPalette(locationPath, selectedProjectId),
    [locationPath, selectedProjectId],
  );

  const entityNames = useMemo(
    () => ({
      projectName: selectedProjectName,
    }),
    [selectedProjectName],
  );

  const resolveContextIds = useCallback(
    () => ({
      projectId: selectedProjectId,
    }),
    [selectedProjectId],
  );

  const search = useCallback(
    async (
      query: string,
      options?: { searchParams?: URLSearchParams },
    ): Promise<CommandPaletteHit[]> => {
      if (allowedProjectIds.size === 0) return [];

      const params =
        options?.searchParams ??
        new URLSearchParams({ q: query, limit: "20" });
      if (!params.has("q")) params.set("q", query);
      // Over-fetch a bit so client-side codebase filtering still fills the list.
      const requestedLimit = Number(params.get("limit") ?? "20");
      params.set(
        "limit",
        String(Math.min(100, Math.max(requestedLimit * 3, 40))),
      );

      // Prefer project/task modes; other product types aren't used here.
      const mode = params.get("mode");
      if (
        mode &&
        mode !== "all" &&
        mode !== "projects" &&
        mode !== "tasks"
      ) {
        return [];
      }

      const body = await client.requestJson<{
        results: GlobalSearchResult[];
      }>(`/api/v1/global-search?${params.toString()}`);

      return mapConsoleSearchResults(body.results, allowedProjectIds).slice(
        0,
        Number.isFinite(requestedLimit) ? requestedLimit : 20,
      );
    },
    [allowedProjectIds, client],
  );

  return (
    <CommandPaletteView
      navigate={onNavigate}
      pathname={pathname}
      entityNames={entityNames}
      resolveContextIds={resolveContextIds}
      search={search}
      goItems={CONSOLE_GO_NAVIGATION_ITEMS}
      destinations={CONSOLE_COMMAND_DESTINATIONS}
    />
  );
}
