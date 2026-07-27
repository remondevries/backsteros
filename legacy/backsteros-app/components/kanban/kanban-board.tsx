"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "@/lib/shortcuts/list-keyboard-nav-zone";
import {
  boardKeyboardNavDirection,
  stepBoardTaskId,
} from "@/lib/shortcuts/board-keyboard-nav";
import {
  computeKanbanDropIndicator,
  type KanbanDropIndicator,
} from "@/lib/kanban/compute-kanban-drop-indicator";

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

type KanbanBoardCardRenderProps<TItem> = {
  item: TItem;
  dragging: boolean;
  keyboardHighlighted: boolean;
  onOpen: () => void;
  onPointerDragStart: (event: MouseEvent<HTMLElement>) => void;
};

type KanbanBoardProps<TItem> = {
  columns: KanbanColumn<TItem>[];
  getItemId: (item: TItem) => string;
  getItemColumnKey: (item: TItem) => string;
  compareItems: (left: TItem, right: TItem) => number;
  renderCard: (props: KanbanBoardCardRenderProps<TItem>) => ReactNode;
  renderDragPreview: (item: TItem) => ReactNode;
  onMoveItem: (request: KanbanBoardMoveRequest) => void;
  onNavigate: (itemId: string) => void;
  selectedItemId?: string | null;
  ariaLabel: string;
  moveError?: string | null;
  findItemById: (itemId: string) => TItem | undefined;
};

type DragPreviewState<TItem> = {
  item: TItem;
  width: number;
  x: number;
  y: number;
};

type KanbanBoardColumnProps<TItem> = {
  column: KanbanColumn<TItem>;
  isDropTarget: boolean;
  dropBeforeItemId: string | null;
  draggingItemId: string | null;
  highlightedId: string | null;
  getItemId: (item: TItem) => string;
  renderCard: (props: KanbanBoardCardRenderProps<TItem>) => ReactNode;
  onNavigate: (itemId: string) => void;
  onColumnDragOver: (
    columnKey: string,
    columnItems: TItem[],
    event: DragEvent<HTMLElement>,
  ) => void;
  onColumnDrop: (
    columnKey: string,
    columnItems: TItem[],
    event: DragEvent<HTMLElement>,
  ) => void;
  onPointerColumnEnter: (columnKey: string, columnItems: TItem[]) => void;
  onColumnPointerUp: (columnKey: string, columnItems: TItem[]) => void;
  onPointerDragStart: (item: TItem, event: MouseEvent<HTMLElement>) => void;
};

function KanbanBoardColumn<TItem>({
  column,
  isDropTarget,
  dropBeforeItemId,
  draggingItemId,
  highlightedId,
  getItemId,
  renderCard,
  onNavigate,
  onColumnDragOver,
  onColumnDrop,
  onPointerColumnEnter,
  onColumnPointerUp,
  onPointerDragStart,
}: KanbanBoardColumnProps<TItem>) {
  return (
    <section
      className={[
        "task-kanban-column",
        column.items.length === 0 ? "task-kanban-column--collapsed" : null,
        isDropTarget ? "task-kanban-column--drop-target" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onDragOver={(event) => {
        onColumnDragOver(column.key, column.items, event);
      }}
      onDrop={(event) => {
        onColumnDrop(column.key, column.items, event);
      }}
      onMouseEnter={() => {
        onPointerColumnEnter(column.key, column.items);
      }}
      onMouseUp={() => {
        onColumnPointerUp(column.key, column.items);
      }}
    >
      <header className="task-kanban-column-header">
        <span className="task-kanban-column-title">
          {column.icon}
          <span>{column.label}</span>
        </span>
        <span className="task-kanban-column-count">{column.items.length}</span>
      </header>

      {isDropTarget && column.items.length > 0 ? (
        <div className="task-kanban-column-drop-overlay" aria-hidden="true" />
      ) : null}

      {column.items.length > 0 ? (
        <ol className="task-kanban-column-list">
          {column.items.map((item) => {
            const itemId = getItemId(item);

            return (
              <Fragment key={itemId}>
                {isDropTarget && dropBeforeItemId === itemId ? (
                  <li className="task-kanban-drop-divider" aria-hidden="true" />
                ) : null}
                {renderCard({
                  item,
                  dragging: draggingItemId === itemId,
                  keyboardHighlighted: highlightedId === itemId,
                  onOpen: () => onNavigate(itemId),
                  onPointerDragStart: (event) => onPointerDragStart(item, event),
                })}
              </Fragment>
            );
          })}
          {isDropTarget && dropBeforeItemId === null ? (
            <li className="task-kanban-drop-divider" aria-hidden="true" />
          ) : null}
        </ol>
      ) : isDropTarget ? (
        <div className="task-kanban-column-empty-drop">
          <span className="task-kanban-drop-divider" aria-hidden="true" />
        </div>
      ) : null}
    </section>
  );
}

export function KanbanBoard<TItem>({
  columns,
  getItemId,
  getItemColumnKey,
  compareItems,
  renderCard,
  renderDragPreview,
  onMoveItem,
  onNavigate,
  selectedItemId = null,
  ariaLabel,
  moveError = null,
  findItemById,
}: KanbanBoardProps<TItem>) {
  const boardRef = useRef<HTMLDivElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<KanbanDropIndicator | null>(
    null,
  );
  const [dragPreview, setDragPreview] = useState<DragPreviewState<TItem> | null>(
    null,
  );

  const draggingItemIdRef = useLatestRef(draggingItemId);
  const pointerDragModeRef = useRef(false);
  const pointerOffsetRef = useRef({ x: 0, y: 0 });
  const dragPreviewRef = useRef<HTMLUListElement | null>(null);

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
    onNavigate,
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: boardItemIds.length > 0,
    resolveNextItemId: resolveNextBoardItemId,
  });

  const resolveDropIndicator = useCallback(
    (columnKey: string, columnItems: TItem[], draggedItem: TItem) =>
      computeKanbanDropIndicator({
        columnKey,
        columnItems,
        draggedItem,
        draggedItemId: getItemId(draggedItem),
        getItemColumnKey,
        compareItems,
        getItemId,
      }),
    [compareItems, getItemColumnKey, getItemId],
  );

  const handlePointerDragStart = useCallback(
    (item: TItem, event: MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      pointerOffsetRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      pointerDragModeRef.current = true;
      setDraggingItemId(getItemId(item));
      setDropIndicator(null);
      setDragPreview({
        item,
        width: rect.width,
        x: rect.left,
        y: rect.top,
      });
    },
    [getItemId],
  );

  const handleColumnDragOver = useCallback(
    (columnKey: string, columnItems: TItem[], event: DragEvent<HTMLElement>) => {
      if (!draggingItemId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const draggedItem = findItemById(draggingItemId);
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
    [draggingItemId, findItemById, resolveDropIndicator],
  );

  const handlePointerColumnEnter = useCallback(
    (columnKey: string, columnItems: TItem[]) => {
      if (!pointerDragModeRef.current) return;
      const pointerItemId = draggingItemIdRef.current;
      if (!pointerItemId) return;

      const draggedItem = findItemById(pointerItemId);
      if (!draggedItem) return;

      setDropIndicator(resolveDropIndicator(columnKey, columnItems, draggedItem));
    },
    [findItemById, resolveDropIndicator, draggingItemIdRef],
  );

  const commitDrop = useCallback(
    (columnKey: string, columnItems: TItem[], droppedItemId: string) => {
      const item = findItemById(droppedItemId);
      if (!item) return;

      const fromColumnKey = getItemColumnKey(item);
      if (fromColumnKey === columnKey) {
        setDraggingItemId(null);
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
    },
    [findItemById, getItemColumnKey, onMoveItem, resolveDropIndicator],
  );

  const handleColumnDrop = useCallback(
    (columnKey: string, columnItems: TItem[], event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDropIndicator(null);

      const droppedItemId =
        event.dataTransfer.getData("text/plain").trim() || draggingItemId;
      if (!droppedItemId) return;

      commitDrop(columnKey, columnItems, droppedItemId);
    },
    [commitDrop, draggingItemId],
  );

  const handleColumnPointerUp = useCallback(
    (columnKey: string, columnItems: TItem[]) => {
      if (!pointerDragModeRef.current) return;
      pointerDragModeRef.current = false;
      const pointerItemId = draggingItemIdRef.current;
      if (!pointerItemId) return;

      const syntheticEvent = {
        preventDefault: () => {},
        dataTransfer: {
          getData: () => pointerItemId,
        },
      } as unknown as DragEvent<HTMLElement>;

      handleColumnDrop(columnKey, columnItems, syntheticEvent);
    },
    [draggingItemIdRef, handleColumnDrop],
  );

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (!pointerDragModeRef.current) return;
      pointerDragModeRef.current = false;
      setDraggingItemId(null);
      setDropIndicator(null);
    };

    const handleWindowMouseMove = (event: globalThis.MouseEvent) => {
      if (!pointerDragModeRef.current) return;
      const node = dragPreviewRef.current;
      if (!node) return;
      const x = event.clientX - pointerOffsetRef.current.x;
      const y = event.clientY - pointerOffsetRef.current.y;
      node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("mousemove", handleWindowMouseMove);
    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("mousemove", handleWindowMouseMove);
    };
  }, []);

  useEffect(() => {
    if (draggingItemId === null) {
      return;
    }

    document.body.classList.add("app-is-dragging");
    return () => document.body.classList.remove("app-is-dragging");
  }, [draggingItemId]);

  const visibleDragPreview =
    draggingItemId !== null ? dragPreview : null;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {moveError ? (
        <p className="px-2 pb-2 text-xs text-red-400" role="alert">
          {moveError}
        </p>
      ) : null}

      <div className="task-kanban-scroll" ref={boardRef} {...listContainerProps}>
        {visibleDragPreview
          ? createPortal(
              <ul
                ref={dragPreviewRef}
                className="task-kanban-card-drag-preview"
                style={{
                  width: `${visibleDragPreview.width}px`,
                  transform: `translate3d(${visibleDragPreview.x}px, ${visibleDragPreview.y}px, 0)`,
                }}
                aria-hidden="true"
              >
                {renderDragPreview(visibleDragPreview.item)}
              </ul>,
              document.body,
            )
          : null}

        <div className="task-kanban" aria-label={ariaLabel}>
          {columns.map((column) => (
            <KanbanBoardColumn
              key={column.key}
              column={column}
              isDropTarget={dropIndicator?.columnKey === column.key}
              dropBeforeItemId={
                dropIndicator?.columnKey === column.key
                  ? dropIndicator.beforeItemId
                  : null
              }
              draggingItemId={draggingItemId}
              highlightedId={highlightedId}
              getItemId={getItemId}
              renderCard={renderCard}
              onNavigate={onNavigate}
              onColumnDragOver={handleColumnDragOver}
              onColumnDrop={handleColumnDrop}
              onPointerColumnEnter={handlePointerColumnEnter}
              onColumnPointerUp={handleColumnPointerUp}
              onPointerDragStart={handlePointerDragStart}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
