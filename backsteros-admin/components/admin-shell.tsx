"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminProfileMenu } from "@/components/admin-profile-menu";
import { DashboardNavIcon } from "@/components/dashboard-nav-icon";
import { LogsNavIcon } from "@/components/logs-nav-icon";
import { RepeatNavIcon } from "@/components/repeat-nav-icon";
import { SyncNavIcon } from "@/components/sync-nav-icon";

const NAV = [
  { href: "/", label: "Dashboard", icon: DashboardNavIcon, match: "exact" as const },
  { href: "/sync", label: "Sync", icon: SyncNavIcon, match: "prefix" as const },
  { href: "/logs", label: "Logs", icon: LogsNavIcon, match: "prefix" as const },
  {
    href: "/recurring",
    label: "Recurring",
    icon: RepeatNavIcon,
    match: "prefix" as const,
  },
];

function isActive(pathname: string, href: string, match: "exact" | "prefix") {
  if (match === "exact") {
    return pathname === href || pathname === "";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell() {
  const pathname = usePathname();

  return (
    <div className="admin-shell">
      <nav className="admin-shell-nav" aria-label="Admin">
        <aside className="admin-pane admin-pane--nav">
          <div className="sidebar-inner admin-sidebar-inner">
            <div className="admin-sidebar-chrome">
              <AdminProfileMenu />
            </div>
            <div className="admin-pane-body">
              <nav className="sidebar-sections admin-sidebar-nav" aria-label="Workspace">
                <section>
                  {NAV.map((item) => {
                    const active = isActive(pathname, item.href, item.match);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`sidebar-link${active ? " is-active" : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon className="nav-icon" />
                        <span className="sidebar-link-label">{item.label}</span>
                      </Link>
                    );
                  })}
                </section>
              </nav>
            </div>
          </div>
        </aside>
      </nav>
    </div>
  );
}
