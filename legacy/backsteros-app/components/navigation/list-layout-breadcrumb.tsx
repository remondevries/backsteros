"use client";

import { RegisterBreadcrumbChrome } from "@/components/navigation/breadcrumb-chrome";

/** Static list-page breadcrumbs (Contacts / Organizations / Letters indexes). */
export function ListLayoutBreadcrumb({ label }: { label: string }) {
  return <RegisterBreadcrumbChrome anchors={[{ label }]} />;
}
