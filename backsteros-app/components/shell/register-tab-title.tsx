"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useNavigationHistory } from "@/components/navigation/navigation-history-provider";
import { useTabs } from "@/components/shell/tabs-provider";
import { primeTabTitle } from "@/lib/tabs/primed-tab-title";

type RegisterTabTitleProps = {
  title: string;
};

/** Pushes the real entity title into the active tab + history (vs path-segment fallback). */
export function RegisterTabTitle({ title }: RegisterTabTitleProps) {
  const pathname = usePathname();
  const { updateActiveTabTitle } = useTabs();
  const { registerPageTitle: registerHistoryPageTitle } = useNavigationHistory();

  useEffect(() => {
    if (!title.trim()) return;
    primeTabTitle(pathname, title);
    updateActiveTabTitle(title);
    registerHistoryPageTitle(pathname, title);
  }, [
    title,
    pathname,
    updateActiveTabTitle,
    registerHistoryPageTitle,
  ]);

  return null;
}
