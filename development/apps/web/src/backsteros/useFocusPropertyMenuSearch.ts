import { useEffect, useRef, type RefObject } from "react";

/**
 * Focus a property-menu search field when the menu opens.
 * Base UI’s menu focus management often overrides native `autoFocus`, so we
 * re-focus after open (double rAF, same idea as desktop SearchableDropdown).
 */
export function useFocusPropertyMenuSearch(open: boolean): RefObject<HTMLInputElement | null> {
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    let frame2 = 0;
    const frame1 = window.requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
      frame2 = window.requestAnimationFrame(() => {
        searchRef.current?.focus({ preventScroll: true });
      });
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [open]);

  return searchRef;
}
