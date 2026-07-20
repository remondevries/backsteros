import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { reorderAttachmentIds } from "./letter-pdf-tab-drag.js";

const DRAG_THRESHOLD_PX = 5;

export type LetterPdfTabReorderItem = {
  id: string;
};

type UseLetterPdfTabReorderOptions<T extends LetterPdfTabReorderItem> = {
  attachments: readonly T[];
  enabled: boolean;
  onReorder?: (orderedIds: string[]) => void | Promise<void>;
};

export type LetterPdfTabReorderBind = {
  "data-letter-pdf-tab-id": string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
};

/**
 * Pointer-based PDF tab reorder (browser-tab style): live shuffle + insert bar.
 * Prefer this over HTML5 DnD — Tauri/WebKit often never fires drop targets.
 */
export function useLetterPdfTabReorder<T extends LetterPdfTabReorderItem>({
  attachments,
  enabled,
  onReorder,
}: UseLetterPdfTabReorderOptions<T>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  /** `undefined` = no indicator yet; `null` = append at end. */
  const [insertBeforeId, setInsertBeforeId] = useState<
    string | null | undefined
  >(undefined);
  const originRef = useRef<{
    id: string;
    x: number;
    y: number;
    pointerId: number;
    active: boolean;
  } | null>(null);
  const orderedIdsRef = useRef<string[] | null>(null);
  const attachmentsRef = useRef(attachments);
  const onReorderRef = useRef(onReorder);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    onReorderRef.current = onReorder;
  }, [onReorder]);

  useEffect(() => {
    orderedIdsRef.current = orderedIds;
  }, [orderedIds]);

  useEffect(() => {
    if (!draggingId) return;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = previousUserSelect;
    };
  }, [draggingId]);

  const clearDrag = useCallback(() => {
    originRef.current = null;
    setDraggingId(null);
    setOrderedIds(null);
    setInsertBeforeId(undefined);
  }, []);

  const resolveInsertBeforeId = useCallback(
    (clientX: number, clientY: number, currentDraggingId: string) => {
      const ids =
        orderedIdsRef.current ??
        attachmentsRef.current.map((entry) => entry.id);
      const stack = document.elementsFromPoint(clientX, clientY);

      for (const node of stack) {
        if (!(node instanceof HTMLElement)) continue;
        const host = node.closest<HTMLElement>("[data-letter-pdf-tab-id]");
        if (!host) continue;
        const id = host.dataset.letterPdfTabId;
        if (!id || id === currentDraggingId) continue;
        const rect = host.getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) {
          return id;
        }
        const index = ids.indexOf(id);
        if (index < 0 || index >= ids.length - 1) return null;
        return ids[index + 1] ?? null;
      }

      if (
        stack.some(
          (node) =>
            node instanceof HTMLElement &&
            Boolean(node.closest("[data-letter-pdf-tab-end-zone]")),
        )
      ) {
        return null;
      }

      return undefined;
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const origin = originRef.current;
      if (!origin || origin.pointerId !== event.pointerId) return;

      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (!origin.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        origin.active = true;
        suppressClickRef.current = true;
        setDraggingId(origin.id);
        const ids = attachmentsRef.current.map((entry) => entry.id);
        orderedIdsRef.current = ids;
        setOrderedIds(ids);
      }

      const insertBefore = resolveInsertBeforeId(
        event.clientX,
        event.clientY,
        origin.id,
      );
      if (insertBefore === undefined) return;

      setInsertBeforeId(insertBefore);
      const current =
        orderedIdsRef.current ??
        attachmentsRef.current.map((entry) => entry.id);
      const next = reorderAttachmentIds(current, origin.id, insertBefore);
      if (next.join("\0") === current.join("\0")) return;
      orderedIdsRef.current = next;
      setOrderedIds(next);
    },
    [resolveInsertBeforeId],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent) => {
      const origin = originRef.current;
      if (!origin || origin.pointerId !== event.pointerId) return;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      const next = orderedIdsRef.current;
      const didDrag = origin.active;
      const previous = attachmentsRef.current.map((entry) => entry.id);
      clearDrag();

      if (!didDrag || !next) return;
      if (next.join("\0") === previous.join("\0")) return;
      void onReorderRef.current?.(next);
    },
    [clearDrag, onPointerMove],
  );

  const startPointerDrag = useCallback(
    (attachmentId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "button, input, textarea, a, [data-letter-pdf-tab-no-drag]",
        )
      ) {
        return;
      }

      originRef.current = {
        id: attachmentId,
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
        active: false,
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [enabled, onPointerMove, onPointerUp],
  );

  const displayAttachments = useMemo(() => {
    if (!orderedIds) return [...attachments];
    const byId = new Map(attachments.map((entry) => [entry.id, entry]));
    return orderedIds
      .map((id) => byId.get(id))
      .filter((entry): entry is T => Boolean(entry));
  }, [attachments, orderedIds]);

  const bindTab = useCallback(
    (attachmentId: string): LetterPdfTabReorderBind => ({
      "data-letter-pdf-tab-id": attachmentId,
      onPointerDown: (event) => startPointerDrag(attachmentId, event),
    }),
    [startPointerDrag],
  );

  const consumeClickSuppression = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  return {
    displayAttachments,
    draggingId,
    insertBeforeId,
    isDragging: Boolean(draggingId),
    canReorder: enabled,
    bindTab,
    consumeClickSuppression,
  };
}
