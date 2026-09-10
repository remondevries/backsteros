import { isElectron } from "../../env";
import { SidebarChromeFooter, SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { PullRequestsSidebarList } from "./PullRequestsSidebarList";

/**
 * Left rail for /pull-requests — coder chrome + full PR list (search / sort / filter).
 */
export function PullRequestsPageSidebar() {
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <PullRequestsSidebarList />
      <SidebarChromeFooter />
    </>
  );
}
