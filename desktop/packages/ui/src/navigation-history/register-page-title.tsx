"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

export type RegisterPageTitleContextValue = {
  pathname: string;
  registerPageTitle: (href: string, title: string) => void;
  registerPageIcon?: (href: string, icon: string | null) => void;
  updateActiveTabTitle?: (title: string) => void;
  updateActiveTabIcon?: (icon: string | null) => void;
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
};

/**
 * Pushes the real entity title into navigation history (+ optional active tab),
 * matching Next RegisterTabTitle.
 */
export function RegisterPageTitle({ title }: RegisterPageTitleProps) {
  const ctx = useRegisterPageTitleContext();

  useEffect(() => {
    if (!ctx || !title.trim()) return;
    ctx.registerPageTitle(ctx.pathname, title);
    ctx.updateActiveTabTitle?.(title);
  }, [ctx, title]);

  return null;
}

export function RegisterPageIcon({ icon }: { icon: string | null }) {
  const ctx = useRegisterPageTitleContext();

  useEffect(() => {
    if (!ctx) return;
    ctx.registerPageIcon?.(ctx.pathname, icon);
    ctx.updateActiveTabIcon?.(icon);
  }, [ctx, icon]);

  return null;
}
