/**
 * Chat list anchoring helpers.
 * Adapted from pingdotgg/t3code (MIT) — packages/shared/src/chatList.ts
 */

export const CHAT_LIST_ANCHOR_OFFSET = 16;

export type ChatListAnchoredEndSpace = {
  readonly anchorIndex: number;
  readonly anchorOffset: number;
};

export type ChatListAnchorOptions = {
  readonly anchorOffset?: number;
};

/** Resolve LegendList `anchoredEndSpace` for the active user-message anchor. */
export function resolveChatListAnchoredEndSpace<Item, AnchorId>(
  items: ReadonlyArray<Item>,
  anchorId: AnchorId | null,
  getAnchorId: (item: Item) => AnchorId | null,
  options: ChatListAnchorOptions = {},
): ChatListAnchoredEndSpace | undefined {
  if (anchorId === null) {
    return undefined;
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && getAnchorId(item) === anchorId) {
      return {
        anchorIndex: index,
        anchorOffset: options.anchorOffset ?? CHAT_LIST_ANCHOR_OFFSET,
      };
    }
  }

  return undefined;
}
