import { useLocation } from "@tanstack/react-router";

import { isElectron } from "../../env";
import { SidebarChromeFooter, SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { isUsageSectionId, UsageSidebarNav, type UsageSectionId } from "./UsageSidebarNav";

function usageSectionFromSearch(search: unknown): UsageSectionId {
  if (!search || typeof search !== "object") return "premium";
  const section = (search as { section?: unknown }).section;
  return isUsageSectionId(section) ? section : "premium";
}

/**
 * Left rail for /usage — coder chrome + Prepaid / Premium nav + footer.
 */
export function UsagePageSidebar() {
  const section = useLocation({
    select: (location) => usageSectionFromSearch(location.search),
  });

  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <UsageSidebarNav activeId={section} />
      <SidebarChromeFooter />
    </>
  );
}
