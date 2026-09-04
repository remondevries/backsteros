"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import { normalizeTabHref } from "../navigation/tabs.js";
import { primeTabTitle } from "../navigation/primed-tab-title.js";

export type RegisterPageTitleContextValue = {
  pathname: string;
  registerPageTitle: (href: string, title: string) => void;
  registerPageIcon?: (href: string, icon: string | null) => void;
  updateActiveTabTitle?: (title: string, forHref?: string) => void;
  updateActiveTabIcon?: (icon: string | null, forHref?: string) => void;
};

const RegisterPageTitleContext =
  createContext<RegisterPageTitleContextValue | null>(null);

export function RegisterPageTitleProvider({
  pathname,
  registerPageTitle,
  registerPageIcon,
  updateActiveTabTitle,
  updateActiveTabIcon,
  children,
}: RegisterPageTitleContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      pathname,
      registerPageTitle,
      registerPageIcon,
      updateActiveTabTitle,
      updateActiveTabIcon,
    }),
    [
      pathname,
      registerPageTitle,
      registerPageIcon,
      updateActiveTabTitle,
      updateActiveTabIcon,
    ],
  );

  return (
    <RegisterPageTitleContext.Provider value={value}>
      {children}
    </RegisterPageTitleContext.Provider>
  );
}

export function useRegisterPageTitleContext(): RegisterPageTitleContextValue | null {
  return useContext(RegisterPageTitleContext);
}

type RegisterPageTitleProps = {
  title: string;
  /**
   * When false, skip registration (hidden keep-alive panes). Default true.
   */
  active?: boolean;
  /**
   * Route this title belongs to. Defaults to the chrome pathname.
   * Keep-alive pages should pass their frozen shell pathname so a hidden
   * pane never primes or labels a different visible route.
   */
  href?: string;
};

/**
 * Whether a page title registrar may bind to the chrome route.
 * Hidden keep-alive panes must not stamp their entity name onto another path.
 */
export function shouldApplyPageTitleToChrome(input: {
  chromePathname: string;
  titleHref?: string | null;
  active?: boolean;
}): boolean {
  if (input.active === false) return false;
  const chrome = normalizeTabHref(input.chromePathname);
  const target = normalizeTabHref(input.titleHref ?? input.chromePathname);
  return target === chrome;
}

/**
 * Pushes the real entity title into navigation history (+ optional active tab),
 * matching Next RegisterTabTitle.
 */
export function RegisterPageTitle({
  title,
  active = true,
  href,
}: RegisterPageTitleProps) {
  const ctx = useRegisterPageTitleContext();

  useEffect(() => {
    if (!ctx || !title.trim()) return;
    if (
      !shouldApplyPageTitleToChrome({
        chromePathname: ctx.pathname,
        titleHref: href,
        active,
      })
    ) {
      return;
    }
    const target = normalizeTabHref(href ?? ctx.pathname);
    // Prime before updating the tab so a parent path-sync effect that runs
    // later in the same commit still resolves the real entity title.
    primeTabTitle(target, title);
    ctx.registerPageTitle(target, title);
    ctx.updateActiveTabTitle?.(title, target);
  }, [active, ctx, href, title]);

  return null;
}

export function RegisterPageIcon({
  icon,
  active = true,
  href,
}: {
  icon: string | null;
  active?: boolean;
  href?: string;
}) {
  const ctx = useRegisterPageTitleContext();

  useEffect(() => {
    if (!ctx) return;
    if (
      !shouldApplyPageTitleToChrome({
        chromePathname: ctx.pathname,
        titleHref: href,
        active,
      })
    ) {
      return;
    }
    const target = normalizeTabHref(href ?? ctx.pathname);
    ctx.registerPageIcon?.(target, icon);
    ctx.updateActiveTabIcon?.(icon, target);
  }, [active, ctx, href, icon]);

  return null;
}
