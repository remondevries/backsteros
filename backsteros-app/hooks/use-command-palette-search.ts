"use client";

import type { GlobalSearchResult } from "@backsteros/contracts";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAppApi } from "@/lib/api-context";
import {
  buildCommandPaletteContextBreadcrumb,
  peelRouteSearchContext,
} from "@/lib/command-palette/context-breadcrumb";
import {
  activateFilterModeFromTab,
  applyAllModeInputChange,
  applyScopedModeInputChange,
  createDefaultCommandPaletteFilterState,
  isScopedFilterMode,
} from "@/lib/command-palette/filter";
import {
  appendCommandPaletteSearchParams,
  resolveCommandPaletteSearchContext,
  type CommandPaletteSearchContext,
} from "@/lib/command-palette/search-context";
import {
  commandPaletteSectionsForMode,
  sectionForSearchResultType,
  type CommandPaletteResultSection,
} from "@/lib/command-palette/types";

import {
  useCommandPaletteContextNames,
  useResolvedSearchContextIds,
} from "@/hooks/use-command-palette-context-names";

function withResolvedIds(
  context: CommandPaletteSearchContext | null,
  ids: {
    projectId: string | null;
    contactId: string | null;
    organizationId: string | null;
  },
): CommandPaletteSearchContext | null {
  if (!context) return null;

  if (context.kind === "project") {
    return { ...context, projectId: ids.projectId ?? undefined };
  }
  if (context.kind === "contact") {
    return { ...context, contactId: ids.contactId ?? undefined };
  }
  if (context.kind === "organization") {
    return { ...context, organizationId: ids.organizationId ?? undefined };
  }
  return context;
}

export function useCommandPaletteSearch({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const { client } = useAppApi();
  const entityNames = useCommandPaletteContextNames();
  const resolvedIds = useResolvedSearchContextIds(pathname);

  const [filterState, setFilterState] = useState(
    createDefaultCommandPaletteFilterState,
  );
  const [manualContext, setManualContext] =
    useState<CommandPaletteSearchContext | null>(null);
  const [contextDismissed, setContextDismissed] = useState(false);
  const [routeContextOverride, setRouteContextOverride] =
    useState<CommandPaletteSearchContext | null>(null);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const searchContext = useMemo(
    () => resolveCommandPaletteSearchContext(pathname, entityNames),
    [pathname, entityNames],
  );

  const effectiveRouteContext = routeContextOverride ?? searchContext;

  const activeSearchContext = withResolvedIds(
    manualContext ??
      (filterState.mode === "all" && !contextDismissed
        ? effectiveRouteContext
        : null),
    resolvedIds,
  );

  const filterMode = filterState.mode;
  const searchTerm = filterState.searchTerm;
  const activeSections = useMemo(
    () => commandPaletteSectionsForMode(filterMode),
    [filterMode],
  );

  const setSearchTerm = useCallback((value: string) => {
    setFilterState((current) => {
      if (current.mode === "all") {
        return applyAllModeInputChange(value, current) ?? current;
      }

      return applyScopedModeInputChange(value, current) ?? current;
    });
  }, []);

  const clearAllContextLayers = useCallback(() => {
    setFilterState(createDefaultCommandPaletteFilterState());
    setManualContext(null);
    setRouteContextOverride(null);
    setContextDismissed(true);
  }, []);

  const peelContextLayer = useCallback((): boolean => {
    if (manualContext) {
      setManualContext(null);
      return true;
    }

    if (isScopedFilterMode(filterState.mode)) {
      setFilterState(createDefaultCommandPaletteFilterState());
      return true;
    }

    if (
      !contextDismissed &&
      effectiveRouteContext &&
      filterState.mode === "all"
    ) {
      const peeled = peelRouteSearchContext(effectiveRouteContext);
      if (peeled == null) {
        setRouteContextOverride(null);
        setContextDismissed(true);
        return true;
      }

      setRouteContextOverride(peeled);
      return true;
    }

    return false;
  }, [
    contextDismissed,
    effectiveRouteContext,
    filterState.mode,
    manualContext,
  ]);

  const handleTabKey = useCallback((): boolean => {
    if (filterState.mode !== "all") {
      return false;
    }

    const activated = activateFilterModeFromTab(filterState.searchTerm);
    if (!activated) {
      return false;
    }

    setFilterState(activated);
    return true;
  }, [filterState.mode, filterState.searchTerm]);

  const reset = useCallback(() => {
    setFilterState(createDefaultCommandPaletteFilterState());
    setManualContext(null);
    setRouteContextOverride(null);
    setContextDismissed(false);
    setResults([]);
    setLoading(false);
    setRemoteError(null);
  }, []);

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setContextDismissed(false);
    setRouteContextOverride(null);
  }

  const trimmedSearch = searchTerm.trim();

  const [prevTrimmedSearch, setPrevTrimmedSearch] = useState(trimmedSearch);
  if (enabled && trimmedSearch === "" && prevTrimmedSearch !== "") {
    setPrevTrimmedSearch("");
    setResults([]);
    setLoading(false);
    setRemoteError(null);
  } else if (trimmedSearch !== prevTrimmedSearch) {
    setPrevTrimmedSearch(trimmedSearch);
  }

  useEffect(() => {
    if (!enabled || trimmedSearch.length < 1) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setRemoteError(null);

      const params = new URLSearchParams({
        q: trimmedSearch,
        limit: "20",
      });
      appendCommandPaletteSearchParams(params, {
        mode: filterMode,
        context: activeSearchContext,
      });

      client
        .requestJson<{ results: GlobalSearchResult[] }>(
          `/api/v1/global-search?${params.toString()}`,
          { signal: controller.signal },
        )
        .then((response) => setResults(response.results))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setRemoteError(
            error instanceof Error ? error.message : "Search failed",
          );
          setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [activeSearchContext, client, enabled, filterMode, trimmedSearch]);

  const groupedResults = useMemo(() => {
    const grouped = Object.fromEntries(
      activeSections.map((section) => [section, [] as GlobalSearchResult[]]),
    ) as Record<CommandPaletteResultSection, GlobalSearchResult[]>;

    for (const result of results) {
      const section = sectionForSearchResultType(
        result.type,
        result.documentType ?? null,
      );
      if (!section) continue;
      if (!activeSections.includes(section)) continue;
      grouped[section].push(result);
    }

    return grouped;
  }, [activeSections, results]);

  const contextBreadcrumb = useMemo(
    () =>
      buildCommandPaletteContextBreadcrumb({
        filterMode,
        manualContext,
        routeContext: effectiveRouteContext,
        contextDismissed,
      }),
    [
      contextDismissed,
      effectiveRouteContext,
      filterMode,
      manualContext,
    ],
  );

  const hasContextLayers = contextBreadcrumb.length > 0;

  return {
    filterMode,
    searchTerm,
    setSearchTerm,
    clearAllContextLayers,
    peelContextLayer,
    handleTabKey,
    reset,
    groupedResults,
    activeSections,
    loading,
    remoteError,
    hasContextLayers,
    contextBreadcrumb,
    trimmedSearch,
  };
}
