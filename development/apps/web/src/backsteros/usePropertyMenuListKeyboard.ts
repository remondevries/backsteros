import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * Desktop SearchableDropdown list-nav parity for BacksterDEV property menus:
 * ArrowDown/Up (and j/k when the query is empty) move a highlight; Enter selects it.
 * Focus stays on the search field so filtering keeps working.
 */
export function usePropertyMenuListKeyboard(open: boolean, optionCount: number) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [listFocusActive, setListFocusActive] = useState(false);

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
      setListFocusActive(false);
    }
  }, [open]);

  useEffect(() => {
    if (optionCount <= 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((current) => Math.min(current, optionCount - 1));
  }, [optionCount]);

  const safeActiveIndex = optionCount === 0 ? 0 : Math.min(activeIndex, optionCount - 1);

  const activateListFocus = useCallback(
    (index: number) => {
      if (optionCount === 0) return;
      setListFocusActive(true);
      setActiveIndex(Math.max(0, Math.min(index, optionCount - 1)));
    },
    [optionCount],
  );

  const moveActiveIndex = useCallback(
    (direction: "up" | "down") => {
      if (optionCount === 0) return;
      setListFocusActive(true);
      setActiveIndex((current) => {
        const clamped = Math.min(current, optionCount - 1);
        const delta = direction === "down" ? 1 : -1;
        return Math.max(0, Math.min(clamped + delta, optionCount - 1));
      });
    },
    [optionCount],
  );

  const handleSearchListKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLInputElement>,
      options: {
        readonly query: string;
        readonly onActivateIndex: (index: number) => void;
      },
    ): boolean => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!listFocusActive) {
          activateListFocus(0);
        } else {
          moveActiveIndex("down");
        }
        return true;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!listFocusActive) {
          activateListFocus(Math.max(0, optionCount - 1));
        } else {
          moveActiveIndex("up");
        }
        return true;
      }

      if (!options.query.trim()) {
        if (event.key === "j") {
          event.preventDefault();
          if (!listFocusActive) {
            activateListFocus(0);
          } else {
            moveActiveIndex("down");
          }
          return true;
        }
        if (event.key === "k") {
          event.preventDefault();
          if (!listFocusActive) {
            activateListFocus(Math.max(0, optionCount - 1));
          } else {
            moveActiveIndex("up");
          }
          return true;
        }
      }

      if (event.key === "Enter") {
        if (event.metaKey || event.ctrlKey) return false;
        event.preventDefault();
        if (optionCount === 0) return true;
        options.onActivateIndex(safeActiveIndex);
        return true;
      }

      // Typing filters — drop list highlight so the next ArrowDown starts at top.
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        setListFocusActive(false);
        setActiveIndex(0);
      }

      return false;
    },
    [activateListFocus, listFocusActive, moveActiveIndex, optionCount, safeActiveIndex],
  );

  const optionHighlightClass = useCallback(
    (index: number) =>
      listFocusActive && index === safeActiveIndex ? "keyboard-nav-item-highlight" : undefined,
    [listFocusActive, safeActiveIndex],
  );

  return {
    safeActiveIndex,
    listFocusActive,
    handleSearchListKeyDown,
    optionHighlightClass,
  };
}
