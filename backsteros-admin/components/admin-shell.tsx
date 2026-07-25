"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminProfileMenu } from "@/components/admin-profile-menu";
import { DashboardNavIcon } from "@/components/dashboard-nav-icon";

export function AdminShell() {
  const pathname = usePathname();
  const dashboardActive = pathname === "/" || pathname === "";

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
                  <Link
                    href="/"
                    className={`sidebar-link${dashboardActive ? " is-active" : ""}`}
                    aria-current={dashboardActive ? "page" : undefined}
                  >
                    <DashboardNavIcon className="nav-icon" />
                    <span className="sidebar-link-label">Dashboard</span>
                  </Link>
                </section>
              </nav>
            </div>
          </div>
        </aside>
      </nav>
    </div>
  );
}
