"use client";

import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-layout-root">
      <div className="admin-root">
        <AdminShell />
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
