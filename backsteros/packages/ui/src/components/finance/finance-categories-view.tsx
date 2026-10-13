"use client";

import type {
  FinancialCategory,
  FinancialCategoryListing,
} from "@backsteros/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { ENTITY_ICON_COLOR_PRESETS } from "../../entity/entity-icon.js";
import {
  applyOptimisticCategoryReorder,
  financeCategoryGroupAppendOrderKey,
  financeCategoryGroupKey,
  financeCategoryListingGroupKey,
  financeCategoryOrderKey,
  financeCategoryParentGroupKey,
  type FinanceListReorderRequest,
} from "../../finance/finance-list-reorder.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import { useListDismissDetailShortcut } from "../../list-nav/use-list-clear-selection-shortcut.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { EntityDetailLayout } from "../entity/entity-detail-layout.js";
import { getEntityIconColor } from "../projects/project-octicon.js";
import { getTaskStatusHeaderGradientStyle } from "../../tasks/task-status-header-gradient.js";
import { useFinancePanelResize } from "../../finance/use-finance-panel-resize.js";
import {
  useGroupedListPointerReorder,
  type GroupedListPointerItemBind,
} from "../../list-nav/use-grouped-list-pointer-reorder.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import {
  FinanceMonthNavigator,
  localMonthKey,
} from "./finance-month-navigator.js";
import {
  buildListingGroups,
  CategoryAmountColumns,
  CategoryIcon,
  categoryColor,
  FINANCE_CAT_DETAIL_WIDTH_KEY,
  normalizeKind,
  normalizeListing,
  PlusIcon,
  useBudgetColumnWidthPx,
  useSpentColumnWidthPx,
  type FinanceCategoriesViewProps,
  type FinanceCategoryGroupOption,
} from "./finance-categories-shared.js";
import {
  BudgetOverviewCard,
  CategoryDetailPanel,
  CreateCategoryModal,
  type CreateModalState,
  type OverviewSlice,
} from "./finance-categories-detail-pane.js";

export { CategoryActionsMenu } from "./finance-categories-actions-menu.js";
export {
  buildCategoryDropdownOptions,
  type FinanceCategoriesChromeState,
  type FinanceCategoriesViewProps,
  type FinanceCategoryCreateInput,
  type FinanceCategoryGroupOption,
  type FinanceCategoryMetrics,
  type FinanceCategoryMonthMetric,
  type FinanceCategoryOrganization,
  type FinanceCategoryTransactionPatch,
  type FinanceCategoryUpdateInput,
  type FinanceCategoryYearMetric,
} from "./finance-categories-shared.js";
export { FinanceTransactionsPanelList } from "./finance-categories-tx-panel-list.js";

function CategoryRow({
  category,
  depth,
  selected,
  highlighted = false,
  spentCents,
  showAmounts,
  onSelect,
  onAddChild,
  pointerReorderBind = null,
  dragging = false,
  showDragInsertBefore = false,
}: {
  category: FinancialCategory;
  depth: 0 | 1;
  selected: boolean;
  highlighted?: boolean;
  spentCents: number;
  showAmounts: boolean;
  onSelect: () => void;
  onAddChild?: () => void;
  pointerReorderBind?: GroupedListPointerItemBind | null;
  dragging?: boolean;
  showDragInsertBefore?: boolean;
}) {
  const canPointerReorder = Boolean(pointerReorderBind);
  return (
    <li
      className={[
        "finance-categories-view__row",
        depth === 1 ? "finance-categories-view__row--child" : null,
        selected ? "is-selected" : null,
        showDragInsertBefore
          ? "finance-categories-view__row--insert-before"
          : null,
        dragging ? "finance-categories-view__row--dragging" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      {...keyboardNavItemProps(category.id)}
      {...(pointerReorderBind ?? {})}
    >
      <div
        className={[
          "finance-categories-view__row-main",
          canPointerReorder
            ? "finance-categories-view__row-main--draggable"
            : null,
          keyboardNavListItemClass(highlighted),
        ]
          .filter(Boolean)
          .join(" ")}
        role="button"
        tabIndex={0}
        data-tauri-drag-region="false"
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onSelect();
        }}
      >
        <span className="finance-categories-view__row-leading">
          <span className="finance-categories-view__row-icon" aria-hidden="true">
            <CategoryIcon icon={category.icon} size={16} />
          </span>
          <span className="finance-categories-view__row-meta">
            <span className="finance-categories-view__row-name">
              {category.name}
            </span>
          </span>
        </span>
        {showAmounts ? (
          <CategoryAmountColumns
            spentCents={spentCents}
            budgetCents={category.budgetCents}
          />
        ) : (
          <span className="finance-categories-view__amounts-spacer" />
        )}
        {onAddChild ? (
          <button
            type="button"
            className="finance-categories-view__row-add"
            aria-label={`Add subcategory under ${category.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onAddChild();
            }}
          >
            <PlusIcon />
          </button>
        ) : (
          <span className="finance-categories-view__row-action-spacer" />
        )}
      </div>
    </li>
  );
}

export function FinanceCategoriesView({
  categories,
  spentCentsByCategoryId = {},
  spentMonth = null,
  latestMonth = null,
  pending = false,
  error = null,
  onSpentMonthChange,
  categoryMetrics = null,
  categoryMetricsLoading = false,
  accounts = [],
  accountAvatarSrcById = {},
  organizations = [],
  goals = [],
  recurrings = [],
  onPatchTransaction,
  onBulkPatchTransactions,
  onBulkDeleteTransactions,
  onCreateOrganizationFromQuery,
  onChromeStateChange,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: FinanceCategoriesViewProps) {
  const resolvedLatestMonth = latestMonth ?? localMonthKey();
  const [localCategories, setLocalCategories] = useState(categories);
  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  const groups = useMemo(
    () => buildListingGroups(localCategories),
    [localCategories],
  );
  const budgetColumnWidthPx = useBudgetColumnWidthPx(localCategories);
  const childCountByParent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of localCategories) {
      if (!category.parentId) continue;
      counts.set(
        category.parentId,
        (counts.get(category.parentId) ?? 0) + 1,
      );
    }
    return counts;
  }, [localCategories]);

  const rolledSpentByCategoryId = useMemo(() => {
    const rolled: Record<string, number> = { ...spentCentsByCategoryId };
    for (const category of localCategories) {
      if (!category.parentId) continue;
      const childSpend = spentCentsByCategoryId[category.id] ?? 0;
      if (!childSpend) continue;
      rolled[category.parentId] = (rolled[category.parentId] ?? 0) + childSpend;
    }
    return rolled;
  }, [localCategories, spentCentsByCategoryId]);

  const spentColumnWidthPx = useSpentColumnWidthPx(
    spentCentsByCategoryId,
    rolledSpentByCategoryId,
  );

  const overview = useMemo(() => {
    const regularRoots =
      groups.find((group) => group.id === "regular")?.roots ?? [];
    const slices: OverviewSlice[] = regularRoots.map((node, index) => {
      const color =
        getEntityIconColor(node.category.icon) ??
        ENTITY_ICON_COLOR_PRESETS[index % ENTITY_ICON_COLOR_PRESETS.length]!;
      return {
        id: node.category.id,
        name: node.category.name,
        color,
        spentCents: rolledSpentByCategoryId[node.category.id] ?? 0,
      };
    });
    const spentCents = slices.reduce(
      (sum, slice) => sum + Math.max(0, slice.spentCents),
      0,
    );
    const budgetCents = regularRoots.reduce((sum, node) => {
      const own =
        node.category.budgetCents != null && node.category.budgetCents > 0
          ? node.category.budgetCents
          : 0;
      if (own > 0) return sum + own;
      // Fall back to child budgets when the parent has none.
      return (
        sum +
        node.children.reduce((childSum, child) => {
          const childBudget =
            child.budgetCents != null && child.budgetCents > 0
              ? child.budgetCents
              : 0;
          return childSum + childBudget;
        }, 0)
      );
    }, 0);
    return { slices, spentCents, budgetCents };
  }, [groups, rolledSpentByCategoryId]);
  const [collapsed, setCollapsed] = useState<
    Partial<Record<FinancialCategoryListing, boolean>>
  >({});
  const [collapsedParents, setCollapsedParents] = useState<
    Record<string, boolean>
  >({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [createState, setCreateState] = useState<CreateModalState>(null);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const canReorder = Boolean(onReorder);

  const handleCategoryReorder = useCallback(
    (request: FinanceListReorderRequest) => {
      setLocalCategories((current) =>
        applyOptimisticCategoryReorder(current, request),
      );
      if (request.fromGroupKey !== request.toGroupKey) {
        if (request.toGroupKey.startsWith("listing:")) {
          const listing = request.toGroupKey.slice("listing:".length);
          if (listing === "regular" || listing === "excluded") {
            setCollapsed((current) => ({
              ...current,
              [listing]: false,
            }));
          }
        } else if (request.toGroupKey.startsWith("parent:")) {
          const parentId = request.toGroupKey.slice("parent:".length);
          if (parentId) {
            setCollapsedParents((current) => ({
              ...current,
              [parentId]: false,
            }));
          }
        }
      }
      onReorder?.(request);
    },
    [onReorder],
  );

  const getItemGroupKey = useCallback(
    (itemId: string) => {
      const category = localCategories.find((entry) => entry.id === itemId);
      return category ? financeCategoryGroupKey(category) : undefined;
    },
    [localCategories],
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
    itemOrderKey: financeCategoryOrderKey,
    groupAppendOrderKey: financeCategoryGroupAppendOrderKey,
    onReorder: handleCategoryReorder,
  });

  const selectCategory = useCallback(
    (categoryId: string) => {
      if (consumeClickSuppression()) return;
      setSelectedId(categoryId);
      setDetailCollapsed(false);
    },
    [consumeClickSuppression],
  );

  const closeCategoryDetail = useCallback(() => {
    setSelectedId(null);
  }, []);

  useListDismissDetailShortcut({
    enabled: selectedId != null,
    onDismiss: closeCategoryDetail,
  });

  const keyboardItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      if (collapsed[group.id]) continue;
      for (const node of group.roots) {
        ids.push(node.category.id);
        if (
          node.children.length > 0 &&
          !collapsedParents[node.category.id]
        ) {
          for (const child of node.children) {
            ids.push(child.id);
          }
        }
      }
    }
    return ids;
  }, [collapsed, collapsedParents, groups]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: keyboardItemIds,
    selectedId,
    onNavigate: selectCategory,
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: keyboardItemIds.length > 0,
  });

  const {
    containerRef,
    detailPaneRef,
    detailWidth,
    isResized: detailResized,
    beginResize: beginDetailResize,
    resetWidth: resetDetailWidth,
  } = useFinancePanelResize(FINANCE_CAT_DETAIL_WIDTH_KEY);

  const selected =
    localCategories.find((entry) => entry.id === selectedId) ?? null;
  const selectedHasChildren = selected
    ? (childCountByParent.get(selected.id) ?? 0) > 0
    : false;

  const groupOptions = useMemo<FinanceCategoryGroupOption[]>(() => {
    const options: FinanceCategoryGroupOption[] = [
      { id: null, name: "No group (top level)" },
    ];
    // Parent candidates must share the selected category's listing so
    // Excluded categories only nest under Excluded roots (and Regular under Regular).
    const selectedListing = selected
      ? normalizeListing(selected.listing)
      : null;
    for (const entry of localCategories) {
      // Only top-level categories can be parents (1-level nesting).
      if (entry.parentId != null) continue;
      if (entry.id === selectedId) continue;
      if (
        selectedListing &&
        normalizeListing(entry.listing) !== selectedListing
      ) {
        continue;
      }
      options.push({ id: entry.id, name: entry.name });
    }
    return options;
  }, [localCategories, selected, selectedId]);

  useEffect(() => {
    if (
      selectedId &&
      !localCategories.some((entry) => entry.id === selectedId)
    ) {
      setSelectedId(null);
    }
  }, [localCategories, selectedId]);

  useEffect(() => {
    if (!selectedId) setDetailCollapsed(false);
  }, [selectedId]);

  useEffect(() => {
    if (!onChromeStateChange) return;
    if (!selected) {
      onChromeStateChange(null);
      return;
    }
    const target = selected;
    onChromeStateChange({
      hasSelection: true,
      detailCollapsed,
      detailResized,
      onToggleDetail: () => setDetailCollapsed((current) => !current),
      category: target,
      currentListing: normalizeListing(target.listing),
      currentKind: normalizeKind(target.kind),
      currentParentId: target.parentId,
      canChangeGroup: !selectedHasChildren,
      groupOptions,
      onSetListing: (listing) => {
        void onUpdate(target.id, { listing });
      },
      onSetKind: (kind) => {
        void onUpdate(target.id, { kind });
      },
      onSetGroup: (parentId) => {
        void onUpdate(target.id, { parentId });
      },
      onDelete: async () => {
        await Promise.resolve(onDelete(target.id));
        setSelectedId(null);
      },
    });
  }, [
    detailResized,
    groupOptions,
    detailCollapsed,
    onChromeStateChange,
    onDelete,
    onUpdate,
    selected,
    selectedHasChildren,
  ]);

  useEffect(() => {
    return () => onChromeStateChange?.(null);
  }, [onChromeStateChange]);

  return (
    <EntityDetailLayout sectionLabel="Finance" title="Categories">
      <div
        ref={containerRef}
        className={[
          "finance-categories-view",
          selected ? "has-selection" : null,
          selected && detailCollapsed ? "is-detail-collapsed" : null,
          detailWidth != null ? "is-detail-resized" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          {
            "--finance-cat-spent-w": `${spentColumnWidthPx}px`,
            "--finance-cat-budget-w": `${budgetColumnWidthPx}px`,
            ...(detailWidth != null
              ? { "--finance-cat-detail-w": `${detailWidth}px` }
              : {}),
          } as CSSProperties
        }
      >
        <div className="finance-categories-view__list-pane">
          <FinanceMonthNavigator
            month={spentMonth}
            latestMonth={resolvedLatestMonth}
            onChange={onSpentMonthChange}
          />
          <BudgetOverviewCard
            spentCents={overview.spentCents}
            budgetCents={overview.budgetCents}
            spentMonth={spentMonth}
            slices={overview.slices}
          />

          <ul
            className="overview-grouped-list"
            role="list"
            ref={listRef}
            {...listContainerProps}
          >
            {groups.map((group) => {
              const isCollapsed = Boolean(collapsed[group.id]);
              const showColumnHeaders = group.id === "regular";
              const listingGroupKey = financeCategoryListingGroupKey(group.id);
              const listingAppendKey =
                financeCategoryGroupAppendOrderKey(listingGroupKey);
              return (
                <ProjectTypeGroupSection
                  key={group.id}
                  title={`${group.label} (${group.count})`}
                  collapsed={isCollapsed}
                  onToggle={() =>
                    setCollapsed((current) => ({
                      ...current,
                      [group.id]: !current[group.id],
                    }))
                  }
                  onAdd={() => {
                    setCollapsed((current) => ({
                      ...current,
                      [group.id]: false,
                    }));
                    setCreateError(null);
                    setCreateState({
                      listing: group.id,
                      parentId: null,
                    });
                  }}
                  addActionLabel="category"
                  pointerReorderAppend={
                    canReorder ? bindAppendZone(listingGroupKey) : null
                  }
                  showPointerAppendIndicator={
                    insertBeforeKey === listingAppendKey
                  }
                  trailing={
                    showColumnHeaders ? (
                      <span className="finance-categories-view__column-headers">
                        <span>Spent</span>
                        <span
                          className="finance-categories-view__column-headers-gap"
                          aria-hidden="true"
                        />
                        <span>Budget</span>
                      </span>
                    ) : null
                  }
                >
                  {group.roots.length === 0 ? (
                    <li className="finance-categories-view__group-empty">
                      Nothing here yet
                    </li>
                  ) : (
                    group.roots.map((node) => {
                      const openCreateChild = () => {
                        setCreateError(null);
                        setCreateState({
                          listing: normalizeListing(node.category.listing),
                          parentId: node.category.id,
                          parentName: node.category.name,
                        });
                      };
                      const parentSpent =
                        rolledSpentByCategoryId[node.category.id] ?? 0;
                      const parentListingKey = financeCategoryListingGroupKey(
                        normalizeListing(node.category.listing),
                      );
                      const parentOrderKey = financeCategoryOrderKey(
                        node.category.id,
                      );
                      const parentAppendKey =
                        financeCategoryGroupAppendOrderKey(
                          financeCategoryParentGroupKey(node.category.id),
                        );

                      if (node.children.length > 0) {
                        const parentCollapsed = Boolean(
                          collapsedParents[node.category.id],
                        );
                        return (
                          <StatusGroupSection
                            key={node.category.id}
                            groupKey={node.category.id}
                            title={node.category.name}
                            headerStyle={getTaskStatusHeaderGradientStyle(
                              "backlog",
                            )}
                            highlighted={selectedId === node.category.id}
                            keyboardNavItemId={node.category.id}
                            keyboardHighlighted={
                              highlightedId === node.category.id
                            }
                            persistentChevron
                            icon={
                              <span
                                className="finance-categories-view__child-count"
                                style={
                                  {
                                    "--finance-cat-count-color": categoryColor(
                                      node.category.icon,
                                    ),
                                  } as CSSProperties
                                }
                              >
                                {node.children.length}
                              </span>
                            }
                            collapsed={parentCollapsed}
                            onToggle={() =>
                              setCollapsedParents((current) => ({
                                ...current,
                                [node.category.id]: !current[node.category.id],
                              }))
                            }
                            onTitleClick={() =>
                              selectCategory(node.category.id)
                            }
                            onAdd={openCreateChild}
                            addActionLabel="subcategory"
                            pointerReorderItem={
                              canReorder
                                ? bindItem(node.category.id, parentListingKey)
                                : null
                            }
                            dragging={draggingItemId === node.category.id}
                            showDragInsertBefore={
                              insertBeforeKey === parentOrderKey
                            }
                            pointerReorderAppend={
                              canReorder
                                ? bindAppendZone(
                                    financeCategoryParentGroupKey(
                                      node.category.id,
                                    ),
                                  )
                                : null
                            }
                            showPointerAppendIndicator={
                              insertBeforeKey === parentAppendKey
                            }
                            trailing={
                              <CategoryAmountColumns
                                spentCents={parentSpent}
                                budgetCents={node.category.budgetCents}
                              />
                            }
                          >
                            {node.children.map((child) => (
                              <CategoryRow
                                key={child.id}
                                category={child}
                                depth={1}
                                selected={selectedId === child.id}
                                highlighted={highlightedId === child.id}
                                spentCents={
                                  spentCentsByCategoryId[child.id] ?? 0
                                }
                                showAmounts
                                onSelect={() => selectCategory(child.id)}
                                pointerReorderBind={
                                  canReorder
                                    ? bindItem(
                                        child.id,
                                        financeCategoryParentGroupKey(
                                          node.category.id,
                                        ),
                                      )
                                    : null
                                }
                                dragging={draggingItemId === child.id}
                                showDragInsertBefore={
                                  insertBeforeKey ===
                                  financeCategoryOrderKey(child.id)
                                }
                              />
                            ))}
                          </StatusGroupSection>
                        );
                      }

                      return (
                        <CategoryRow
                          key={node.category.id}
                          category={node.category}
                          depth={0}
                          selected={selectedId === node.category.id}
                          highlighted={highlightedId === node.category.id}
                          spentCents={parentSpent}
                          showAmounts
                          onSelect={() => selectCategory(node.category.id)}
                          onAddChild={openCreateChild}
                          pointerReorderBind={
                            canReorder
                              ? bindItem(node.category.id, parentListingKey)
                              : null
                          }
                          dragging={draggingItemId === node.category.id}
                          showDragInsertBefore={
                            insertBeforeKey === parentOrderKey
                          }
                        />
                      );
                    })
                  )}
                </ProjectTypeGroupSection>
              );
            })}
          </ul>

          {error && !selected ? (
            <p className="entity-delete-modal-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {selected && !detailCollapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize category panel"
            title="Drag to resize"
            className="finance-categories-view__resize-handle"
            onPointerDown={(event) => {
              event.preventDefault();
              beginDetailResize(event.clientX);
            }}
            onDoubleClick={resetDetailWidth}
          />
        ) : null}

        <div className="finance-categories-view__detail-pane" ref={detailPaneRef}>
          <CategoryDetailPanel
            category={selected}
            hasChildren={selectedHasChildren}
            spentCents={
              selected
                ? (rolledSpentByCategoryId[selected.id] ??
                  spentCentsByCategoryId[selected.id] ??
                  0)
                : 0
            }
            spentMonth={spentMonth}
            metrics={
              selected && categoryMetrics?.categoryId === selected.id
                ? categoryMetrics
                : null
            }
            metricsLoading={categoryMetricsLoading}
            categories={localCategories}
            accounts={accounts}
            accountAvatarSrcById={accountAvatarSrcById}
            organizations={organizations}
            goals={goals}
            recurrings={recurrings}
            onPatchTransaction={onPatchTransaction}
            onBulkPatchTransactions={onBulkPatchTransactions}
            onBulkDeleteTransactions={onBulkDeleteTransactions}
            onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
            pending={pending}
            error={selected ? error : null}
            onUpdate={(patch) => {
              if (!selected) return;
              return onUpdate(selected.id, patch);
            }}
            onDelete={async () => {
              if (!selected) return;
              await onDelete(selected.id);
              setSelectedId(null);
            }}
          />
        </div>

        <CreateCategoryModal
          state={createState}
          pending={createPending}
          error={createError}
          onClose={() => {
            if (createPending) return;
            setCreateState(null);
            setCreateError(null);
          }}
          onSubmit={async (name) => {
            if (!createState) return;
            setCreatePending(true);
            setCreateError(null);
            try {
              const parent = createState.parentId
                ? localCategories.find(
                    (entry) => entry.id === createState.parentId,
                  )
                : null;
              await onCreate({
                name,
                listing: createState.listing,
                parentId: createState.parentId,
                kind: parent?.kind ?? "expense",
              });
              setCreateState(null);
            } catch (reason) {
              setCreateError(
                reason instanceof Error
                  ? reason.message
                  : "Could not create category.",
              );
            } finally {
              setCreatePending(false);
            }
          }}
        />
      </div>
    </EntityDetailLayout>
  );
}
