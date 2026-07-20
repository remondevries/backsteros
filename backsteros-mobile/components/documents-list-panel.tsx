import type { Document } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

import { documentDetailHref } from "../lib/detail-href";
import { getMobileEnvironment } from "../lib/env";
import { matchesListSearch, normalizeListSearchQuery } from "../lib/list-search";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { usePullToRevealSearch } from "../lib/use-pull-to-reveal-search";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { DocumentIcon } from "./document-icon";
import { FolderIcon } from "./folder-icon";
import { ListSearchField } from "./list-search-field";

export type DocumentRow = {
  id: string;
  title: string | null;
  path: string | null;
  kind: string | null;
  parent_id: string | null;
  snippet: string | null;
};

type DocumentListType = "project" | "knowledge";

type Props = {
  documentType: DocumentListType;
  projectId?: string;
  emptyMessage: string;
  /** When true (knowledge), include folders and indent by tree depth. */
  includeFolders?: boolean;
  /** When true, show floating list search above the tab bar. */
  showListSearch?: boolean;
};

type VisibleRow = DocumentRow & { depth: number };

function sortDocuments(rows: DocumentRow[]): DocumentRow[] {
  return [...rows].sort((left, right) => {
    const leftFolder = left.kind === "folder" ? 0 : 1;
    const rightFolder = right.kind === "folder" ? 0 : 1;
    if (leftFolder !== rightFolder) return leftFolder - rightFolder;
    return (left.path || left.title || "").localeCompare(
      right.path || right.title || "",
      undefined,
      { sensitivity: "base" },
    );
  });
}

function documentsQuery(
  documentType: DocumentListType,
  projectId: string | undefined,
  includeFolders: boolean,
): { sql: string; params: readonly unknown[] } {
  const folderFilter = includeFolders
    ? ""
    : "AND (kind IS NULL OR kind != 'folder')";
  if (documentType === "knowledge") {
    return {
      sql: `SELECT id, title, path, kind, parent_id, snippet FROM documents
       WHERE deleted_at IS NULL
         AND type = 'knowledge'
         ${folderFilter}
       ORDER BY path ASC, title ASC`,
      params: [],
    };
  }
  return {
    sql: `SELECT id, title, path, kind, parent_id, snippet FROM documents
       WHERE deleted_at IS NULL
         AND type = 'project'
         AND project_id = ?
         ${folderFilter}
       ORDER BY path ASC, title ASC`,
    params: [projectId ?? ""],
  };
}

function documentsRestPath(documentType: DocumentListType, projectId?: string) {
  if (documentType === "knowledge") {
    return "/api/v1/documents?type=knowledge";
  }
  return `/api/v1/documents?type=project&projectId=${encodeURIComponent(projectId ?? "")}`;
}

function buildVisibleRows(
  rows: DocumentRow[],
  includeFolders: boolean,
  collapsedFolderIds: ReadonlySet<string>,
): VisibleRow[] {
  if (!includeFolders) {
    return rows.map((row) => ({ ...row, depth: 0 }));
  }

  const byParent = new Map<string | null, DocumentRow[]>();
  for (const row of rows) {
    const parentKey = row.parent_id ?? null;
    const bucket = byParent.get(parentKey) ?? [];
    bucket.push(row);
    byParent.set(parentKey, bucket);
  }
  for (const bucket of byParent.values()) {
    sortDocuments(bucket);
  }

  const visible: VisibleRow[] = [];

  function walk(parentId: string | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      visible.push({ ...child, depth });
      if (child.kind === "folder" && !collapsedFolderIds.has(child.id)) {
        walk(child.id, depth + 1);
      }
    }
  }

  walk(null, 0);
  return visible;
}

function filterDocumentsForSearch(
  rows: DocumentRow[],
  searchQuery: string,
): DocumentRow[] {
  const needle = normalizeListSearchQuery(searchQuery);
  if (!needle) return rows;

  const matchingIds = new Set(
    rows
      .filter((row) =>
        matchesListSearch(searchQuery, row.title, row.path, row.snippet),
      )
      .map((row) => row.id),
  );
  if (matchingIds.size === 0) return [];

  const byId = new Map(rows.map((row) => [row.id, row]));
  const keep = new Set<string>();
  for (const id of matchingIds) {
    let current: DocumentRow | undefined = byId.get(id);
    while (current) {
      if (keep.has(current.id)) break;
      keep.add(current.id);
      current = current.parent_id
        ? byId.get(current.parent_id)
        : undefined;
    }
  }
  return rows.filter((row) => keep.has(row.id));
}

/** Flat / tree documents list — desktop project / knowledge document list parity. */
export function DocumentsListPanel({
  documentType,
  projectId,
  emptyMessage,
  includeFolders = false,
  showListSearch = false,
}: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const { apiUrl } = getMobileEnvironment();
  const search = usePullToRevealSearch();
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );

  const { sql: docsSql, params: docsParams } = useMemo(
    () => documentsQuery(documentType, projectId, includeFolders),
    [documentType, includeFolders, projectId],
  );

  const mapNetworkError = useCallback(
    (reason: unknown): never => {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      throw new Error(
        /network request failed|failed to fetch|could not connect/i.test(detail)
          ? `Cannot reach API at ${apiUrl}. Is backsteros-api running?`
          : detail,
      );
    },
    [apiUrl],
  );

  const {
    rows: sourceRows,
    loading,
    error,
    useRest,
    restLoading,
    reload,
  } = useSyncedOrRest<DocumentRow, DocumentRow>({
    sql: docsSql,
    params: docsParams,
    mapLocal: (synced) => sortDocuments(synced),
    fetchRest: async () => {
      if (documentType === "project" && !projectId) return [];
      try {
        const body = await client.requestJson<{ documents: Document[] }>(
          documentsRestPath(documentType, projectId),
        );
        return sortDocuments(
          (body.documents ?? [])
            .filter((document) =>
              includeFolders ? true : document.kind !== "folder",
            )
            .map((document) => ({
              id: document.id,
              title: document.title,
              path: document.path,
              kind: document.kind,
              parent_id: document.parentId,
              snippet: document.snippet,
            })),
        );
      } catch (reason) {
        return mapNetworkError(reason);
      }
    },
  });

  const filteredSourceRows = useMemo(
    () =>
      showListSearch
        ? filterDocumentsForSearch(sourceRows, search.query)
        : sourceRows,
    [search.query, showListSearch, sourceRows],
  );

  const searching =
    showListSearch && normalizeListSearchQuery(search.query).length > 0;

  const rows = useMemo(
    () =>
      buildVisibleRows(
        filteredSourceRows,
        includeFolders,
        searching ? new Set() : collapsedFolderIds,
      ),
    [collapsedFolderIds, filteredSourceRows, includeFolders, searching],
  );

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (error) {
    return <Text style={ui.error}>{error}</Text>;
  }

  return (
    <View style={ui.screen}>
      {showListSearch && search.visible ? (
        <ListSearchField
          ref={search.inputRef}
          value={search.query}
          onChangeText={search.setQuery}
          onBlur={search.closeIfEmpty}
          autoFocus
          placeholder="Search documents"
        />
      ) : null}
      <FlatList
        style={ui.screen}
        data={rows}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        alwaysBounceVertical={showListSearch}
        onScroll={showListSearch ? search.onScroll : undefined}
        onScrollEndDrag={showListSearch ? search.onScrollEndDrag : undefined}
        scrollEventThrottle={showListSearch ? 16 : undefined}
        refreshControl={
          <RefreshControl
            refreshing={useRest ? restLoading : false}
            onRefresh={() => {
              if (showListSearch) search.open();
              void reload();
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
        ListEmptyComponent={
          <Text style={ui.empty}>
            {searching ? "No matching documents." : emptyMessage}
          </Text>
        }
        renderItem={({ item }) => {
          const title = item.title?.trim() || item.path || "Untitled";
          const isFolder = item.kind === "folder";
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={title}
              onPress={() => {
                if (isFolder) {
                  if (searching) return;
                  setCollapsedFolderIds((current) => {
                    const next = new Set(current);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  });
                  return;
                }
                router.push(documentDetailHref(item.id));
              }}
              style={({ pressed }) => [
                ui.row,
                { paddingLeft: 16 + item.depth * 16 },
                pressed ? { backgroundColor: colors.rowPressed } : null,
              ]}
            >
              <View style={ui.rowIcon}>
                {isFolder ? (
                  <FolderIcon size={18} color={colors.foreground} />
                ) : (
                  <DocumentIcon size={18} color={colors.foreground} />
                )}
              </View>
              <View style={ui.rowBody}>
                <Text style={ui.rowTitle} numberOfLines={1}>
                  {title}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
