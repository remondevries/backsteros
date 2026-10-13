/**
 * Pointer-based drop-target resolution for vertical grouped lists.
 * Prefer this over HTML5 DnD — Tauri/WebKit often never fires drop targets.
 */

export const LIST_REORDER_ITEM_ATTR = "data-list-reorder-item";
export const LIST_REORDER_GROUP_ATTR = "data-list-reorder-group";
export const LIST_REORDER_APPEND_ATTR = "data-list-reorder-append";
/** When `"grid"`, left/right half of an item chooses before vs after. */
export const LIST_REORDER_LAYOUT_ATTR = "data-list-reorder-layout";

/** Ignore interactive controls when starting a pointer drag. */
export const LIST_REORDER_NO_DRAG_SELECTOR =
  "button, input, textarea, a, select, [data-list-reorder-no-drag], [role='combobox'], [role='listbox']";

export type GroupedListPointerDropTarget =
  | { kind: "before-item"; itemId: string; groupKey: string }
  | { kind: "after-item"; itemId: string; groupKey: string }
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

function resolveItemDropSide(
  itemHost: Element,
  clientX: number,
): "before" | "after" {
  if (readAttr(itemHost, LIST_REORDER_LAYOUT_ATTR) !== "grid") {
    return "before";
  }
  const rect = itemHost.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width <= 0) {
    return "before";
  }
  const midX = rect.left + rect.width / 2;
  return clientX >= midX ? "after" : "before";
}

function itemTargetFromHost(
  itemHost: Element,
  clientX: number,
  draggingItemId: string,
): GroupedListPointerDropTarget | null {
  const itemId = readAttr(itemHost, LIST_REORDER_ITEM_ATTR);
  const groupKey = readAttr(itemHost, LIST_REORDER_GROUP_ATTR);
  if (!itemId || !groupKey) return null;
  if (itemId === draggingItemId) return null;
  const side = resolveItemDropSide(itemHost, clientX);
  return side === "after"
    ? { kind: "after-item", itemId, groupKey }
    : { kind: "before-item", itemId, groupKey };
}

/**
 * Resolve the drop target under the pointer for a vertical grouped list.
 * Item targets insert *before* the hovered row by default. With
 * `data-list-reorder-layout="grid"`, the right half inserts *after*.
 *
 * When reorder hosts nest (e.g. a parent section wrapping child rows, or an
 * append zone inside an item host), prefer the deepest host under the pointer
 * so child rows and append strips win over ancestor section items.
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
    const appendHost = node.closest(`[${LIST_REORDER_APPEND_ATTR}]`);

    if (itemHost && appendHost && itemHost !== appendHost) {
      if (itemHost.contains(appendHost)) {
        const groupKey = readAttr(appendHost, LIST_REORDER_APPEND_ATTR);
        if (groupKey) return { kind: "append-group", groupKey };
      }
      if (appendHost.contains(itemHost)) {
        const target = itemTargetFromHost(itemHost, clientX, draggingItemId);
        if (target) return target;
        continue;
      }
    }

    if (itemHost) {
      const target = itemTargetFromHost(itemHost, clientX, draggingItemId);
      if (target) return target;
      continue;
    }

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
  /** Next sibling in the target group — used for after-item → before next. */
  getNextItemId?: (itemId: string, groupKey: string) => string | null;
}): GroupedListPointerReorderRequest {
  if (input.target.kind === "append-group") {
    return {
      itemId: input.itemId,
      fromGroupKey: input.fromGroupKey,
      toGroupKey: input.target.groupKey,
      beforeItemId: null,
    };
  }

  if (input.target.kind === "after-item") {
    const nextId =
      input.getNextItemId?.(input.target.itemId, input.target.groupKey) ?? null;
    return {
      itemId: input.itemId,
      fromGroupKey: input.fromGroupKey,
      toGroupKey: input.target.groupKey,
      beforeItemId: nextId,
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
  if (target.kind === "after-item") {
    return `${itemOrderKey(target.itemId)}:after`;
  }
  return itemOrderKey(target.itemId);
}
