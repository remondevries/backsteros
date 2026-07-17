"use client";

import { RegisterBreadcrumbChrome } from "@/components/navigation/breadcrumb-chrome";

type OrganizationLayoutBreadcrumbProps = {
  organizationName: string;
};

/** Circle OrganizationLayoutBreadcrumb — Organizations › name (no trailing leaves). */
export function OrganizationLayoutBreadcrumb({
  organizationName,
}: OrganizationLayoutBreadcrumbProps) {
  return (
    <RegisterBreadcrumbChrome
      anchors={[
        { label: "Organizations", href: "/organizations" },
        { label: organizationName },
      ]}
    />
  );
}
