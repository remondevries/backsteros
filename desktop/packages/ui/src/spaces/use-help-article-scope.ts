"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { HelpArticleAudience } from "./help-article-properties.js";
import {
  readHelpArticleAudienceMap,
  readHelpArticleListScope,
  subscribeHelpArticleAudienceMap,
  subscribeHelpArticleListScope,
  writeHelpArticleAudience,
  writeHelpArticleListScope,
} from "./help-article-scope-storage.js";

export function useHelpArticleListScope(): [
  HelpArticleAudience,
  (scope: HelpArticleAudience) => void,
] {
  const scope = useSyncExternalStore(
    subscribeHelpArticleListScope,
    readHelpArticleListScope,
    readHelpArticleListScope,
  );
  const setScope = useCallback((next: HelpArticleAudience) => {
    writeHelpArticleListScope(next);
  }, []);
  return [scope, setScope];
}

export function useHelpArticleAudienceMap(): Record<
  string,
  HelpArticleAudience
> {
  return useSyncExternalStore(
    subscribeHelpArticleAudienceMap,
    readHelpArticleAudienceMap,
    readHelpArticleAudienceMap,
  );
}

export function useWriteHelpArticleAudience() {
  return useCallback((documentId: string, audience: HelpArticleAudience) => {
    writeHelpArticleAudience(documentId, audience);
  }, []);
}
