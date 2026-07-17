"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { OrganizationCreateContactButton } from "@/components/organizations/organization-create-contact-button";
import { rememberOrganizationSection } from "@/lib/entity-section-memory";
import {
  getActiveOrganizationSection,
  getOrganizationSectionHref,
  ORGANIZATION_SECTIONS,
} from "@/lib/organization-sections";
import {
  APP_PILL_NAV_ITEM_CLASS,
  appPillNavItemStateClass,
} from "@/lib/ui/app-pill-nav";

type OrganizationNavProps = {
  organizationRouteParam: string;
  organizationId?: string;
};

export function OrganizationNav({
  organizationRouteParam,
  organizationId,
}: OrganizationNavProps) {
  const pathname = usePathname();
  const activeId = getActiveOrganizationSection(
    pathname,
    organizationRouteParam,
  );

  useEffect(() => {
    rememberOrganizationSection(activeId);
  }, [activeId]);

  return (
    <div className="flex items-center justify-between gap-2">
      <div
        className="app-pill-nav flex min-w-0 shrink-0 gap-2 p-2 pb-0"
        aria-label="Organization sections"
      >
        {ORGANIZATION_SECTIONS.map((section) => {
          const isActive = section.id === activeId;
          const href = getOrganizationSectionHref(
            organizationRouteParam,
            section.id,
          );

          return (
            <Link
              key={section.id}
              href={href}
              scroll={false}
              className={`${APP_PILL_NAV_ITEM_CLASS} ${appPillNavItemStateClass(isActive)}`}
              aria-current={isActive ? "page" : undefined}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
      {activeId === "contacts" && organizationId ? (
        <div className="shrink-0 pr-2 pt-2">
          <OrganizationCreateContactButton
            organizationId={organizationId}
            organizationRouteParam={organizationRouteParam}
          />
        </div>
      ) : null}
    </div>
  );
}
