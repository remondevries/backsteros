export type ListKeyboardNavDirection = "up" | "down";

export function stepListKeyboardIndex(
  currentIndex: number,
  direction: ListKeyboardNavDirection,
  length: number,
): number {
  if (length === 0) return -1;
  if (direction === "down") {
    if (currentIndex < 0) return 0;
    return Math.min(currentIndex + 1, length - 1);
  }
  if (currentIndex < 0) return length - 1;
  return Math.max(currentIndex - 1, 0);
}

/** Map expo-key-event / KeyboardEvent keys to list j/k direction. */
export function listKeyboardNavDirection(
  key: string,
  character?: string | null,
): ListKeyboardNavDirection | null {
  const normalizedKey = key.trim();
  if (
    normalizedKey === "ArrowDown" ||
    normalizedKey === "Down" ||
    normalizedKey === "KeyJ"
  ) {
    return "down";
  }
  if (
    normalizedKey === "ArrowUp" ||
    normalizedKey === "Up" ||
    normalizedKey === "KeyK"
  ) {
    return "up";
  }
  const letter =
    character && /^[a-zA-Z]$/.test(character)
      ? character.toLowerCase()
      : /^[jk]$/i.test(normalizedKey)
        ? normalizedKey.toLowerCase()
        : null;
  if (letter === "j") return "down";
  if (letter === "k") return "up";
  return null;
}

export function isListKeyboardActivateKey(
  key: string,
  code?: string | null,
): boolean {
  return (
    key === "Enter" ||
    key === " " ||
    key === "Spacebar" ||
    code === "Space" ||
    code === "Enter"
  );
}

export function findSectionListLocation(
  sections: ReadonlyArray<{ data: ReadonlyArray<{ id: string }> }>,
  itemId: string,
): { sectionIndex: number; itemIndex: number } | null {
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const data = sections[sectionIndex]?.data ?? [];
    const itemIndex = data.findIndex((item) => item.id === itemId);
    if (itemIndex >= 0) return { sectionIndex, itemIndex };
  }
  return null;
}

export {
  findFlatGroupedRowIndex,
} from "./lists/flatten-grouped-sections";

type FlashListScrollTarget = {
  scrollToIndex: (opts: {
    index: number;
    animated?: boolean;
    viewPosition?: number;
  }) => void;
};

/** Scroll a FlashList grouped row into view (j/k highlight parity). */
export function scrollFlashListToItemId(
  list: FlashListScrollTarget | null | undefined,
  rowIndexByItemId: ReadonlyMap<string, number>,
  itemId: string,
  viewPosition = 0.35,
): void {
  if (!list || !itemId) return;
  const index = rowIndexByItemId.get(itemId);
  if (index == null) return;
  try {
    list.scrollToIndex({ index, animated: true, viewPosition });
  } catch {
    // List may not be laid out yet.
  }
}
