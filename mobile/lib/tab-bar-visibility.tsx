import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "expo-router";

import { isPadDevice } from "./device";
import { shouldHideTabBarForPathname } from "./tab-bar-detail-routes";

type TabBarVisibilityContextValue = {
  hidden: boolean;
  /** @deprecated Prefer useHideTabBar — kept for rare direct callers. */
  setHidden: (hidden: boolean) => void;
  acquireHide: () => void;
  releaseHide: () => void;
};

const TabBarVisibilityContext = createContext<TabBarVisibilityContextValue>({
  hidden: false,
  setHidden: () => {},
  acquireHide: () => {},
  releaseHide: () => {},
});

export function TabBarVisibilityProvider({ children }: { children: ReactNode }) {
  const [hideCount, setHideCount] = useState(0);

  const acquireHide = useCallback(() => {
    setHideCount((count) => count + 1);
  }, []);

  const releaseHide = useCallback(() => {
    setHideCount((count) => Math.max(0, count - 1));
  }, []);

  const setHidden = useCallback((hidden: boolean) => {
    setHideCount(hidden ? 1 : 0);
  }, []);

  const value = useMemo(
    () => ({
      hidden: hideCount > 0,
      setHidden,
      acquireHide,
      releaseHide,
    }),
    [hideCount, setHidden, acquireHide, releaseHide],
  );

  return (
    <TabBarVisibilityContext.Provider value={value}>
      {children}
    </TabBarVisibilityContext.Provider>
  );
}

export function useTabBarVisibility() {
  return useContext(TabBarVisibilityContext);
}

/**
 * Hide the floating tab bar while `hidden` is true (e.g. fullscreen PDF /
 * properties sheet). Uses a ref-count so overlapping hide requests cannot leave
 * the bar stuck invisible when one caller unmounts.
 */
export function useHideTabBar(hidden: boolean) {
  const { acquireHide, releaseHide } = useTabBarVisibility();
  useEffect(() => {
    if (!hidden) return;
    acquireHide();
    return () => releaseHide();
  }, [hidden, acquireHide, releaseHide]);
}

/** Hide the tab bar on phone detail/create routes (see tab-bar-detail-routes). */
export function TabBarDetailRouteHider() {
  const pathname = usePathname();
  const hide =
    !isPadDevice() && shouldHideTabBarForPathname(pathname ?? "/");
  useHideTabBar(hide);
  return null;
}
