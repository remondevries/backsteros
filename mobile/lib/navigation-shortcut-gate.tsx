import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { clearGoLeaderSequence } from "./go-leader-sequence";

type NavigationShortcutGateContextValue = {
  suspended: boolean;
  setSuspended: (suspended: boolean) => void;
};

const NavigationShortcutGateContext =
  createContext<NavigationShortcutGateContextValue>({
    suspended: false,
    setSuspended: () => {},
  });

export function NavigationShortcutGateProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [suspended, setSuspended] = useState(false);
  const value = useMemo(() => ({ suspended, setSuspended }), [suspended]);
  return (
    <NavigationShortcutGateContext.Provider value={value}>
      {children}
    </NavigationShortcutGateContext.Provider>
  );
}

export function useNavigationShortcutsSuspended(): boolean {
  return useContext(NavigationShortcutGateContext).suspended;
}

/**
 * Suspend app Go / Escape navigation shortcuts while `suspended` is true
 * (e.g. Settings → Server terminal, so Magic Keyboard keys reach the PTY).
 */
export function useSuspendNavigationShortcuts(suspended: boolean) {
  const { setSuspended } = useContext(NavigationShortcutGateContext);
  useEffect(() => {
    setSuspended(suspended);
    if (suspended) {
      clearGoLeaderSequence();
    }
    return () => setSuspended(false);
  }, [setSuspended, suspended]);
}
