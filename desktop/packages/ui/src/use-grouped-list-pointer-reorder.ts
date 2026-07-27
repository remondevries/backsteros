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
  LIST_REORDER_NO_DRAG_SELECTOR,
  groupedListPointerDropToRequest,
  insertBeforeKeyForPointerTarget,
  resolveGroupedListPointerDropTarget,
  type GroupedListPointerReorderRequest,
} from "./grouped-list-pointer-reorder.js";

const DRAG_THRESHOLD_PX = 5;

export type GroupedListPointerItemBind = {
  [LIST_REORDER_ITEM_ATTR]: string;
  [LIST_REORDER_GROUP_ATTR]: string;
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
      clearDrag();

      if (!didDrag || !target) return;

      const request = groupedListPointerDropToRequest({
        itemId: origin.id,
        fromGroupKey: origin.fromGroupKey,
        target,
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
      onPointerDown: (event) => startPointerDrag(itemId, groupKey, event),
    }),
    [startPointerDrag],
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
