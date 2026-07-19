"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

import { stepBoardTaskId } from "../board-keyboard-nav.js";
import {
  computeKanbanDropIndicator,
  type KanbanDropIndicator,
} from "../compute-kanban-drop-indicator.js";
import { isKanbanInteractiveCardTarget } from "../kanban-interactive-target.js";
import {
  keyboardNavItemClass,
  keyboardNavItemProps,
} from "../keyboard-nav-item.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-keyboard-nav-zone.js";
import { boardKeyboardNavDirection } from "../should-handle-list-keyboard-navigation.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";

export type KanbanColumn<TItem> = {
  key: string;
  label: string;
  icon?: ReactNode;
  items: TItem[];
};

export type KanbanBoardMoveRequest = {
  itemId: string;
  fromColumnKey: string;
  toColumnKey: string;
  beforeItemId: string | null;
};

export type KanbanBoardProps<TItem> = {
  columns: KanbanColumn<TItem>[];
  getItemId: (item: TItem) => string;
  renderCard: (
    item: TItem,
    columnKey: string,
    options: { keyboardHighlighted: boolean },
  ) => ReactNode;
  onOpenItem?: (itemId: string) => void;
  selectedItemId?: string | null;
  ariaLabel?: string;
  emptyColumnLabel?: string;
  /** When set, enables HTML5 drag between columns. */
  getItemColumnKey?: (item: TItem) => string;
  compareItems?: (left: TItem, right: TItem) => number;
  findItemById?: (itemId: string) => TItem | undefined;
  onMoveItem?: (request: KanbanBoardMoveRequest) => void;
};

/**
 * Presentational kanban columns with optional HTML5 drag/drop and j/k/h/l board nav.
 */
export function KanbanBoard<TItem>({
  columns,
  getItemId,
  renderCard,
  onOpenItem,
  selectedItemId = null,
  ariaLabel = "Board",
  emptyColumnLabel = "No items",
  getItemColumnKey,
  compareItems,
  findItemById,
  onMoveItem,
}: KanbanBoardProps<TItem>) {
  const dragEnabled = Boolean(
    onMoveItem && getItemColumnKey && compareItems && findItemById,
  );
  const boardRef = useRef<HTMLDivElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<KanbanDropIndicator | null>(
    null,
  );
  const draggingItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    draggingItemIdRef.current = draggingItemId;
  }, [draggingItemId]);

  useEffect(() => {
    if (!draggingItemId) return;
    document.body.classList.add("app-is-dragging");
    return () => document.body.classList.remove("app-is-dragging");
  }, [draggingItemId]);

  const boardGrid = useMemo(
    () => columns.map((column) => column.items.map((item) => getItemId(item))),
    [columns, getItemId],
  );

  const boardItemIds = useMemo(() => boardGrid.flat(), [boardGrid]);

  const resolveNextBoardItemId = useCallback(
    ({
      key,
      currentId,
    }: {
      key: string;
      currentId: string | null;
      itemIds: string[];
    }) => {
      const direction = boardKeyboardNavDirection(key);
      if (!direction) {
        return null;
      }
      return stepBoardTaskId(boardGrid, currentId, direction);
    },
    [boardGrid],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: boardRef,
    itemIds: boardItemIds,
    selectedId: selectedItemId,
    onNavigate: (itemId) => onOpenItem?.(itemId),
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: boardItemIds.length > 0,
    resolveNextItemId: resolveNextBoardItemId,
  });

  const resolveDropIndicator = useCallback(
    (columnKey: string, columnItems: TItem[], draggedItem: TItem) => {
      if (!getItemColumnKey || !compareItems) return null;
      return computeKanbanDropIndicator({
        columnKey,
        columnItems,
        draggedItem,
        draggedItemId: getItemId(draggedItem),
        getItemColumnKey,
        compareItems,
        getItemId,
      });
    },
    [compareItems, getItemColumnKey, getItemId],
  );

  const handleColumnDragOver = useCallback(
    (columnKey: string, columnItems: TItem[], event: DragEvent<HTMLElement>) => {
      if (!dragEnabled || !draggingItemIdRef.current || !findItemById) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const draggedItem = findItemById(draggingItemIdRef.current);
      if (!draggedItem) return;

      const indicator = resolveDropIndicator(columnKey, columnItems, draggedItem);
      setDropIndicator((current) => {
        if (!indicator && !current) return current;
        if (!indicator) return null;
        if (
          current?.columnKey === indicator.columnKey &&
          current.beforeItemId === indicator.beforeItemId
        ) {
          return current;
        }
        return indicator;
      });
    },
    [dragEnabled, findItemById, resolveDropIndicator],
  );

  const handleColumnDrop = useCallback(
    (columnKey: string, columnItems: TItem[], event: DragEvent<HTMLElement>) => {
      if (!dragEnabled || !onMoveItem || !getItemColumnKey || !findItemById) {
        return;
      }
      event.preventDefault();
      const droppedItemId =
        event.dataTransfer.getData("text/plain") || draggingItemIdRef.current;
      if (!droppedItemId) {
        setDraggingItemId(null);
        setDropIndicator(null);
        return;
      }

      const item = findItemById(droppedItemId);
      if (!item) {
        setDraggingItemId(null);
        setDropIndicator(null);
        return;
      }

      const fromColumnKey = getItemColumnKey(item);
      if (fromColumnKey === columnKey) {
        setDraggingItemId(null);
        setDropIndicator(null);
        return;
      }

      const indicator = resolveDropIndicator(columnKey, columnItems, item);
      onMoveItem({
        itemId: droppedItemId,
        fromColumnKey,
        toColumnKey: columnKey,
        beforeItemId: indicator?.beforeItemId ?? null,
      });
      setDraggingItemId(null);
      setDropIndicator(null);
    },
    [
      dragEnabled,
      findItemById,
      getItemColumnKey,
      onMoveItem,
      resolveDropIndicator,
    ],
  );

  return (
    <div className="task-kanban-scroll">
      <div
        ref={boardRef}
        className="task-kanban"
        role="region"
        aria-label={ariaLabel}
        {...listContainerProps}
      >
        {columns.map((column) => {
          const isDropTarget =
            dropIndicator?.columnKey === column.key &&
            Boolean(draggingItemId);
          const dropBeforeItemId = isDropTarget
            ? dropIndicator?.beforeItemId ?? null
            : null;

          return (
            <section
              key={column.key}
              className={[
                "task-kanban-column",
                column.items.length === 0
                  ? "task-kanban-column--collapsed"
                  : null,
                isDropTarget ? "task-kanban-column--drop-target" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                {
                  "--task-kanban-column-bg": "rgb(255 255 255 / 0.03)",
                } as React.CSSProperties
              }
              onDragOver={
                dragEnabled
                  ? (event) =>
                      handleColumnDragOver(column.key, column.items, event)
                  : undefined
              }
              onDrop={
                dragEnabled
                  ? (event) =>
                      handleColumnDrop(column.key, column.items, event)
                  : undefined
              }
              onDragLeave={() => {
                if (!dragEnabled) return;
                setDropIndicator((current) =>
                  current?.columnKey === column.key ? null : current,
                );
              }}
            >
              <header className="task-kanban-column-header">
                <div className="task-kanban-column-title">
                  {column.icon}
                  <span>{column.label}</span>
                </div>
                <span className="task-kanban-column-count">
                  {column.items.length}
                </span>
              </header>

              {isDropTarget && column.items.length > 0 ? (
                <div
                  className="task-kanban-column-drop-overlay"
                  aria-hidden="true"
                />
              ) : null}

              <ul className="task-kanban-column-list">
                {column.items.length === 0 ? (
                  isDropTarget ? (
                    <li className="task-kanban-column-empty-drop">
                      <span
                        className="task-kanban-drop-divider"
                        aria-hidden="true"
                      />
                    </li>
                  ) : (
                    <li className="task-kanban-column-empty-drop">
                      {emptyColumnLabel}
                    </li>
                  )
                ) : (
                  column.items.map((item) => {
                    const itemId = getItemId(item);
                    const keyboardHighlighted = highlightedId === itemId;
                    return (
                      <Fragment key={itemId}>
                        {isDropTarget && dropBeforeItemId === itemId ? (
                          <li
                            className="task-kanban-drop-divider"
                            aria-hidden="true"
                          />
                        ) : null}
                        <li
                          className={[
                            "task-kanban-card-item",
                            keyboardNavItemClass(keyboardHighlighted),
                            draggingItemId === itemId
                              ? "task-kanban-card-item--dragging"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          {...keyboardNavItemProps(itemId)}
                          draggable={dragEnabled}
                          onDragStart={
                            dragEnabled
                              ? (event) => {
                                  if (
                                    isKanbanInteractiveCardTarget(event.target)
                                  ) {
                                    event.preventDefault();
                                    return;
                                  }
                                  event.dataTransfer.setData(
                                    "text/plain",
                                    itemId,
                                  );
                                  event.dataTransfer.effectAllowed = "move";
                                  setDraggingItemId(itemId);
                                  setDropIndicator(null);
                                }
                              : undefined
                          }
                          onDragEnd={
                            dragEnabled
                              ? () => {
                                  setDraggingItemId(null);
                                  setDropIndicator(null);
                                }
                              : undefined
                          }
                        >
                          {renderCard(item, column.key, {
                            keyboardHighlighted,
                          })}
                        </li>
                      </Fragment>
                    );
                  })
                )}
                {isDropTarget &&
                column.items.length > 0 &&
                dropBeforeItemId === null ? (
                  <li className="task-kanban-drop-divider" aria-hidden="true" />
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export type { KanbanDropIndicator };
