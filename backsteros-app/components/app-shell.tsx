"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import {
  isRouteFamily,
  navigation,
  routeCopy,
  titleForPath,
} from "@/lib/navigation";
import { usePowerSync } from "@/lib/powersync-context";

import { CommandPalette } from "./command-palette";
import { Icon } from "./ui/icon";
import { ResizablePanel } from "./ui/resizable-panel";

type OpenTab = { href: string; title: string };

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
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <span className="nav-icon"><Icon name={item.icon} /></span>
                  <span>{item.label}</span>
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
  const router = useRouter();
  const sync = usePowerSync();
  const syncLabel = sync.offline
    ? "Offline"
    : sync.error
      ? "Sync error"
      : sync.connected
        ? "Synced"
        : sync.connecting
          ? "Connecting"
          : "Local only";
  return (
    <div className={`sidebar-inner${mobile ? " mobile" : ""}`}>
      <div className="sidebar-history">
        <button aria-label="Go back" onClick={() => router.back()}>
          <Icon name="back" />
        </button>
        <button aria-label="Go forward" onClick={() => router.forward()}>
          <Icon name="forward" />
        </button>
      </div>
      <div className="profile-row">
        {process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1" ? (
          <span className="e2e-user">Test workspace</span>
        ) : (
          <UserButton
            showName
            appearance={{ elements: { userButtonBox: "clerk-user-button" } }}
          />
        )}
        <button
          className="compose-button"
          aria-label="Create item"
          title="Create item"
          onClick={() =>
            toast("Composer is ready", {
              description: "Feature creation is connected in the next build step.",
            })
          }
        >
          <Icon name="plus" />
        </button>
      </div>
      <NavLinks onNavigate={onNavigate} />
      <div className="sidebar-footer">
        <button
          className={`sync-indicator${sync.error ? " has-error" : ""}`}
          title={sync.error?.message ?? (sync.lastSyncedAt
            ? `Last sync ${sync.lastSyncedAt.toLocaleString()}`
            : "Waiting for first sync")}
          onClick={() => void sync.retry()}
        >
          <span aria-hidden="true">●</span>
          {syncLabel}
          {sync.lastSyncedAt ? <small>{sync.lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small> : null}
        </button>
        <Link href="/settings" onClick={onNavigate}>
          <Icon name="settings" /> Settings
        </Link>
        <button
          onClick={() =>
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true }),
            )
          }
        >
          <Icon name="search" /> Search <kbd>⌘K</kbd>
        </button>
      </div>
    </div>
  );
}

function ContentTabs({
  tabs,
  pathname,
  onClose,
}: {
  tabs: OpenTab[];
  pathname: string;
  onClose: (href: string) => void;
}) {
  return (
    <header className="desktop-tabs">
      <div className="tabs-scroll" role="tablist" aria-label="Open views">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={tab.href === pathname}
            className={`content-tab${tab.href === pathname ? " is-active" : ""}`}
          >
            <span>{tab.title}</span>
            {tabs.length > 1 ? (
              <button
                aria-label={`Close ${tab.title}`}
                onClick={(event) => {
                  event.preventDefault();
                  onClose(tab.href);
                }}
              >
                ×
              </button>
            ) : null}
          </Link>
        ))}
        <Link className="new-tab" href="/projects" aria-label="Open a new view">
          <Icon name="plus" />
        </Link>
      </div>
    </header>
  );
}

function Trail({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  return (
    <div className="navigation-trail" aria-label="Breadcrumb">
      {parts.map((part, index) => {
        const href = `/${parts.slice(0, index + 1).join("/")}`;
        const label = index === 0 && isRouteFamily(part)
          ? routeCopy[part].title
          : decodeURIComponent(part).replaceAll("-", " ");
        return (
          <span key={href}>
            {index ? <Icon name="chevron" /> : null}
            <Link href={href}>{label}</Link>
          </span>
        );
      })}
    </div>
  );
}

function ContextPanel({ pathname }: { pathname: string }) {
  const familyName = pathname.split("/").filter(Boolean)[0];
  const family = isRouteFamily(familyName) ? familyName : "projects";
  const detail = pathname.split("/").filter(Boolean).length > 1;
  const labels = family === "settings"
    ? ["General", "Account", "Workspace", "Integrations"]
    : detail
      ? ["Overview", "Activity", "Related items"]
      : ["All", "Active", "Recently viewed"];

  return (
    <ResizablePanel storageKey={`backsteros:${family}:panel-width`}>
      <div className="panel-header">
        <strong>{detail ? routeCopy[family].singular : routeCopy[family].title}</strong>
        <button aria-label="Hide panel"><Icon name="panel" /></button>
      </div>
      <div className="panel-list">
        {labels.map((label, index) => (
          <button className={index === 0 ? "is-active" : ""} key={label}>
            <span>{label}</span>
            {index === 0 && family !== "settings" ? <small>0</small> : null}
          </button>
        ))}
      </div>
      <p className="panel-hint">Synced workspace views will appear here.</p>
    </ResizablePanel>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [tabs, setTabs] = useState<OpenTab[]>(() => [
    { href: pathname, title: titleForPath(pathname) },
  ]);

  useEffect(() => {
    const stored = localStorage.getItem("backsteros:sidebar-visible");
    if (stored === null) return;
    const frame = requestAnimationFrame(() => setSidebarVisible(stored === "true"));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setTabs((current) =>
        current.some((tab) => tab.href === pathname)
          ? current
          : [...current, { href: pathname, title: titleForPath(pathname) }],
      );
    });
    const history = JSON.parse(
      sessionStorage.getItem("backsteros:navigation-history") ?? "[]",
    ) as string[];
    sessionStorage.setItem(
      "backsteros:navigation-history",
      JSON.stringify([pathname, ...history.filter((item) => item !== pathname)].slice(0, 20)),
    );
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        setSidebarVisible((current) => {
          localStorage.setItem("backsteros:sidebar-visible", String(!current));
          return !current;
        });
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const closeTab = useCallback(
    (href: string) => {
      setTabs((current) => {
        const index = current.findIndex((tab) => tab.href === href);
        const next = current.filter((tab) => tab.href !== href);
        if (href === pathname) {
          router.push(next[Math.max(0, index - 1)]?.href ?? "/projects");
        }
        return next;
      });
    },
    [pathname, router],
  );

  const mobileItems = useMemo(
    () => navigation.filter((item) =>
      ["/inbox", "/tasks", "/projects", "/journal"].includes(item.href),
    ),
    [],
  );

  return (
    <div className="app-shell">
      <CommandPalette />
      <button
        className="mobile-menu-trigger"
        aria-label="Open navigation"
        onClick={() => setMobileMenu(true)}
      >
        <Icon name="menu" />
      </button>
      <aside className={`desktop-sidebar${sidebarVisible ? "" : " is-collapsed"}`}>
        <Sidebar />
      </aside>
      <section className="workspace">
        <ContentTabs tabs={tabs} pathname={pathname} onClose={closeTab} />
        <div className="content-frame">
          <ContextPanel pathname={pathname} />
          <main className="main-slot">
            <Trail pathname={pathname} />
            <div className="page-scroll">{children}</div>
          </main>
        </div>
      </section>
      <nav className="mobile-tabs" aria-label="Primary navigation">
        {mobileItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={active ? "is-active" : ""}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button onClick={() => setMobileMenu(true)}>
          <Icon name="menu" /><span>More</span>
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
            <Sidebar mobile onNavigate={() => setMobileMenu(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
