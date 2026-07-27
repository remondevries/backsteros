"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { EMPTY_MENTION_CATALOG } from "./empty-catalog.js";
import { filterCatalogForTokens } from "./filter-catalog-for-tokens.js";
import { mergeMentionCatalogs } from "./merge-catalog.js";
import type {
  MentionCatalog,
  MentionSection,
  ParsedMentionToken,
} from "./mention-menu-types.js";
import { buildMentionSections } from "./search-catalog.js";
import { getMentionTokenCacheKey } from "./tokens.js";

export type MentionCatalogContextValue = {
  catalog: MentionCatalog;
  /** Resolve mention tokens into the live catalog (Next parity). */
  resolveTokens: (tokens: ParsedMentionToken[]) => void;
  /** Async search; defaults to filtering the live catalog. */
  searchSections: (query: string) => Promise<MentionSection[]>;
};

const MentionCatalogContext =
  createContext<MentionCatalogContextValue | null>(null);

/**
 * Host-provided mention catalog with Next-parity search + lazy token resolve.
 * Desktop passes a workspace-built catalog; optional `searchSections` overrides
 * local filtering (e.g. remote BFF).
 */
export function MentionCatalogProvider({
  children,
  catalog: catalogProp = EMPTY_MENTION_CATALOG,
  searchSections: searchSectionsProp,
}: {
  children: ReactNode;
  catalog?: MentionCatalog;
  searchSections?: (query: string) => Promise<MentionSection[]>;
}) {
  const [resolvedPatch, setResolvedPatch] =
    useState<MentionCatalog>(EMPTY_MENTION_CATALOG);
  const resolveInFlight = useRef<Promise<void> | null>(null);
  const pendingTokens = useRef<ParsedMentionToken[]>([]);
  const requestedTokenKeys = useRef(new Set<string>());
  const catalogPropRef = useRef(catalogProp);
  catalogPropRef.current = catalogProp;

  const catalog = useMemo(
    () => mergeMentionCatalogs(catalogProp, resolvedPatch),
    [catalogProp, resolvedPatch],
  );

  const flushResolve = useCallback(async function flushPendingTokens() {
    if (resolveInFlight.current) {
      return resolveInFlight.current;
    }

    const tokens = pendingTokens.current;
    pendingTokens.current = [];

    if (tokens.length === 0) {
      return;
    }

    const promise = Promise.resolve()
      .then(() => {
        const resolved = filterCatalogForTokens(catalogPropRef.current, tokens);
        setResolvedPatch((current) => mergeMentionCatalogs(current, resolved));
      })
      .finally(() => {
        if (resolveInFlight.current === promise) {
          resolveInFlight.current = null;
        }
        if (pendingTokens.current.length > 0) {
          void flushPendingTokens();
        }
      });

    resolveInFlight.current = promise;
    return promise;
  }, []);

  const resolveTokens = useCallback(
    (tokens: ParsedMentionToken[]) => {
      const unresolved = tokens.filter((token) => {
        const key = getMentionTokenCacheKey(token);
        if (requestedTokenKeys.current.has(key)) {
          return false;
        }
        requestedTokenKeys.current.add(key);
        return true;
      });

      if (unresolved.length === 0) {
        return;
      }

      pendingTokens.current.push(...unresolved);
      void flushResolve();
    },
    [flushResolve],
  );

  const searchSections = useCallback(
    async (query: string) => {
      if (searchSectionsProp) {
        return searchSectionsProp(query);
      }
      return buildMentionSections(catalog, query);
    },
    [catalog, searchSectionsProp],
  );

  const value = useMemo(
    () => ({
      catalog,
      resolveTokens,
      searchSections,
    }),
    [catalog, resolveTokens, searchSections],
  );

  return (
    <MentionCatalogContext.Provider value={value}>
      {children}
    </MentionCatalogContext.Provider>
  );
}

export function useMentionCatalog(): MentionCatalogContextValue {
  const context = useContext(MentionCatalogContext);
  if (!context) {
    throw new Error(
      "useMentionCatalog must be used within MentionCatalogProvider.",
    );
  }
  return context;
}

export function useMentionCatalogOptional(): MentionCatalogContextValue | null {
  return useContext(MentionCatalogContext);
}

/** Ask the provider to resolve mention tokens found in preview/editor content. */
export function useResolveMentionTokensInContent(
  tokens: ParsedMentionToken[],
): void {
  const resolveTokens = useMentionCatalogOptional()?.resolveTokens;
  const tokenKey = useMemo(
    () => tokens.map(getMentionTokenCacheKey).join("|"),
    [tokens],
  );

  useEffect(() => {
    if (!resolveTokens || tokens.length === 0) {
      return;
    }
    resolveTokens(tokens);
  }, [resolveTokens, tokenKey, tokens]);
}
