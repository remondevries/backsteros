/**
 * Local scaffold storage for Support center Group / Individual lists.
 * Replace with document metadata persistence when the API field lands.
 *
 * Snapshots for `useSyncExternalStore` must be referentially stable when
 * unchanged — otherwise React hits “Maximum update depth exceeded”.
 */

import {
  HELP_ARTICLE_AUDIENCE_GROUP,
  HELP_ARTICLE_AUDIENCE_INDIVIDUAL,
  normalizeHelpArticleAudience,
  type HelpArticleAudience,
} from "./help-article-properties.js";
import {
  collectHelpArticleIndividualTreeIds,
  findHelpArticleIndividualRoot,
  isHelpArticleIndividualRootFolder,
} from "./help-article-individual-folder.js";
import type { KnowledgeListItem } from "../navigation/entity-routes.js";

const SCOPE_STORAGE_KEY = "backsteros.spaces.support.list-scope";
const AUDIENCE_MAP_STORAGE_KEY = "backsteros.spaces.support.article-audience";

const scopeListeners = new Set<() => void>();
const audienceListeners = new Set<() => void>();

const EMPTY_AUDIENCE_MAP: Record<string, HelpArticleAudience> = Object.freeze(
  {},
) as Record<string, HelpArticleAudience>;

let cachedAudienceRaw: string | null = null;
let cachedAudienceMap: Record<string, HelpArticleAudience> = EMPTY_AUDIENCE_MAP;
let cachedScope: HelpArticleAudience | null = null;

function readJsonMap(key: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeJsonMap(key: string, value: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

function emit(listeners: Set<() => void>) {
  for (const listener of listeners) listener();
}

function parseAudienceMap(
  raw: string | null,
): Record<string, HelpArticleAudience> {
  if (!raw) return EMPTY_AUDIENCE_MAP;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return EMPTY_AUDIENCE_MAP;
    }
    const next: Record<string, HelpArticleAudience> = {};
    for (const [id, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof value !== "string") continue;
      next[id] = normalizeHelpArticleAudience(value);
    }
    return Object.keys(next).length === 0 ? EMPTY_AUDIENCE_MAP : next;
  } catch {
    return EMPTY_AUDIENCE_MAP;
  }
}

export function readHelpArticleListScope(): HelpArticleAudience {
  if (typeof window === "undefined") return HELP_ARTICLE_AUDIENCE_GROUP;
  try {
    const raw = window.localStorage.getItem(SCOPE_STORAGE_KEY);
    const next = normalizeHelpArticleAudience(raw);
    if (cachedScope === next) return cachedScope;
    cachedScope = next;
    return next;
  } catch {
    return HELP_ARTICLE_AUDIENCE_GROUP;
  }
}

export function writeHelpArticleListScope(scope: HelpArticleAudience) {
  if (typeof window === "undefined") return;
  const normalized = normalizeHelpArticleAudience(scope);
  if (cachedScope === normalized) return;
  try {
    window.localStorage.setItem(SCOPE_STORAGE_KEY, normalized);
  } catch {
    // ignore
  }
  cachedScope = normalized;
  emit(scopeListeners);
}

export function subscribeHelpArticleListScope(listener: () => void) {
  scopeListeners.add(listener);
  return () => {
    scopeListeners.delete(listener);
  };
}

export function readHelpArticleAudienceMap(): Record<
  string,
  HelpArticleAudience
> {
  if (typeof window === "undefined") return EMPTY_AUDIENCE_MAP;
  try {
    const raw = window.localStorage.getItem(AUDIENCE_MAP_STORAGE_KEY);
    if (raw === cachedAudienceRaw) return cachedAudienceMap;
    cachedAudienceRaw = raw;
    cachedAudienceMap = parseAudienceMap(raw);
    return cachedAudienceMap;
  } catch {
    return EMPTY_AUDIENCE_MAP;
  }
}

export function resolveHelpArticleAudience(
  documentId: string,
  map: Record<string, HelpArticleAudience> = readHelpArticleAudienceMap(),
): HelpArticleAudience {
  return map[documentId] ?? HELP_ARTICLE_AUDIENCE_GROUP;
}

export function writeHelpArticleAudience(
  documentId: string,
  audience: HelpArticleAudience,
) {
  const normalized = normalizeHelpArticleAudience(audience);
  const previous = resolveHelpArticleAudience(documentId);
  if (previous === normalized) return;

  const map = readJsonMap(AUDIENCE_MAP_STORAGE_KEY);
  map[documentId] = normalized;
  writeJsonMap(AUDIENCE_MAP_STORAGE_KEY, map);
  // Keep snapshot cache aligned with storage before notifying subscribers so
  // getSnapshot never returns a cleared EMPTY map mid-update.
  const raw = JSON.stringify(map);
  cachedAudienceRaw = raw;
  cachedAudienceMap = parseAudienceMap(raw);
  emit(audienceListeners);
}

export function subscribeHelpArticleAudienceMap(listener: () => void) {
  audienceListeners.add(listener);
  return () => {
    audienceListeners.delete(listener);
  };
}

/**
 * Split Support center trees by Group / Individual.
 *
 * Group — hide `_individual` and everything under it; keep other folders and
 * group-audience documents.
 * Individual — show only the `_individual` subtree (root folder omitted so its
 * children appear at the panel root); keep individual-audience documents.
 */
export function filterDocumentsForHelpArticleScope(
  documents: readonly KnowledgeListItem[],
  scope: HelpArticleAudience,
  audienceById: Record<
    string,
    HelpArticleAudience
  > = readHelpArticleAudienceMap(),
): KnowledgeListItem[] {
  const individualRoot = findHelpArticleIndividualRoot(documents);
  const individualTreeIds = collectHelpArticleIndividualTreeIds(
    documents,
    individualRoot?.id ?? null,
  );

  if (scope === HELP_ARTICLE_AUDIENCE_INDIVIDUAL) {
    if (!individualRoot) return [];
    return documents
      .filter((doc) => {
        if (doc.id === individualRoot.id) return false;
        if (!individualTreeIds.has(doc.id)) return false;
        if (doc.kind === "folder") return true;
        return (
          resolveHelpArticleAudience(doc.id, audienceById) ===
          HELP_ARTICLE_AUDIENCE_INDIVIDUAL
        );
      })
      .map((doc) =>
        doc.parentId === individualRoot.id ? { ...doc, parentId: null } : doc,
      );
  }

  return documents.filter((doc) => {
    if (isHelpArticleIndividualRootFolder(doc)) return false;
    if (individualTreeIds.has(doc.id)) return false;
    if (doc.kind === "folder") return true;
    return (
      resolveHelpArticleAudience(doc.id, audienceById) ===
      HELP_ARTICLE_AUDIENCE_GROUP
    );
  });
}
