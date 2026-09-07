import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyShiftRangeSelection,
  useKeyHeld,
} from "./shift-range-selection.js";
import { useListClearSelectionShortcut } from "./use-list-clear-selection-shortcut.js";
import { useListSelectAllShortcut } from "./use-list-select-all-shortcut.js";
import { useListToggleHighlightedSelectionShortcut } from "./use-list-toggle-highlighted-selection-shortcut.js";

export type UseListMultiSelectOptions = {
  /** When false, ⌘A / Ctrl+A is ignored (e.g. board view). Default true. */
  selectAllShortcutEnabled?: boolean;
  /** When false, Escape does not clear selection. Default true. */
  clearSelectionShortcutEnabled?: boolean;
  /**
   * Keyboard-highlighted row id. When set, Shift+Space toggles that row's
   * checkbox in place.
   */
  highlightedId?: string | null;
  /**
   * When false, Shift+Space toggle is ignored (e.g. board view).
   * Default true when `highlightedId` is provided.
   */
  toggleHighlightedShortcutEnabled?: boolean;
};

/**
 * Multi-select for list rows (finance transactions → tasks).
 * Supports click toggle, shift-click ranges, ⌘A / Ctrl+A select all,
 * Shift+Space toggle highlighted, Shift+J/K and Shift+ArrowUp/Down
 * extend-while-navigating (`extendSelectionAlongStep`), and Escape clear.
 */
export function useListMultiSelect(
  orderedIds: readonly string[],
  options: UseListMultiSelectOptions = {},
) {
  const {
    selectAllShortcutEnabled = true,
    clearSelectionShortcutEnabled = true,
    highlightedId = null,
    toggleHighlightedShortcutEnabled = true,
  } = options;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const lastClickedIdRef = useRef<string | null>(null);
  const orderedIdsRef = useRef(orderedIds);
  orderedIdsRef.current = orderedIds;
  const shiftHeld = useKeyHeld("Shift");
  const orderedKey = orderedIds.join("\0");

  useEffect(() => {
    const alive = new Set(orderedIdsRef.current);
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    if (lastClickedIdRef.current && !alive.has(lastClickedIdRef.current)) {
      lastClickedIdRef.current = null;
    }
  }, [orderedKey]);

  const toggleSelected = useCallback(
    (id: string, shiftKey = false) => {
      const useShift = shiftKey || shiftHeld.currentlyHeld();
      setSelectedIds((prev) => {
        const { next, lastClickedId } = applyShiftRangeSelection(prev, id, {
          shiftKey: useShift,
          orderedIds: orderedIdsRef.current,
          lastClickedId: lastClickedIdRef.current,
        });
        lastClickedIdRef.current = lastClickedId;
        return next;
      });
    },
    [shiftHeld],
  );

  /**
   * Check boxes for the row you left and the row you landed on while
   * Shift+J/K or Shift+ArrowUp/Down navigating (additive; does not uncheck).
   */
  const extendSelectionAlongStep = useCallback(
    (fromId: string | null, toId: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (fromId) next.add(fromId);
        next.add(toId);
        return next;
      });
      if (!lastClickedIdRef.current && fromId) {
        lastClickedIdRef.current = fromId;
      } else {
        lastClickedIdRef.current = toId;
      }
    },
    [],
  );

  const selectAll = useCallback(() => {
    const ids = orderedIdsRef.current;
    setSelectedIds(new Set(ids));
    lastClickedIdRef.current = ids[ids.length - 1] ?? null;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
  }, []);

  useListSelectAllShortcut({
    enabled: selectAllShortcutEnabled && orderedIds.length > 0,
    onSelectAll: selectAll,
  });

  const toggleHighlighted = useCallback(
    (id: string) => {
      toggleSelected(id, false);
    },
    [toggleSelected],
  );

  useListToggleHighlightedSelectionShortcut({
    enabled:
      toggleHighlightedShortcutEnabled &&
      orderedIds.length > 0 &&
      highlightedId != null,
    highlightedId,
    onToggle: toggleHighlighted,
  });

  const hasBulkSelection = selectedIds.size > 0;

  useListClearSelectionShortcut({
    enabled: clearSelectionShortcutEnabled && hasBulkSelection,
    onClear: clearSelection,
  });

  return useMemo(
    () => ({
      selectedIds,
      hasBulkSelection,
      isSelected: (id: string) => selectedIds.has(id),
      toggleSelected,
      extendSelectionAlongStep,
      selectAll,
      clearSelection,
    }),
    [
      clearSelection,
      extendSelectionAlongStep,
      hasBulkSelection,
      selectAll,
      selectedIds,
      toggleSelected,
    ],
  );
}
