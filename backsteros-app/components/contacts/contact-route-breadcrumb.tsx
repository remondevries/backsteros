"use client";

import type { Contact as ApiContact } from "@backsteros/contracts";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { ContactLayoutBreadcrumb } from "@/components/contacts/contact-layout-breadcrumb";
import { useOrganizationRouteContext } from "@/hooks/use-organization-route-context";
import { useApiResource } from "@/lib/api-context";
import { parseOrganizationContactRoute } from "@/lib/contact-route-scope";
import { normalizeContact } from "@/lib/entity-normalize";
import {
  contactMatchesRouteSlug,
  getCanonicalContactRouteParam,
} from "@/lib/entity-route-hrefs";

/** Resolves a contact route param and registers Circle-style contact breadcrumbs. */
export function ContactRouteBreadcrumb({
  contactRouteParam,
  organizationRouteParam: organizationRouteParamProp,
  organizationContext: organizationContextProp,
}: {
  contactRouteParam: string;
  organizationRouteParam?: string;
  organizationContext?: {
    organizationRouteParam: string;
    organizationName: string;
  };
}) {
  const pathname = usePathname();
  const organizationRouteParam =
    organizationRouteParamProp ??
    organizationContextProp?.organizationRouteParam ??
    parseOrganizationContactRoute(pathname)?.organizationRouteParam;
  const resolvedOrganizationContext = useOrganizationRouteContext(
    organizationContextProp ? undefined : organizationRouteParam,
  );
  const organizationContext =
    organizationContextProp ?? resolvedOrganizationContext;

  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );

  const contact = useMemo(() => {
    const match = (contactsResource.data?.contacts ?? []).find((entry) =>
      contactMatchesRouteSlug(entry, contactRouteParam),
    );
    return match ? normalizeContact(match) : null;
  }, [contactRouteParam, contactsResource.data]);

  if (!contact) {
    return null;
  }

  return (
    <ContactLayoutBreadcrumb
      contactRouteParam={getCanonicalContactRouteParam(contact)}
      contactName={contact.name}
      organizationContext={organizationContext}
    />
  );
}
