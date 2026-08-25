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
): Map<string, InboxListItem> {
  const byItemId = new Map(sortedItems.map((item) => [item.id, item] as const));

  for (const [itemId, pin] of pinnedItems) {
    const existing = byItemId.get(itemId);
    byItemId.set(
      itemId,
      existing ? withoutInboxUpdatedFlag(existing) : withoutInboxUpdatedFlag(pin.item),
    );
  }

  for (const pin of pinnedItems.values()) {
    if (!byItemId.has(pin.item.id)) {
      byItemId.set(pin.item.id, withoutInboxUpdatedFlag(pin.item));
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
  referenceDate?: Date;
}): { items: InboxListItem[]; displayOrder: string[] } {
  const referenceDate = input.referenceDate ?? new Date();
  const byItemId = mergeItemMaps(input.sortedItems, input.pinnedItems);

  if (input.displayOrder.length === 0) {
    const order = input.sortedItems.map((item) => item.id);
    for (const pin of input.pinnedItems.values()) {
      if (!order.includes(pin.item.id)) {
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
