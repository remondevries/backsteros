"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useNavigationHistory } from "@/components/navigation/navigation-history-provider";
import { useTabs } from "@/components/shell/tabs-provider";

/** Keep the active tab + recently-viewed history icons in sync with the entity icon. */
export function useRegisterTabIcon(icon: string | null) {
  const pathname = usePathname();
  const { updateTabIconForHref } = useTabs();
  const { registerPageIcon } = useNavigationHistory();

  useEffect(() => {
    updateTabIconForHref(pathname, icon);
    registerPageIcon(pathname, icon);
  }, [icon, pathname, registerPageIcon, updateTabIconForHref]);
}
