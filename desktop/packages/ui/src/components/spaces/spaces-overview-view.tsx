"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import {
  useGroupedListPointerReorder,
  type GroupedListPointerReorderRequest,
} from "../../list-nav/use-grouped-list-pointer-reorder.js";
import type { KnowledgeListItem } from "../../navigation/entity-routes.js";
import {
  applyOptimisticSpaceReorder,
  buildSpaceSiblingOrderIds,
  isSpacesCategoryId,
  spaceGroupAppendOrderKey,
  spaceOrderAfterKey,
  spaceOrderKey,
  type SpaceReorderRequest,
} from "../../spaces/space-list-reorder.js";
import {
  countArticlesInFolder,
  latestUpdatedAtInFolder,
  listSpaceChildFolders,
  SPACES_CATEGORIES,
  type SpacesCategoryId,
} from "../../spaces/spaces-categories.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import {
  SpaceOverviewCard,
  SpaceOverviewCreateCard,
  type SpaceOverviewCardItem,
} from "./space-overview-card.js";
import { WebsiteSpaceRow } from "./website-space-row.js";

export type SpacesOverviewViewProps = {
  documents: readonly KnowledgeListItem[];
  coverSrcById?: Readonly<Record<string, string>>;
  onSelectSpace?: (item: SpaceOverviewCardItem) => void;
  onIconChange?: (
    item: SpaceOverviewCardItem,
    icon: string | null,
  ) => void | Promise<void>;
  onTitleChange?: (
    item: SpaceOverviewCardItem,
    title: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onCreateSpaceFolder?: (input: {
    categoryId: SpacesCategoryId;
    title: string;
    parentFolderId: string;
    icon?: string;
  }) => Promise<{ id: string; path: string } | void> | { id: string; path: string } | void;
  /** Persist within-category card reorder (full sibling id order). */
  onReorderSpace?: (orderedIds: string[]) => void;
  onOpenSpaceSettings?: (item: SpaceOverviewCardItem) => void;
  onDeleteSpace?: (item: SpaceOverviewCardItem) => void;
  onCoverUpload?: (
    item: SpaceOverviewCardItem,
    file: File,
  ) => void | Promise<void>;
  onCoverRemove?: (item: SpaceOverviewCardItem) => void | Promise<void>;
  /** Show grey placeholder cards per category until documents are ready. */
  loading?: boolean;
};

export function SpacesOverviewView({
  documents,
  coverSrcById,
  onSelectSpace,
  onIconChange,
  onTitleChange,
  onCreateSpaceFolder,
  onReorderSpace,
  onOpenSpaceSettings,
  onDeleteSpace,
  onCoverUpload,
  onCoverRemove,
  loading = false,
}: SpacesOverviewViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(),
  );
  const [addingToCategory, setAddingToCategory] =
    useState<SpacesCategoryId | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [localDocuments, setLocalDocuments] = useState(documents);
  const localDocumentsRef = useRef(documents);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const canReorder = Boolean(onReorderSpace);

  useEffect(() => {
    setLocalDocuments(documents);
    localDocumentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    localDocumentsRef.current = localDocuments;
  }, [localDocuments]);

  const groups = useMemo(() => {
    return SPACES_CATEGORIES.map((category) => ({
      category,
      children: listSpaceChildFolders(localDocuments, category.rootPath),
    }));
  }, [localDocuments]);

  const spaceCategoryById = useMemo(() => {
    const map = new Map<string, SpacesCategoryId>();
    for (const group of groups) {
      for (const child of group.children) {
        map.set(child.id, group.category.id);
      }
    }
    return map;
  }, [groups]);

  const handleSpaceReorder = useCallback(
    (request: SpaceReorderRequest) => {
      const ids = buildSpaceSiblingOrderIds(
        localDocumentsRef.current,
        request,
      );
      if (!ids) return;
      setLocalDocuments((current) =>
        applyOptimisticSpaceReorder(current, request),
      );
      onReorderSpace?.(ids);
    },
    [onReorderSpace],
  );

  const handlePointerReorder = useCallback(
    (request: GroupedListPointerReorderRequest) => {
      if (request.fromGroupKey !== request.toGroupKey) return;
      if (!isSpacesCategoryId(request.toGroupKey)) return;
      handleSpaceReorder({
        spaceId: request.itemId,
        categoryId: request.toGroupKey,
        beforeSpaceId: request.beforeItemId,
      });
    },
    [handleSpaceReorder],
  );

  const getItemGroupKey = useCallback(
    (itemId: string) => spaceCategoryById.get(itemId),
    [spaceCategoryById],
  );

  const getNextItemId = useCallback(
    (itemId: string, groupKey: string) => {
      if (!isSpacesCategoryId(groupKey)) return null;
      const category = SPACES_CATEGORIES.find((entry) => entry.id === groupKey);
      if (!category) return null;
      const siblings = listSpaceChildFolders(
        localDocumentsRef.current,
        category.rootPath,
      );
      const index = siblings.findIndex((sibling) => sibling.id === itemId);
      if (index < 0) return null;
      return siblings[index + 1]?.id ?? null;
    },
    [],
  );

  const {
    draggingItemId,
    insertBeforeKey,
    bindItem,
    bindAppendZone,
    consumeClickSuppression,
  } = useGroupedListPointerReorder({
    enabled: canReorder,
    getItemGroupKey,
    itemOrderKey: spaceOrderKey,
    groupAppendOrderKey: (groupKey) =>
      spaceGroupAppendOrderKey(
        isSpacesCategoryId(groupKey) ? groupKey : "knowledge-base",
      ),
    onReorder: handlePointerReorder,
    itemLayout: "grid",
    getNextItemId,
  });

  const selectSpace = useCallback(
    (item: SpaceOverviewCardItem) => {
      if (consumeClickSuppression()) return;
      onSelectSpace?.(item);
    },
    [consumeClickSuppression, onSelectSpace],
  );

  const keyboardItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      if (collapsed.has(group.category.id)) continue;
      for (const child of group.children) {
        ids.push(child.id);
      }
    }
    return ids;
  }, [collapsed, groups]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    itemIds: keyboardItemIds,
    selectedId: null,
    onNavigate: (itemId) => {
      for (const group of groups) {
        const item = group.children.find((child) => child.id === itemId);
        if (item) {
          selectSpace({
            id: item.id,
            title: item.title,
            path: item.path,
            icon: item.icon,
            description: item.description,
            categoryId: group.category.id,
            articleCount: countArticlesInFolder(localDocuments, item.id),
            updatedAt: latestUpdatedAtInFolder(localDocuments, item.id),
          });
          return;
        }
      }
    },
  });

  useEffect(() => {
    setCreateError(null);
  }, [addingToCategory]);

  return (
    <div className="projects-overview" data-list-board-view>
      <div className="projects-overview-list projects-overview-list--spaces">
        <div className="projects-overview-list__body">
          <ul
            ref={listRef}
            className="overview-grouped-list"
            {...listContainerProps}
          >
            {groups.map(({ category, children }) => {
              const isCollapsed = collapsed.has(category.id);
              const root = localDocuments.find(
                (doc) =>
                  doc.kind === "folder" && doc.path === category.rootPath,
              );
              const appendKey = spaceGroupAppendOrderKey(category.id);
              return (
                <ProjectTypeGroupSection
                  key={category.id}
                  title={category.title}
                  collapsed={isCollapsed}
                  onToggle={() => {
                    setCollapsed((current) => {
                      const next = new Set(current);
                      if (next.has(category.id)) next.delete(category.id);
                      else next.add(category.id);
                      return next;
                    });
                  }}
                  onAdd={
                    category.allowCreate && root && onCreateSpaceFolder
                      ? () => {
                          setCollapsed((current) => {
                            const next = new Set(current);
                            next.delete(category.id);
                            return next;
                          });
                          setAddingToCategory(category.id);
                        }
                      : undefined
                  }
                  addActionLabel={
                    category.id === "support"
                      ? "Add category"
                      : category.id === "websites"
                        ? "Add website"
                        : "Add space"
                  }
                  pointerReorderAppend={
                    canReorder ? bindAppendZone(category.id) : null
                  }
                  showPointerAppendIndicator={insertBeforeKey === appendKey}
                  itemsClassName={
                    category.id === "websites"
                      ? "project-type-subgroup__items--websites"
                      : undefined
                  }
                >
                  {children.map((child) => {
                    const cardItem: SpaceOverviewCardItem = {
                      id: child.id,
                      title: child.title,
                      path: child.path,
                      icon: child.icon,
                      description: child.description,
                      categoryId: category.id,
                      articleCount: countArticlesInFolder(
                        localDocuments,
                        child.id,
                      ),
                      updatedAt: latestUpdatedAtInFolder(
                        localDocuments,
                        child.id,
                      ),
                      coverStorageKey: child.coverStorageKey,
                      coverSrc: coverSrcById?.[child.id] ?? null,
                    };
                    const showDragInsertBefore =
                      insertBeforeKey === spaceOrderKey(child.id);
                    const showDragInsertAfter =
                      insertBeforeKey === spaceOrderAfterKey(child.id);
                    const dragging = draggingItemId === child.id;
                    const isWebsite = category.id === "websites";
                    return (
                      <li
                        key={child.id}
                        className={[
                          isWebsite
                            ? "website-space-row-item"
                            : "space-overview-card-item",
                          showDragInsertBefore
                            ? isWebsite
                              ? "website-space-row-item--insert-before"
                              : "space-overview-card-item--insert-before"
                            : null,
                          showDragInsertAfter
                            ? isWebsite
                              ? "website-space-row-item--insert-after"
                              : "space-overview-card-item--insert-after"
                            : null,
                          dragging
                            ? isWebsite
                              ? "website-space-row-item--dragging"
                              : "space-overview-card-item--dragging"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {isWebsite ? (
                          <WebsiteSpaceRow
                            item={cardItem}
                            keyboardHighlighted={highlightedId === child.id}
                            onSelect={selectSpace}
                            onIconChange={onIconChange}
                            onTitleChange={onTitleChange}
                            onOpenSettings={onOpenSpaceSettings}
                            onDeleteSpace={onDeleteSpace}
                            pointerReorderBind={
                              canReorder
                                ? bindItem(child.id, category.id)
                                : null
                            }
                            dragging={dragging}
                          />
                        ) : (
                          <SpaceOverviewCard
                            item={cardItem}
                            keyboardHighlighted={highlightedId === child.id}
                            onSelect={selectSpace}
                            onIconChange={onIconChange}
                            onTitleChange={onTitleChange}
                            onOpenSettings={onOpenSpaceSettings}
                            onDeleteSpace={onDeleteSpace}
                            onCoverUpload={onCoverUpload}
                            onCoverRemove={onCoverRemove}
                            pointerReorderBind={
                              canReorder
                                ? bindItem(child.id, category.id)
                                : null
                            }
                            dragging={dragging}
                          />
                        )}
                      </li>
                    );
                  })}
                  {loading &&
                  children.length === 0 &&
                  addingToCategory !== category.id ? (
                    <li
                      className={
                        category.id === "websites"
                          ? "website-space-row-item"
                          : "space-overview-card-item"
                      }
                      aria-hidden="true"
                    >
                      {category.id === "websites" ? (
                        <div className="website-space-row website-space-row--skeleton">
                          <div className="website-space-row__icon-rail">
                            <span className="space-overview-skeleton-block space-overview-skeleton-block--icon" />
                          </div>
                          <div className="website-space-row__body">
                            <span className="space-overview-skeleton-block space-overview-skeleton-block--title" />
                            <span className="space-overview-skeleton-block space-overview-skeleton-block--meta" />
                          </div>
                        </div>
                      ) : (
                        <div className="space-overview-card space-overview-card--skeleton">
                          <div className="space-overview-card__visual space-overview-card__visual--skeleton">
                            <span className="space-overview-skeleton-block space-overview-skeleton-block--cover" />
                          </div>
                          <div className="space-overview-card__body">
                            <span className="space-overview-skeleton-block space-overview-skeleton-block--icon" />
                            <span className="space-overview-skeleton-block space-overview-skeleton-block--title" />
                            <span className="space-overview-skeleton-block space-overview-skeleton-block--meta" />
                          </div>
                        </div>
                      )}
                    </li>
                  ) : null}
                  {addingToCategory === category.id && root ? (
                    <li
                      className={
                        category.id === "websites"
                          ? "website-space-row-item website-space-row-item--creating"
                          : "space-overview-card-item space-overview-card-item--creating"
                      }
                    >
                      <SpaceOverviewCreateCard
                        categoryId={category.id}
                        disabled={creating}
                        error={createError}
                        onCancel={() => {
                          setAddingToCategory(null);
                          setCreateError(null);
                        }}
                        onSubmit={async ({ title, icon }) => {
                          if (!onCreateSpaceFolder) {
                            return { ok: false, error: "Create unavailable." };
                          }
                          setCreating(true);
                          setCreateError(null);
                          try {
                            await onCreateSpaceFolder({
                              categoryId: category.id,
                              title,
                              parentFolderId: root.id,
                              icon,
                            });
                            setAddingToCategory(null);
                            return { ok: true };
                          } catch (err) {
                            const message =
                              err instanceof Error
                                ? err.message
                                : "Could not create.";
                            setCreateError(message);
                            return { ok: false, error: message };
                          } finally {
                            setCreating(false);
                          }
                        }}
                      />
                    </li>
                  ) : null}
                </ProjectTypeGroupSection>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
