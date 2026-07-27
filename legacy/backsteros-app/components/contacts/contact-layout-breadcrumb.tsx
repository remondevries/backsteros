"use client";

import { usePathname } from "next/navigation";

import { RegisterBreadcrumbChrome } from "@/components/navigation/breadcrumb-chrome";
import { useProjectBreadcrumbItems } from "@/components/projects/project-breadcrumb-context";
import { useMounted } from "@/hooks/use-mounted";
import { getActiveBreadcrumbExtraItems } from "@/lib/breadcrumb-trailing-items";
import {
  getContactBreadcrumbHref,
  isContactSectionDetailPath,
} from "@/lib/contact-sections";
import { getOrganizationSectionHref } from "@/lib/organization-sections";

type ContactLayoutBreadcrumbProps = {
  contactRouteParam: string;
  contactName: string;
  organizationContext?: {
    organizationRouteParam: string;
    organizationName: string;
  };
};

/** Circle ContactLayoutBreadcrumb — registers anchors for the shell host. */
export function ContactLayoutBreadcrumb({
  contactRouteParam,
  contactName,
  organizationContext,
}: ContactLayoutBreadcrumbProps) {
  const pathname = usePathname();
  const mounted = useMounted();
  const extraItems = useProjectBreadcrumbItems();
  const activeExtraItems = mounted
    ? getActiveBreadcrumbExtraItems(
        pathname,
        extraItems,
        (currentPathname) =>
          isContactSectionDetailPath(currentPathname, contactRouteParam),
      )
    : [];
  const onDetailPage = isContactSectionDetailPath(pathname, contactRouteParam);
  const hasTrailingItems = activeExtraItems.length > 0;
  const contactBreadcrumbHref = getContactBreadcrumbHref(
    pathname,
    contactRouteParam,
    hasTrailingItems || onDetailPage,
  );

  const anchors = organizationContext
    ? [
        { label: "Organizations", href: "/organizations" },
        {
          label: organizationContext.organizationName,
          href: getOrganizationSectionHref(
            organizationContext.organizationRouteParam,
            "contacts",
          ),
        },
        {
          label: contactName,
          href: contactBreadcrumbHref,
        },
      ]
    : [
        { label: "Contacts", href: "/contacts" },
        {
          label: contactName,
          href: contactBreadcrumbHref,
        },
      ];

  return (
    <RegisterBreadcrumbChrome
      anchors={anchors}
      includeTrailingItems={(currentPathname) =>
        isContactSectionDetailPath(currentPathname, contactRouteParam)
      }
    />
  );
}
