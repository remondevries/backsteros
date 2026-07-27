/**
 * Pointer-based drop-target resolution for vertical grouped lists.
 * Prefer this over HTML5 DnD — Tauri/WebKit often never fires drop targets.
 */

export const LIST_REORDER_ITEM_ATTR = "data-list-reorder-item";
export const LIST_REORDER_GROUP_ATTR = "data-list-reorder-group";
export const LIST_REORDER_APPEND_ATTR = "data-list-reorder-append";

/** Ignore interactive controls when starting a pointer drag. */
export const LIST_REORDER_NO_DRAG_SELECTOR =
  "button, input, textarea, a, select, [data-list-reorder-no-drag], [role='combobox'], [role='listbox']";

export type GroupedListPointerDropTarget =
  | { kind: "before-item"; itemId: string; groupKey: string }
  | { kind: "append-group"; groupKey: string };

export type GroupedListPointerReorderRequest = {
  itemId: string;
  fromGroupKey: string;
  toGroupKey: string;
  beforeItemId: string | null;
};

function readAttr(element: Element, name: string): string | null {
  const value = element.getAttribute(name);
  return value && value.length > 0 ? value : null;
}

/**
 * Resolve the drop target under the pointer for a vertical grouped list.
 * Item targets always insert *before* the hovered row (matches prior HTML5 UX).
 */
export function resolveGroupedListPointerDropTarget(
  clientX: number,
  clientY: number,
  draggingItemId: string,
): GroupedListPointerDropTarget | null {
  const stack = document.elementsFromPoint(clientX, clientY);

  for (const node of stack) {
    if (!(node instanceof Element)) continue;

    const itemHost = node.closest(`[${LIST_REORDER_ITEM_ATTR}]`);
    if (itemHost) {
      const itemId = readAttr(itemHost, LIST_REORDER_ITEM_ATTR);
      const groupKey = readAttr(itemHost, LIST_REORDER_GROUP_ATTR);
      if (!itemId || !groupKey) continue;
      if (itemId === draggingItemId) return null;
      return { kind: "before-item", itemId, groupKey };
    }

    const appendHost = node.closest(`[${LIST_REORDER_APPEND_ATTR}]`);
    if (appendHost) {
      const groupKey = readAttr(appendHost, LIST_REORDER_APPEND_ATTR);
      if (groupKey) return { kind: "append-group", groupKey };
    }
  }

  return null;
}

export function groupedListPointerDropToRequest(input: {
  itemId: string;
  fromGroupKey: string;
  target: GroupedListPointerDropTarget;
}): GroupedListPointerReorderRequest {
  if (input.target.kind === "append-group") {
    return {
      itemId: input.itemId,
      fromGroupKey: input.fromGroupKey,
      toGroupKey: input.target.groupKey,
      beforeItemId: null,
    };
  }

  return {
    itemId: input.itemId,
    fromGroupKey: input.fromGroupKey,
    toGroupKey: input.target.groupKey,
    beforeItemId: input.target.itemId,
  };
}

export function insertBeforeKeyForPointerTarget(
  target: GroupedListPointerDropTarget,
  itemOrderKey: (itemId: string) => string,
  groupAppendOrderKey: (groupKey: string) => string,
): string {
  if (target.kind === "append-group") {
    return groupAppendOrderKey(target.groupKey);
  }
  return itemOrderKey(target.itemId);
}
