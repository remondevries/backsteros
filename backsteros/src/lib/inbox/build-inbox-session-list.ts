import {
  getInboxAttentionGroupKey,
  sortInboxItemsByAttentionStatus,
  type InboxListItem,
} from "@backsteros/ui";

export type InboxSessionPin = {
  item: InboxListItem;
  /** Section the row was in when the user opened it (keeps position after ack). */
  attentionGroup: string;
};

function withoutInboxUpdatedFlag(item: InboxListItem): InboxListItem {
  if (item.kind === "letter") return item;
  return { ...item, inboxUpdatedAt: null };
}

function mergeItemMaps(
  sortedItems: readonly InboxListItem[],
  pinnedItems: ReadonlyMap<string, InboxSessionPin>,
  selectedItemId: string | null,
): Map<string, InboxListItem> {
  const byItemId = new Map(sortedItems.map((item) => [item.id, item] as const));
  // When the live inbox is empty, never resurrect pin-only ghosts — otherwise
  // the last acked Updated row stays forever (and auto-select keeps reopening it).
  if (sortedItems.length === 0) {
    return byItemId;
  }

  for (const [itemId, pin] of pinnedItems) {
    const existing = byItemId.get(itemId);
    if (existing) {
      // Live row wins — keep pin only to strip the Updated flag for this visit.
      byItemId.set(itemId, withoutInboxUpdatedFlag(existing));
      continue;
    }
    // Pin-only rows are for acknowledging Updated without the row jumping
    // while that item is still open among remaining live rows.
    if (pin.attentionGroup === "updated" && selectedItemId === itemId) {
      byItemId.set(itemId, withoutInboxUpdatedFlag(pin.item));
    }
  }

  return byItemId;
}

function insertNewItemsInDisplayOrder(
  currentOrder: readonly string[],
  newItems: readonly InboxListItem[],
  byItemId: ReadonlyMap<string, InboxListItem>,
  referenceDate: Date,
): string[] {
  const order = [...currentOrder];
  for (const newItem of newItems) {
    const newRank = attentionGroupRank(
      getInboxAttentionGroupKey(newItem, referenceDate),
    );
    let insertAt = order.length;
    for (let index = 0; index < order.length; index += 1) {
      const existing = byItemId.get(order[index]!);
      if (!existing) continue;
      const rank = attentionGroupRank(
        getInboxAttentionGroupKey(existing, referenceDate),
      );
      if (newRank < rank) {
        insertAt = index;
        break;
      }
    }
    order.splice(insertAt, 0, newItem.id);
  }
  return order;
}

function attentionGroupRank(groupKey: string): number {
  const order = [
    "updated",
    "triage",
    "agents",
    "overdue",
    "in_progress",
    "waiting",
    "on_hold",
    "in_review",
    "other",
  ];
  const index = order.indexOf(groupKey);
  return index >= 0 ? index : order.length;
}

export function buildInboxAttentionGroupOverrides(
  pinnedItems: ReadonlyMap<string, InboxSessionPin>,
): Map<string, string> {
  const overrides = new Map<string, string>();
  for (const [itemId, pin] of pinnedItems) {
    overrides.set(itemId, pin.attentionGroup);
  }
  return overrides;
}

export function buildInboxSessionList(input: {
  sortedItems: readonly InboxListItem[];
  pinnedItems: ReadonlyMap<string, InboxSessionPin>;
  displayOrder: readonly string[];
  /**
   * Open inbox row id. Pin-only Updated ghosts stay only while this matches —
   * otherwise the list can go fully empty after the last item is finished.
   */
  selectedItemId?: string | null;
  referenceDate?: Date;
}): { items: InboxListItem[]; displayOrder: string[] } {
  const referenceDate = input.referenceDate ?? new Date();
  const selectedItemId = input.selectedItemId ?? null;
  const byItemId = mergeItemMaps(
    input.sortedItems,
    input.pinnedItems,
    selectedItemId,
  );

  if (input.displayOrder.length === 0) {
    const order = input.sortedItems.map((item) => item.id);
    for (const pin of input.pinnedItems.values()) {
      if (!order.includes(pin.item.id) && byItemId.has(pin.item.id)) {
        order.push(pin.item.id);
      }
    }
    const items = order
      .map((itemId) => byItemId.get(itemId))
      .filter((item): item is InboxListItem => item != null);
    return { items, displayOrder: order };
  }

  const order: string[] = [];
  const seen = new Set<string>();

  for (const itemId of input.displayOrder) {
    if (!byItemId.has(itemId)) continue;
    order.push(itemId);
    seen.add(itemId);
  }

  const newItems = [...byItemId.values()].filter((item) => !seen.has(item.id));
  let finalOrder = order;
  if (newItems.length > 0) {
    const sortedNew = sortInboxItemsByAttentionStatus(newItems, referenceDate);
    finalOrder = insertNewItemsInDisplayOrder(
      order,
      sortedNew,
      byItemId,
      referenceDate,
    );
  }

  const items = finalOrder
    .map((itemId) => byItemId.get(itemId))
    .filter((item): item is InboxListItem => item != null);

  return { items, displayOrder: finalOrder };
}

/**
 * How long a freshly-empty list must persist before it replaces painted rows.
 * Live queries briefly yield `[]` on re-subscribe; committing that flashed the
 * empty state and reset display order ("tasks sometimes don't load").
 */
export const INBOX_EMPTY_COMMIT_DELAY_MS = 400;

/** True when `next` is an unconfirmed empty that should keep `lastPainted`. */
export function shouldHoldInboxSessionList(input: {
  next: readonly InboxListItem[];
  lastPainted: readonly InboxListItem[];
  emptyConfirmed: boolean;
}): boolean {
  return (
    input.next.length === 0 &&
    input.lastPainted.length > 0 &&
    !input.emptyConfirmed
  );
}
