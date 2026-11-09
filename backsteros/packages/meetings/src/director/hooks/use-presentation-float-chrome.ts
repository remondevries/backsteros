import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type HTMLAttributes,
} from "react";

const IDLE_HIDE_MS = 2200;
const LEAVE_HIDE_MS = 500;

type FloatChromeProps = Pick<
  HTMLAttributes<HTMLElement>,
  | "onPointerEnter"
  | "onPointerLeave"
  | "onPointerMove"
  | "onFocusCapture"
  | "onBlurCapture"
>;

/**
 * Fade the floating presentation chrome in near the top hit area / while
 * interacting, and out after idle or when the pointer leaves that area.
 */
export function usePresentationFloatChrome() {
  const [visible, setVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const pinnedRef = useRef(false);
  const overChromeRef = useRef(false);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(
    (delayMs: number) => {
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        // Stay up while typing in the URL field; otherwise idle/leave hides
        // even if the cursor is still over the chrome.
        if (pinnedRef.current) return;
        overChromeRef.current = false;
        setVisible(false);
      }, delayMs);
    },
    [clearHideTimer],
  );

  const reveal = useCallback(() => {
    setVisible(true);
    if (pinnedRef.current) {
      clearHideTimer();
      return;
    }
    scheduleHide(IDLE_HIDE_MS);
  }, [clearHideTimer, scheduleHide]);

  const onChromePointerEnter = useCallback(() => {
    overChromeRef.current = true;
    reveal();
  }, [reveal]);

  const onChromePointerLeave = useCallback(() => {
    overChromeRef.current = false;
    if (pinnedRef.current) return;
    scheduleHide(LEAVE_HIDE_MS);
  }, [scheduleHide]);

  const onChromePointerMove = useCallback(() => {
    reveal();
  }, [reveal]);

  const onChromeFocusIn = useCallback(() => {
    pinnedRef.current = true;
    setVisible(true);
    clearHideTimer();
  }, [clearHideTimer]);

  const onChromeFocusOut = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      pinnedRef.current = false;
      if (overChromeRef.current) {
        scheduleHide(IDLE_HIDE_MS);
        return;
      }
      scheduleHide(LEAVE_HIDE_MS);
    },
    [scheduleHide],
  );

  useEffect(() => {
    scheduleHide(IDLE_HIDE_MS);
    return () => clearHideTimer();
  }, [clearHideTimer, scheduleHide]);

  const chromeProps: FloatChromeProps = {
    onPointerEnter: onChromePointerEnter,
    onPointerLeave: onChromePointerLeave,
    onPointerMove: onChromePointerMove,
    onFocusCapture: onChromeFocusIn,
    onBlurCapture: onChromeFocusOut,
  };

  return { visible, reveal, chromeProps };
}
