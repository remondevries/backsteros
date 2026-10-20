import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  LIST_REORDER_APPEND_ATTR,
  LIST_REORDER_GROUP_ATTR,
  LIST_REORDER_ITEM_ATTR,
  LIST_REORDER_LAYOUT_ATTR,
  LIST_REORDER_NO_DRAG_SELECTOR,
  groupedListPointerDropToRequest,
  insertBeforeKeyForPointerTarget,
  resolveGroupedListPointerDropTarget,
  type GroupedListPointerReorderRequest,
} from "./grouped-list-pointer-reorder.js";

const DRAG_THRESHOLD_PX = 10;

export type GroupedListPointerItemBind = {
  [LIST_REORDER_ITEM_ATTR]: string;
  [LIST_REORDER_GROUP_ATTR]: string;
  [LIST_REORDER_LAYOUT_ATTR]?: string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
};

export type GroupedListPointerAppendBind = {
  [LIST_REORDER_APPEND_ATTR]: string;
};

export type UseGroupedListPointerReorderOptions = {
  enabled: boolean;
  getItemGroupKey: (itemId: string) => string | undefined;
  itemOrderKey: (itemId: string) => string;
  groupAppendOrderKey: (groupKey: string) => string;
  onReorder: (request: GroupedListPointerReorderRequest) => void;
  /**
   * `"grid"` enables left/right half hit-testing (before vs after).
   * Default keeps classic before-item behavior for vertical lists.
   */
  itemLayout?: "list" | "grid";
  /** Next sibling in a group — required for grid after-item drops. */
  getNextItemId?: (itemId: string, groupKey: string) => string | null;
  /**
   * Fired on pointerup when the gesture never crossed the drag threshold.
   * Prefer this over relying on `click` when rows also bind pointer reorder —
   * a prior drag can leave click-suppression set and swallow the next open.
   */
  onItemActivate?: (itemId: string) => void;
};

export type { GroupedListPointerReorderRequest };

/**
 * Pointer-based reorder for status-/area-grouped vertical lists.
 * Prefer this over HTML5 DnD — Tauri/WebKit often never fires drop targets.
 */
export function useGroupedListPointerReorder({
  enabled,
  getItemGroupKey,
  itemOrderKey,
  groupAppendOrderKey,
  onReorder,
  itemLayout = "list",
  getNextItemId,
  onItemActivate,
}: UseGroupedListPointerReorderOptions) {
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [insertBeforeKey, setInsertBeforeKey] = useState<string | null>(null);
  const originRef = useRef<{
    id: string;
    fromGroupKey: string;
    x: number;
    y: number;
    pointerId: number;
    active: boolean;
  } | null>(null);
  const pendingTargetRef = useRef<ReturnType<
    typeof resolveGroupedListPointerDropTarget
  > | null>(null);
  const getItemGroupKeyRef = useRef(getItemGroupKey);
  const itemOrderKeyRef = useRef(itemOrderKey);
  const groupAppendOrderKeyRef = useRef(groupAppendOrderKey);
  const onReorderRef = useRef(onReorder);
  const getNextItemIdRef = useRef(getNextItemId);
  const onItemActivateRef = useRef(onItemActivate);
  const suppressClickRef = useRef(false);
  const stopSelectStartRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getItemGroupKeyRef.current = getItemGroupKey;
  }, [getItemGroupKey]);

  useEffect(() => {
    itemOrderKeyRef.current = itemOrderKey;
  }, [itemOrderKey]);

  useEffect(() => {
    groupAppendOrderKeyRef.current = groupAppendOrderKey;
  }, [groupAppendOrderKey]);

  useEffect(() => {
    onReorderRef.current = onReorder;
  }, [onReorder]);

  useEffect(() => {
    getNextItemIdRef.current = getNextItemId;
  }, [getNextItemId]);

  useEffect(() => {
    onItemActivateRef.current = onItemActivate;
  }, [onItemActivate]);

  useEffect(() => {
    if (!draggingItemId) return;
    document.body.classList.add("app-is-dragging");
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    window.getSelection()?.removeAllRanges();
    return () => {
      document.body.classList.remove("app-is-dragging");
      document.body.style.userSelect = previousUserSelect;
    };
  }, [draggingItemId]);

  const clearDrag = useCallback(() => {
    stopSelectStartRef.current?.();
    stopSelectStartRef.current = null;
    originRef.current = null;
    pendingTargetRef.current = null;
    setDraggingItemId(null);
    setInsertBeforeKey(null);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const origin = originRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;

    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (!origin.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      origin.active = true;
      suppressClickRef.current = true;
      window.getSelection()?.removeAllRanges();
      setDraggingItemId(origin.id);
    }

    const target = resolveGroupedListPointerDropTarget(
      event.clientX,
      event.clientY,
      origin.id,
    );
    pendingTargetRef.current = target;
    if (!target) {
      setInsertBeforeKey(null);
      return;
    }

    setInsertBeforeKey(
      insertBeforeKeyForPointerTarget(
        target,
        itemOrderKeyRef.current,
        groupAppendOrderKeyRef.current,
      ),
    );
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent) => {
      const origin = originRef.current;
      if (!origin || origin.pointerId !== event.pointerId) return;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      const target = pendingTargetRef.current;
      const didDrag = origin.active;
      const itemId = origin.id;
      const fromGroupKey = origin.fromGroupKey;
      clearDrag();

      if (!didDrag) {
        // Open via pointerup so a stuck suppress flag from an earlier drag
        // cannot eat this gesture. Suppress the trailing `click` if we handle it.
        if (onItemActivateRef.current) {
          suppressClickRef.current = true;
          onItemActivateRef.current(itemId);
        }
        return;
      }

      // If no `click` follows this drag (common after a long move), clear
      // suppression so the *next* intentional open is not swallowed.
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);

      if (!target) return;

      const request = groupedListPointerDropToRequest({
        itemId,
        fromGroupKey,
        target,
        getNextItemId: getNextItemIdRef.current,
      });

      onReorderRef.current(request);
    },
    [clearDrag, onPointerMove],
  );

  const startPointerDrag = useCallback(
    (
      itemId: string,
      groupKey: string,
      event: ReactPointerEvent<HTMLElement>,
    ) => {
      if (!enabled || event.button !== 0) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(LIST_REORDER_NO_DRAG_SELECTOR)
      ) {
        return;
      }

      const fromGroupKey = getItemGroupKeyRef.current(itemId) ?? groupKey;

      // Block native text selection for the whole gesture (including pre-threshold).
      stopSelectStartRef.current?.();
      const preventSelectStart = (selectEvent: Event) => {
        selectEvent.preventDefault();
      };
      window.addEventListener("selectstart", preventSelectStart);
      stopSelectStartRef.current = () => {
        window.removeEventListener("selectstart", preventSelectStart);
      };

      // Fresh gesture — do not inherit suppress from a prior drag without click.
      suppressClickRef.current = false;
      originRef.current = {
        id: itemId,
        fromGroupKey,
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
        active: false,
      };
      pendingTargetRef.current = null;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [enabled, onPointerMove, onPointerUp],
  );

  const bindItem = useCallback(
    (itemId: string, groupKey: string): GroupedListPointerItemBind => ({
      [LIST_REORDER_ITEM_ATTR]: itemId,
      [LIST_REORDER_GROUP_ATTR]: groupKey,
      ...(itemLayout === "grid"
        ? { [LIST_REORDER_LAYOUT_ATTR]: "grid" }
        : {}),
      onPointerDown: (event) => startPointerDrag(itemId, groupKey, event),
    }),
    [itemLayout, startPointerDrag],
  );

  const bindAppendZone = useCallback(
    (groupKey: string): GroupedListPointerAppendBind => ({
      [LIST_REORDER_APPEND_ATTR]: groupKey,
    }),
    [],
  );

  const consumeClickSuppression = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  return {
    draggingItemId,
    insertBeforeKey,
    isDragging: Boolean(draggingItemId),
    canReorder: enabled,
    bindItem,
    bindAppendZone,
    consumeClickSuppression,
    clearDrag,
  };
}
