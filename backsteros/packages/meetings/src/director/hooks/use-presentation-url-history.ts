import { useCallback, useRef, useState } from "react";

/**
 * Host-side URL stack for iframe navigation (back / forward).
 * Only tracks URLs the host explicitly commits — not in-iframe SPA routing.
 */
export function usePresentationUrlHistory(onUrlChange: (url: string | null) => void) {
  const stackRef = useRef<string[]>([]);
  const indexRef = useRef(-1);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const syncFlags = useCallback(() => {
    setCanGoBack(indexRef.current > 0);
    setCanGoForward(indexRef.current < stackRef.current.length - 1);
  }, []);

  const pushUrl = useCallback(
    (url: string | null) => {
      if (!url) {
        stackRef.current = [];
        indexRef.current = -1;
        syncFlags();
        onUrlChange(null);
        return;
      }
      const stack = stackRef.current;
      const index = indexRef.current;
      if (index >= 0 && stack[index] === url) {
        onUrlChange(url);
        return;
      }
      const nextStack = stack.slice(0, index + 1);
      nextStack.push(url);
      stackRef.current = nextStack;
      indexRef.current = nextStack.length - 1;
      syncFlags();
      onUrlChange(url);
    },
    [onUrlChange, syncFlags],
  );

  const goBack = useCallback(() => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    syncFlags();
    onUrlChange(stackRef.current[indexRef.current] ?? null);
  }, [onUrlChange, syncFlags]);

  const goForward = useCallback(() => {
    if (indexRef.current >= stackRef.current.length - 1) return;
    indexRef.current += 1;
    syncFlags();
    onUrlChange(stackRef.current[indexRef.current] ?? null);
  }, [onUrlChange, syncFlags]);

  const reset = useCallback(() => {
    stackRef.current = [];
    indexRef.current = -1;
    syncFlags();
  }, [syncFlags]);

  return {
    pushUrl,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    reset,
  };
}
