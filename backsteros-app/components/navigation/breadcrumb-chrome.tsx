"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { BreadcrumbChromeSkeleton } from "@/components/navigation/breadcrumb-chrome-skeleton";
import { NavigationBreadcrumb } from "@/components/navigation/navigation-breadcrumb";
import { useNavigationTrailItems } from "@/components/navigation/navigation-trail-provider";
import type { BreadcrumbItem } from "@/components/shell/breadcrumb";
import { useMounted } from "@/hooks/use-mounted";
import {
  getAppPageBreadcrumbConfig,
  isTasksSectionTaskDetailPath,
  pathnameExpectsBreadcrumbChrome,
} from "@/lib/breadcrumb-items";
import { getActiveBreadcrumbExtraItems } from "@/lib/breadcrumb-trailing-items";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";

type BreadcrumbChromeRegistration = {
  anchors: BreadcrumbItem[];
  includeTrailingItems?: (pathname: string) => boolean;
};

type BreadcrumbChromeContextValue = {
  registration: BreadcrumbChromeRegistration | null;
  setRegistration: (next: BreadcrumbChromeRegistration | null) => void;
};

const BreadcrumbChromeContext =
  createContext<BreadcrumbChromeContextValue | null>(null);

export function BreadcrumbChromeProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] =
    useState<BreadcrumbChromeRegistration | null>(null);
  const value = useMemo(
    () => ({ registration, setRegistration }),
    [registration],
  );

  return (
    <BreadcrumbChromeContext.Provider value={value}>
      {children}
    </BreadcrumbChromeContext.Provider>
  );
}

function useBreadcrumbChromeContext() {
  const context = useContext(BreadcrumbChromeContext);
  if (!context) {
    throw new Error(
      "Breadcrumb chrome hooks must be used within BreadcrumbChromeProvider",
    );
  }
  return context;
}

/**
 * Circle layout chromes render NavigationBreadcrumb in-tree. BOS uses a catch-all
 * workspace router, so screens register anchors here and BreadcrumbChromeHost
 * renders them above page-scroll (same visual slot as Circle's content chrome).
 */
export function RegisterBreadcrumbChrome({
  anchors,
  includeTrailingItems,
}: BreadcrumbChromeRegistration) {
  const { setRegistration } = useBreadcrumbChromeContext();
  const anchorsRef = useRef(anchors);
  const predicateRef = useRef(includeTrailingItems);
  const registrationKey = [
    anchors.map((item) => `${item.label}:${item.href ?? ""}`).join("|"),
    includeTrailingItems ? "trailing" : "static",
  ].join("::");

  useLayoutEffect(() => {
    anchorsRef.current = anchors;
    predicateRef.current = includeTrailingItems;
  });

  useLayoutEffect(() => {
    if (isMobileShellBuildActive()) {
      return;
    }

    setRegistration({
      anchors: anchorsRef.current,
      includeTrailingItems: predicateRef.current,
    });
    return () => setRegistration(null);
  }, [registrationKey, setRegistration]);

  return null;
}

/** Renders registered anchors (+ leaves), with AppPageChrome fallback for top-level routes. */
export function BreadcrumbChromeHost() {
  const pathname = usePathname();
  const mounted = useMounted();
  const { registration } = useBreadcrumbChromeContext();
  const extraItems = useNavigationTrailItems();
  const appConfig = getAppPageBreadcrumbConfig(pathname);

  if (isMobileShellBuildActive()) {
    return null;
  }

  const anchors =
    registration?.anchors ??
    (appConfig.showBreadcrumb ? appConfig.anchors : []);

  if (anchors.length === 0) {
    return pathnameExpectsBreadcrumbChrome(pathname) ? (
      <BreadcrumbChromeSkeleton />
    ) : null;
  }

  const includeTrailingItems =
    registration?.includeTrailingItems ??
    (appConfig.includeTrailingItems
      ? (currentPathname: string) =>
          isTasksSectionTaskDetailPath(currentPathname)
      : undefined);

  const leafItems =
    mounted && includeTrailingItems
      ? getActiveBreadcrumbExtraItems(
          pathname,
          extraItems,
          includeTrailingItems,
        )
      : [];

  return <NavigationBreadcrumb anchors={anchors} leafItems={leafItems} />;
}
