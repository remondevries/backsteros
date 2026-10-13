import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

/**
 * Focus a property-menu search field when the menu opens.
 * Base UI’s FloatingFocusManager / radio-group focus often overrides native
 * `autoFocus` and a single rAF, so we reclaim focus across a short settle window
 * (same idea as desktop SearchableDropdown).
 */
export function useFocusPropertyMenuSearch(open: boolean): RefObject<HTMLInputElement | null> {
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const timeoutIds: number[] = [];
    let raf1 = 0;
    let raf2 = 0;

    const tryFocus = () => {
      if (cancelled) return;
      const el = searchRef.current;
      if (!el || !el.isConnected) return;
      if (document.activeElement === el) return;
      el.focus({ preventScroll: true });
    };

    tryFocus();
    raf1 = window.requestAnimationFrame(() => {
      tryFocus();
      raf2 = window.requestAnimationFrame(tryFocus);
    });

    for (const delay of [0, 10, 25, 50, 100, 200]) {
      timeoutIds.push(window.setTimeout(tryFocus, delay));
    }

    // Reclaim if Base UI moves focus onto a menu item right after open.
    function onFocusIn(event: FocusEvent) {
      if (cancelled) return;
      const el = searchRef.current;
      if (!el) return;
      const target = event.target;
      if (!(target instanceof Node) || target === el) return;
      const menu = el.closest(".bos-task-property-menu");
      if (!menu || !menu.contains(target)) return;
      tryFocus();
    }

    document.addEventListener("focusin", onFocusIn, true);
    timeoutIds.push(
      window.setTimeout(() => {
        document.removeEventListener("focusin", onFocusIn, true);
      }, 300),
    );

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      for (const id of timeoutIds) window.clearTimeout(id);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [open]);

  return searchRef;
}

/**
 * While a property menu is open, printable keys filter the search field even if
 * Base UI typeahead briefly owns focus on a menu item (desktop parity).
 */
export function usePropertyMenuSearchTyping(
  open: boolean,
  searchRef: RefObject<HTMLInputElement | null>,
  setQuery: Dispatch<SetStateAction<string>>,
): void {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.isComposing) return;
      if (event.key.length !== 1) return;

      const el = searchRef.current;
      if (!el || !el.isConnected) return;
      if (document.activeElement === el) return;

      const menu = el.closest(".bos-task-property-menu");
      if (!menu) return;
      const active = document.activeElement;
      if (!(active instanceof Node) || !menu.contains(active)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      el.focus({ preventScroll: true });
      setQuery((current) => `${current}${event.key}`);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, searchRef, setQuery]);
}
