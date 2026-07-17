"use client";

import { RegisterBreadcrumbChrome } from "@/components/navigation/breadcrumb-chrome";
import { getContactSectionHref } from "@/lib/contact-sections";
import { getOrganizationSectionHref } from "@/lib/organization-sections";

type LetterLayoutBreadcrumbProps = {
  letterTitle: string;
  organizationContext?: {
    organizationRouteParam: string;
    organizationName: string;
  };
  contactContext?: {
    contactRouteParam: string;
    contactName: string;
    organizationRouteParam?: string;
    organizationName?: string;
  };
};

/** Circle LetterLayoutBreadcrumb — full chain ending in letter title (no separate leaf). */
export function LetterLayoutBreadcrumb({
  letterTitle,
  organizationContext,
  contactContext,
}: LetterLayoutBreadcrumbProps) {
  const anchors = organizationContext
    ? [
        { label: "Organizations", href: "/organizations" },
        {
          label: organizationContext.organizationName,
          href: getOrganizationSectionHref(
            organizationContext.organizationRouteParam,
            "letters",
          ),
        },
        { label: letterTitle },
      ]
    : contactContext
      ? contactContext.organizationRouteParam && contactContext.organizationName
        ? [
            { label: "Organizations", href: "/organizations" },
            {
              label: contactContext.organizationName,
              href: getOrganizationSectionHref(
                contactContext.organizationRouteParam,
                "contacts",
              ),
            },
            {
              label: contactContext.contactName,
              href: getContactSectionHref(
                contactContext.contactRouteParam,
                "letters",
                `/organizations/${contactContext.organizationRouteParam}/contacts/${contactContext.contactRouteParam}/letters`,
              ),
            },
            { label: letterTitle },
          ]
        : [
            { label: "Contacts", href: "/contacts" },
            {
              label: contactContext.contactName,
              href: getContactSectionHref(
                contactContext.contactRouteParam,
                "letters",
              ),
            },
            { label: letterTitle },
          ]
      : [
          { label: "Letters", href: "/letters" },
          { label: letterTitle },
        ];

  return <RegisterBreadcrumbChrome anchors={anchors} />;
}
