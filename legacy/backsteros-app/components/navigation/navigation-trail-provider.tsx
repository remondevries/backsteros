"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { BreadcrumbItem } from "@/components/shell/breadcrumb";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";

type NavigationTrailContextValue = {
  extraItems: BreadcrumbItem[];
  setExtraItems: (items: BreadcrumbItem[]) => void;
};

const NavigationTrailContext =
  createContext<NavigationTrailContextValue | null>(null);

const mobileNavigationTrailFallback: NavigationTrailContextValue = {
  extraItems: [],
  setExtraItems: () => {},
};

export function NavigationTrailProvider({ children }: { children: ReactNode }) {
  const [extraItems, setExtraItemsState] = useState<BreadcrumbItem[]>([]);
  const setExtraItems = useCallback((items: BreadcrumbItem[]) => {
    setExtraItemsState(items);
  }, []);
  const value = useMemo(
    () => ({ extraItems, setExtraItems }),
    [extraItems, setExtraItems],
  );

  return (
    <NavigationTrailContext.Provider value={value}>
      {children}
    </NavigationTrailContext.Provider>
  );
}

function useNavigationTrailContext() {
  const context = useContext(NavigationTrailContext);
  if (!context) {
    if (isMobileShellBuildActive()) {
      return mobileNavigationTrailFallback;
    }
    throw new Error(
      "useNavigationTrailContext must be used within NavigationTrailProvider",
    );
  }
  return context;
}

export function RegisterNavigationTrail({
  items,
}: {
  items: BreadcrumbItem[];
}) {
  const { setExtraItems } = useNavigationTrailContext();
  const itemsRef = useRef(items);
  const registrationKey = items
    .map((item) => `${item.label}:${item.href ?? ""}`)
    .join("|");
  const skipRegistration = isMobileShellBuildActive();

  useLayoutEffect(() => {
    itemsRef.current = items;
  });

  useLayoutEffect(() => {
    if (skipRegistration) {
      return;
    }

    setExtraItems(itemsRef.current);
    return () => setExtraItems([]);
  }, [registrationKey, setExtraItems, skipRegistration]);

  return null;
}

export function useNavigationTrailItems() {
  return useNavigationTrailContext().extraItems;
}
