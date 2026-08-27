import type { Document } from "@backsteros/contracts";
import type { FlashListRef } from "@shopify/flash-list";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

import { isPadDevice } from "../lib/device";
import { documentDetailHref } from "../lib/detail-href";
import {
  compareDocumentTreeRows,
  documentMoveFolderOptions,
  documentSiblingRows,
  reorderSiblingIds,
} from "../lib/document-tree-actions";
import {
  moveDocumentViaPowerSyncOrApi,
  reorderDocumentsViaPowerSyncOrApi,
} from "../lib/document-mutations";
import { useMobileCoreApiUrl } from "../lib/api-url-context";
import { matchesListSearch, normalizeListSearchQuery } from "../lib/list-search";
import { useMobilePowerSync } from "../lib/powersync-context";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { normalizePathname } from "../lib/use-escape-back-navigation";
import { useListJkNavigation } from "../lib/use-list-jk-navigation";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { usePullToRevealSearch } from "../lib/use-pull-to-reveal-search";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { DocumentIcon } from "./document-icon";
import { FolderIcon } from "./folder-icon";
import { ContentPageTitle } from "./content-page-title";
import { ListSearchField } from "./list-search-field";
import { BacksterFlashList } from "./lists/index";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";

export type DocumentRow = {
  id: string;
  title: string | null;
  path: string | null;
  kind: string | null;
  parent_id: string | null;
  snippet: string | null;
  sort_order: number | null;
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
  /** Master-detail selection highlight (iPad). */
  selectedId?: string | null;
  /**
   * When true (iPad split), open the first document if none is selected.
   * Requires `sectionRoute` (e.g. `"knowledge"`).
   */
  autoSelectFirst?: boolean;
  /**
   * Nested section route for in-tab detail (`/(app)/knowledge/:id`).
   * When unset, opens root `/document/:id`.
   */
  sectionRoute?: "knowledge";
  /** Phone: in-content scrolling title (not sticky stack header). */
  pageTitle?: string;
  /** Pad page title for status bar when the native header is hidden. */
  pageTitleSafeArea?: boolean;
};

type VisibleRow = DocumentRow & { depth: number };

/** `/knowledge/<id>` → id / null. */
export function knowledgeSelectedIdFromPathname(
  pathname: string,
): string | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/knowledge\/([^/]+)$/);
  if (!match) return null;
  const segment = match[1];
  if (!segment || segment === "new") return null;
  return segment;
}

function sortDocuments(rows: DocumentRow[]): DocumentRow[] {
  return [...rows].sort(compareDocumentTreeRows);
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
      sql: `SELECT id, title, path, kind, parent_id, snippet, sort_order FROM documents
       WHERE deleted_at IS NULL
         AND type = 'knowledge'
         ${folderFilter}
       ORDER BY sort_order ASC, path ASC, title ASC`,
      params: [],
    };
  }
  return {
    sql: `SELECT id, title, path, kind, parent_id, snippet, sort_order FROM documents
       WHERE deleted_at IS NULL
         AND type = 'project'
         AND project_id = ?
         ${folderFilter}
       ORDER BY sort_order ASC, path ASC, title ASC`,
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

  const walk = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      visible.push({ ...child, depth });
      if (child.kind === "folder" && !collapsedFolderIds.has(child.id)) {
        walk(child.id, depth + 1);
      }
    }
  };
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
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
  }
  return rows.filter((row) => keep.has(row.id));
}

/**
 * Document / knowledge tree list — shared by project panels and Knowledge Base.
 */
export function DocumentsListPanel({
  documentType,
  projectId,
  emptyMessage,
  includeFolders = false,
  showListSearch = false,
  selectedId = null,
  autoSelectFirst = false,
  sectionRoute,
  pageTitle,
  pageTitleSafeArea = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { formatNetworkError, isNetworkError } = useMobileCoreApiUrl();
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const isPad = isPadDevice();
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(
    () => new Set<string>(),
  );
  const [movePickerItemId, setMovePickerItemId] = useState<string | null>(null);
  const [treeActionError, setTreeActionError] = useState<string | null>(null);

  const pathSelectedId =
    selectedId ??
    (sectionRoute === "knowledge"
      ? knowledgeSelectedIdFromPathname(pathname)
      : null);

  const mapNetworkError = useCallback(
    (reason: unknown): never => {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      throw new Error(
        isNetworkError(detail) ? formatNetworkError() : detail,
      );
    },
    [formatNetworkError, isNetworkError],
  );

  const { sql: docsSql, params: docsParams } = useMemo(
    () => documentsQuery(documentType, projectId, includeFolders),
    [documentType, includeFolders, projectId],
  );

  const {
    rows: sourceRows,
    loading,
    error,
    pullRefreshing,
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
              sort_order: document.sortOrder ?? 0,
            })),
        );
      } catch (reason) {
        return mapNetworkError(reason);
      }
    },
  });
  const search = usePullToRevealSearch({ suppress: pullRefreshing });

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

  const openDocument = useCallback(
    (id: string) => {
      if (sectionRoute) {
        const href = `/(app)/${sectionRoute}/${id}` as const;
        if (isPad) {
          router.replace(href);
          return;
        }
        router.push(href);
        return;
      }
      router.push(documentDetailHref(id));
    },
    [isPad, router, sectionRoute],
  );

  useEffect(() => {
    if (!autoSelectFirst || !isPad || !sectionRoute) return;
    if (loading || error) return;
    if (pathSelectedId) return;
    const normalized = normalizePathname(pathname);
    if (!normalized.startsWith(`/${sectionRoute}`)) return;
    if (
      normalized !== `/${sectionRoute}` &&
      !normalized.match(new RegExp(`^/${sectionRoute}/[^/]+$`))
    ) {
      return;
    }
    const firstDoc = filteredSourceRows.find((row) => row.kind !== "folder");
    if (!firstDoc) return;
    router.replace(`/(app)/${sectionRoute}/${firstDoc.id}`);
  }, [
    autoSelectFirst,
    error,
    filteredSourceRows,
    isPad,
    loading,
    pathSelectedId,
    pathname,
    router,
    sectionRoute,
  ]);

  const listRef = useRef<FlashListRef<VisibleRow>>(null);
  const itemIds = useMemo(() => rows.map((row) => row.id), [rows]);

  const activateRow = useCallback(
    (id: string) => {
      const item = rows.find((row) => row.id === id);
      if (!item) return;
      if (item.kind === "folder") {
        if (searching) return;
        setCollapsedFolderIds((current) => {
          const next = new Set(current);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
        return;
      }
      openDocument(item.id);
    },
    [openDocument, rows, searching],
  );

  const { highlightedId } = useListJkNavigation({
    itemIds,
    onActivate: activateRow,
    onHighlightChange: (_id, index) => {
      if (index < 0 || !listRef.current) return;
      try {
        listRef.current.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {
        // Ignore before layout.
      }
    },
  });

  const runTreeMutation = useCallback(
    async (action: () => Promise<void>) => {
      setTreeActionError(null);
      try {
        await action();
        await reload();
      } catch (reason) {
        setTreeActionError(
          reason instanceof Error ? reason.message : String(reason),
        );
      }
    },
    [reload],
  );

  const reorderItem = useCallback(
    (itemId: string, direction: "up" | "down") => {
      const siblings = documentSiblingRows(sourceRows, itemId);
      const orderedIds = reorderSiblingIds(siblings, itemId, direction);
      if (!orderedIds) return;
      void runTreeMutation(() =>
        reorderDocumentsViaPowerSyncOrApi(client, powerSync, orderedIds),
      );
    },
    [client, powerSync, runTreeMutation, sourceRows],
  );

  const moveItemToParent = useCallback(
    (itemId: string, parentId: string | null) => {
      void runTreeMutation(() =>
        moveDocumentViaPowerSyncOrApi(client, powerSync, itemId, parentId),
      );
    },
    [client, powerSync, runTreeMutation],
  );

  const openTreeActions = useCallback(
    (item: VisibleRow) => {
      const title = item.title?.trim() || item.path || "Untitled";
      const siblings = documentSiblingRows(sourceRows, item.id);
      const index = siblings.findIndex((row) => row.id === item.id);
      const canMoveUp = index > 0;
      const canMoveDown = index >= 0 && index < siblings.length - 1;
      const isDocument = item.kind !== "folder";
      const moveTargets = isDocument
        ? documentMoveFolderOptions(sourceRows, item.id)
        : [];

      const buttons: Array<{
        text: string;
        style?: "cancel" | "default";
        onPress?: () => void;
      }> = [];

      if (canMoveUp) {
        buttons.push({
          text: "Move up",
          onPress: () => reorderItem(item.id, "up"),
        });
      }
      if (canMoveDown) {
        buttons.push({
          text: "Move down",
          onPress: () => reorderItem(item.id, "down"),
        });
      }
      if (moveTargets.length > 0) {
        buttons.push({
          text: "Move to…",
          onPress: () => setMovePickerItemId(item.id),
        });
      }
      buttons.push({ text: "Cancel", style: "cancel" });

      if (buttons.length === 1) return;
      Alert.alert(title, "Reorder or move this item.", buttons);
    },
    [reorderItem, sourceRows],
  );

  const moveFolderOptions = useMemo((): PropertyOption<string>[] => {
    if (!movePickerItemId) return [];
    return documentMoveFolderOptions(sourceRows, movePickerItemId).map(
      (option) => ({
        value: option.id ?? "__root__",
        label: option.label,
        icon: option.id ? <FolderIcon size={14} /> : undefined,
      }),
    );
  }, [movePickerItemId, sourceRows]);

  const movePickerItem = movePickerItemId
    ? sourceRows.find((row) => row.id === movePickerItemId)
    : null;
  const movePickerParentId = movePickerItem?.parent_id ?? null;

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
      {treeActionError ? (
        <Text style={[ui.error, { paddingHorizontal: 16, paddingTop: 8 }]}>
          {treeActionError}
        </Text>
      ) : null}
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
      <BacksterFlashList
        ref={listRef}
        data={rows}
        estimatedItemSize={56}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="on-drag"
        alwaysBounceVertical={showListSearch}
        onScroll={showListSearch ? search.onScroll : undefined}
        onScrollEndDrag={showListSearch ? search.onScrollEndDrag : undefined}
        scrollEventThrottle={showListSearch ? 16 : undefined}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={() => {
              void reload();
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        ListHeaderComponent={
          pageTitle ? (
            <ContentPageTitle
              title={pageTitle}
              includeTopSafeArea={pageTitleSafeArea}
            />
          ) : null
        }
        ListEmptyComponent={
          <Text style={ui.empty}>
            {searching ? "No matching documents." : emptyMessage}
          </Text>
        }
        renderItem={({ item }) => {
          const title = item.title?.trim() || item.path || "Untitled";
          const isFolder = item.kind === "folder";
          const highlighted = highlightedId === item.id;
          const selected = !isFolder && pathSelectedId === item.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={title}
              accessibilityState={{ selected }}
              onPress={() => activateRow(item.id)}
              onLongPress={
                includeFolders && !searching
                  ? () => openTreeActions(item)
                  : undefined
              }
              style={({ pressed }) => [
                ui.row,
                { paddingLeft: 16 + item.depth * 16 },
                selected ? ui.listRowSelected : null,
                highlighted ? ui.keyboardNavHighlight : null,
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
      {movePickerItemId ? (
        <PropertyOptionSheet
          visible
          title="Move to folder"
          options={moveFolderOptions}
          selected={movePickerParentId ?? "__root__"}
          onSelect={(value) => {
            const parentId = value === "__root__" ? null : value;
            moveItemToParent(movePickerItemId, parentId);
            setMovePickerItemId(null);
          }}
          onClose={() => setMovePickerItemId(null)}
        />
      ) : null}
    </View>
  );
}
