"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import { ContactsSidePanel } from "@/components/contacts/contacts-side-panel";
import { EntityHeaderActionsShell } from "@/components/entity-actions/entity-header-actions-shell";
import { ProjectDocumentsSidePanel } from "@/components/documents/project-documents-side-panel";
import { InboxSidePanel } from "@/components/inbox/inbox-side-panel";
import { JournalSidePanel } from "@/components/journal/journal-side-panel";
import { KnowledgeSidePanel } from "@/components/knowledge/knowledge-side-panel";
import { LettersSidePanel } from "@/components/letters/letters-side-panel";
import { OrganizationsSidePanel } from "@/components/organizations/organizations-side-panel";
import {
  BreadcrumbChromeHost,
  BreadcrumbChromeProvider,
} from "@/components/navigation/breadcrumb-chrome";
import { NavigationHistoryProvider } from "@/components/navigation/navigation-history-provider";
import { NavigationTrailProvider } from "@/components/navigation/navigation-trail-provider";
import { ContentHeader } from "@/components/shell/content-header";
import {
  ContentSidePanelProvider,
  useContentSidePanel,
} from "@/components/shell/content-side-panel-provider";
import { ContentSidePanelPlaceholder } from "@/components/shell/content-side-panel-placeholder";
import { SettingsSidePanelNav } from "@/components/settings/settings-side-panel-nav";
import { ComposeModalGate } from "@/components/shell/compose-modal-gate";
import { SidebarNavHistoryControls } from "@/components/shell/sidebar-nav-history-controls";
import { SidebarProfileMenu } from "@/components/shell/sidebar-profile-menu";
import { TabsProvider } from "@/components/shell/tabs-provider";
import { useContentSidePanelToggleShortcut } from "@/components/shell/use-content-side-panel-toggle-shortcut";
import { useComposeShortcut } from "@/components/shortcuts/use-compose-shortcut";
import { useContentPreviewScrollShortcuts } from "@/components/shortcuts/use-content-preview-scroll-shortcuts";
import { useDocumentTreeCreateFolderShortcut } from "@/components/shortcuts/use-document-tree-create-folder-shortcut";
import { useEscapeBackNavigation } from "@/components/shortcuts/use-escape-back-navigation";
import { useNavigationShortcuts } from "@/components/shortcuts/use-navigation-shortcuts";
import { useProjectTaskViewShortcuts } from "@/components/shortcuts/use-project-task-view-shortcuts";
import { useSectionTabShortcuts } from "@/components/shortcuts/use-section-tab-shortcuts";
import { useSettingsShortcut } from "@/components/shortcuts/use-settings-shortcut";
import { useBlockBrowserTabFocus } from "@/components/shortcuts/use-block-browser-tab-focus";
import { useTabShortcuts } from "@/components/shortcuts/use-tab-shortcuts";
import { useTaskPropertyDropdownShortcuts } from "@/components/shortcuts/use-task-property-dropdown-shortcuts";
import {
  getContentSidePanelWidthKey,
  shouldShowContentSidePanel,
} from "@/lib/content-side-panel";
import { isContactSectionPath } from "@/lib/contacts/navigation-path";
import { isProjectDocumentsSectionPath } from "@/lib/document-navigation-path";
import { isJournalSectionPath } from "@/lib/journal/navigation-path";
import { isKnowledgeSectionPath } from "@/lib/knowledge/navigation-path";
import {
  isLettersSectionPath,
  isProjectLettersSectionPath,
} from "@/lib/letters/navigation-path";
import {
  isRouteFamily,
  navigation,
  routeCopy,
} from "@/lib/navigation";
import { parseNavigationTrailPath } from "@/lib/navigation-trail/codec";
import { isOrganizationSectionPath } from "@/lib/organizations/navigation-path";
import { isSettingsPath } from "@/lib/settings/tabs";
import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";
import { CommandPalette } from "./command-palette";
import { getNavigationItemIcon } from "./shell/navigation-item-icon";
import { Icon } from "./ui/icon";
import { ResizablePanel } from "./ui/resizable-panel";

const sections = [
  { id: "primary", label: "" },
  { id: "workspace", label: "Workspace" },
  { id: "people", label: "People" },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="sidebar-sections" aria-label="Workspace">
      {sections.map((section) => (
        <section key={section.id}>
          {section.label ? <h2>{section.label}</h2> : null}
          {navigation
            .filter((item) => item.section === section.id)
            .map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const NavIcon = getNavigationItemIcon(item.icon);
              if (!NavIcon) {
                return null;
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <span className="nav-icon">
                    <NavIcon />
                  </span>
                  <span className="sidebar-link-label">{item.label}</span>
                </Link>
              );
            })}
        </section>
      ))}
    </nav>
  );
}

function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className={`sidebar-inner${mobile ? " mobile" : ""}`}>
      <SidebarNavHistoryControls />
      <div className="profile-row">
        <SidebarProfileMenu />
      </div>
      <NavLinks onNavigate={onNavigate} />
      <div className="sidebar-footer">
        <SearchFooterButton />
      </div>
    </div>
  );
}

function SearchFooterButton() {
  const { openSearch } = useCommandPalette();
  return (
    <button type="button" onClick={() => openSearch()}>
      <Icon name="search" /> Search <kbd>⌘K</kbd>
    </button>
  );
}

function ContextPanel({ pathname }: { pathname: string }) {
  const familyName = pathname.split("/").filter(Boolean)[0];
  const family = isRouteFamily(familyName) ? familyName : "projects";

  let body: ReactNode;
  if (pathname === "/inbox" || pathname.startsWith("/inbox/")) {
    body = <InboxSidePanel pathname={pathname} />;
  } else if (isContactSectionPath(pathname)) {
    body = <ContactsSidePanel pathname={pathname} />;
  } else if (isProjectDocumentsSectionPath(pathname)) {
    // Before org section: org-scoped project documents keep the project docs panel.
    body = <ProjectDocumentsSidePanel pathname={pathname} />;
  } else if (
    isLettersSectionPath(pathname) ||
    isProjectLettersSectionPath(pathname)
  ) {
    body = <LettersSidePanel pathname={pathname} />;
  } else if (isOrganizationSectionPath(pathname)) {
    body = <OrganizationsSidePanel pathname={pathname} />;
  } else if (isKnowledgeSectionPath(pathname)) {
    body = <KnowledgeSidePanel pathname={pathname} />;
  } else if (isJournalSectionPath(pathname)) {
    body = <JournalSidePanel pathname={pathname} />;
  } else {
    body = (
      <ContentSidePanelPlaceholder
        title={routeCopy[family]?.singular ?? "Items"}
        description="Synced workspace views will appear here."
      />
    );
  }

  return (
    <ResizablePanel storageKey={getContentSidePanelWidthKey(pathname)}>
      {body}
    </ResizablePanel>
  );
}

function ContentFrame({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const navigationTrail = parseNavigationTrailPath(pathname);
  const effectivePathname = navigationTrail?.sourceHref ?? pathname;
  const showSidePanel = shouldShowContentSidePanel(effectivePathname);
  const { visible: sidePanelVisible } = useContentSidePanel();
  useContentSidePanelToggleShortcut({ enabled: showSidePanel });
  const showSidePanelSlot = showSidePanel && sidePanelVisible;

  return (
    <div
      className={`content-frame${showSidePanelSlot ? " content-frame-with-side" : " content-frame-main-only"}`}
    >
      {showSidePanelSlot ? (
        <ContextPanel pathname={effectivePathname} />
      ) : null}
      <main className="main-slot">
        <BreadcrumbChromeHost />
        <div className="page-scroll">{children}</div>
      </main>
    </div>
  );
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const settingsPage = isSettingsPath(pathname);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("backsteros:sidebar-visible");
    if (stored === null) return;
    const frame = requestAnimationFrame(() =>
      setSidebarVisible(stored === "true"),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarVisible((current) => {
      const next = !current;
      localStorage.setItem("backsteros:sidebar-visible", String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== "[") {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (!shouldHandleGlobalShortcut(event)) {
        return;
      }
      event.preventDefault();
      toggleSidebar();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [toggleSidebar]);

  useSettingsShortcut();
  useNavigationShortcuts();
  useContentPreviewScrollShortcuts();
  useEscapeBackNavigation();
  useSectionTabShortcuts();
  useProjectTaskViewShortcuts();
  useTaskPropertyDropdownShortcuts();
  useTabShortcuts();
  useBlockBrowserTabFocus();
  useComposeShortcut();
  useDocumentTreeCreateFolderShortcut();

  const mobileItems = useMemo(
    () =>
      navigation.filter((item) =>
        ["/inbox", "/tasks", "/projects", "/journal"].includes(item.href),
      ),
    [],
  );

  return (
    <div className="app-shell">
      <CommandPalette />
      <ComposeModalGate />
      <button
        className="mobile-menu-trigger"
        aria-label="Open navigation"
        onClick={() => setMobileMenu(true)}
      >
        <Icon name="menu" />
      </button>
      <aside
        className={`desktop-sidebar${sidebarVisible ? "" : " is-collapsed"}`}
      >
        {settingsPage ? <SettingsSidePanelNav /> : <Sidebar />}
      </aside>
      <section className="workspace">
        <ContentHeader />
        <ContentFrame pathname={pathname}>{children}</ContentFrame>
      </section>
      <nav className="mobile-tabs" aria-label="Primary navigation">
        {mobileItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const NavIcon = getNavigationItemIcon(item.icon);
          if (!NavIcon) {
            return null;
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "is-active" : ""}
            >
              <NavIcon />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button onClick={() => setMobileMenu(true)}>
          <Icon name="menu" />
          <span>More</span>
        </button>
      </nav>
      {mobileMenu ? (
        <div className="mobile-drawer" role="dialog" aria-label="Navigation">
          <button
            className="drawer-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobileMenu(false)}
          />
          <aside>
            <button
              className="drawer-close"
              aria-label="Close navigation"
              onClick={() => setMobileMenu(false)}
            >
              <Icon name="close" />
            </button>
            {settingsPage ? (
              <SettingsSidePanelNav onNavigate={() => setMobileMenu(false)} />
            ) : (
              <Sidebar mobile onNavigate={() => setMobileMenu(false)} />
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <TabsProvider>
      <NavigationHistoryProvider>
        <NavigationTrailProvider>
          <EntityHeaderActionsShell>
            <BreadcrumbChromeProvider>
              <ContentSidePanelProvider>
                <AppShellInner>{children}</AppShellInner>
              </ContentSidePanelProvider>
            </BreadcrumbChromeProvider>
          </EntityHeaderActionsShell>
        </NavigationTrailProvider>
      </NavigationHistoryProvider>
    </TabsProvider>
  );
}
