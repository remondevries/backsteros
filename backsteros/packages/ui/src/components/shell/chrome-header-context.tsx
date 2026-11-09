"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ChromeHeaderRegistration = {
  priority: number;
  header: ReactNode;
};

type ChromeHeaderContextValue = {
  header: ReactNode;
  setRegistration: (
    id: string,
    next: ChromeHeaderRegistration | null,
  ) => void;
};

const ChromeHeaderContext = createContext<ChromeHeaderContextValue | null>(
  null,
);

/** Pick the highest-priority registration (stable tie → last write wins). */
export function selectChromeHeader(
  registrations: Iterable<ChromeHeaderRegistration>,
): ReactNode {
  let best: ReactNode = null;
  let bestPriority = Number.NEGATIVE_INFINITY;
  for (const entry of registrations) {
    if (entry.priority >= bestPriority) {
      bestPriority = entry.priority;
      best = entry.header;
    }
  }
  return best;
}

export function ChromeHeaderProvider({ children }: { children: ReactNode }) {
  const [registrations, setRegistrations] = useState(
    () => new Map<string, ChromeHeaderRegistration>(),
  );

  const setRegistration = useCallback(
    (id: string, next: ChromeHeaderRegistration | null) => {
      setRegistrations((current) => {
        const existing = current.get(id);
        if (!next) {
          if (!existing) return current;
          const map = new Map(current);
          map.delete(id);
          return map;
        }
        if (
          existing &&
          existing.priority === next.priority &&
          Object.is(existing.header, next.header)
        ) {
          return current;
        }
        const map = new Map(current);
        map.set(id, next);
        return map;
      });
    },
    [],
  );

  const header = useMemo(
    () => selectChromeHeader(registrations.values()),
    [registrations],
  );

  const value = useMemo(
    () => ({ header, setRegistration }),
    [header, setRegistration],
  );

  return (
    <ChromeHeaderContext.Provider value={value}>
      {children}
    </ChromeHeaderContext.Provider>
  );
}

export function useChromeHeader() {
  const context = useContext(ChromeHeaderContext);
  if (!context) {
    throw new Error("useChromeHeader must be used within ChromeHeaderProvider");
  }
  return context.header;
}

export type UseRegisterChromeHeaderOptions = {
  /**
   * Higher priority wins when multiple screens register at once. Room chrome
   * must not use an elevated priority to override normal tabs — register only
   * while the room route is active.
   */
  priority?: number;
};

/**
 * Register a chrome header for the current screen. Clears on unmount / false.
 * No-op when provider is absent (keeps presentational views host-agnostic).
 * Pass `false` to skip registration entirely (nested overlays that must not
 * clobber the host trail).
 *
 * Multiple registrants are tracked by id; the highest priority header is shown
 * so releasing one registration restores another still-registered trail
 * without requiring that page to remount.
 */
export function useRegisterChromeHeader(
  header: ReactNode | false,
  options?: UseRegisterChromeHeaderOptions,
) {
  const setRegistration = useContext(ChromeHeaderContext)?.setRegistration;
  const id = useId();
  const priority = options?.priority ?? 0;

  useLayoutEffect(() => {
    if (!setRegistration) return;
    if (header === false) {
      setRegistration(id, null);
      return () => setRegistration(id, null);
    }
    setRegistration(id, { priority, header });
    return () => setRegistration(id, null);
  }, [setRegistration, header, priority, id]);
}
