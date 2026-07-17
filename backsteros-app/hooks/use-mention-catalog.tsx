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

import type {
  MentionCatalog,
  MentionSection,
  ParsedMentionToken,
} from "@/lib/documents/mentions/mention-menu-types";
import { EMPTY_MENTION_CATALOG } from "@/lib/documents/mentions/empty-catalog";
import { mergeMentionCatalogs } from "@/lib/documents/mentions/merge-catalog";
import { getMentionTokenCacheKey } from "@/lib/documents/mentions/tokens";

type MentionCatalogContextValue = {
  catalog: MentionCatalog;
  resolveTokens: (tokens: ParsedMentionToken[]) => void;
  searchSections: (query: string) => Promise<MentionSection[]>;
};

const MentionCatalogContext = createContext<MentionCatalogContextValue | null>(
  null,
);

async function fetchResolvedCatalog(
  tokens: ParsedMentionToken[],
): Promise<MentionCatalog> {
  if (tokens.length === 0) {
    return EMPTY_MENTION_CATALOG;
  }

  try {
    const response = await fetch("/api/mentions/resolve", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens }),
    });

    if (!response.ok) {
      return EMPTY_MENTION_CATALOG;
    }

    const payload = (await response.json()) as { catalog?: MentionCatalog };
    return payload.catalog ?? EMPTY_MENTION_CATALOG;
  } catch {
    return EMPTY_MENTION_CATALOG;
  }
}

export function MentionCatalogProvider({
  children,
  initialCatalog = EMPTY_MENTION_CATALOG,
}: {
  children: ReactNode;
  initialCatalog?: MentionCatalog;
}) {
  const [catalog, setCatalog] = useState<MentionCatalog>(initialCatalog);
  const resolveInFlight = useRef<Promise<void> | null>(null);
  const pendingTokens = useRef<ParsedMentionToken[]>([]);
  const requestedTokenKeys = useRef(new Set<string>());

  const flushResolve = useCallback(async function flushPendingTokens() {
    if (resolveInFlight.current) {
      return resolveInFlight.current;
    }

    const tokens = pendingTokens.current;
    pendingTokens.current = [];

    if (tokens.length === 0) {
      return;
    }

    const promise = fetchResolvedCatalog(tokens)
      .then((resolved) => {
        setCatalog((current) => mergeMentionCatalogs(current, resolved));
      })
      .catch(() => {
        // Network failures should not surface as unhandled console TypeErrors.
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

  const searchSections = useCallback(async (query: string) => {
    try {
      const response = await fetch(
        `/api/mentions/search?q=${encodeURIComponent(query)}`,
        { credentials: "same-origin" },
      );

      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as { sections?: MentionSection[] };
      return payload.sections ?? [];
    } catch {
      return [];
    }
  }, []);

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

export function useMentionCatalog() {
  const context = useContext(MentionCatalogContext);
  if (!context) {
    throw new Error("useMentionCatalog must be used within MentionCatalogProvider.");
  }
  return context;
}

export function useMentionCatalogOptional() {
  return useContext(MentionCatalogContext);
}

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
