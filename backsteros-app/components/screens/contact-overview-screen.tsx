"use client";

import type {
  Contact as ApiContact,
  Organization as ApiOrganization,
} from "@backsteros/contracts";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { ContactLayoutBreadcrumb } from "@/components/contacts/contact-layout-breadcrumb";
import { ContactNav } from "@/components/contacts/contact-nav";
import { ContactOverviewPanel } from "@/components/contacts/contact-overview-panel";
import { RegisterEntityDeleteAction } from "@/components/entity-actions/register-entity-delete-action";
import { useOrganizationRouteContext } from "@/hooks/use-organization-route-context";
import { useApiResource } from "@/lib/api-context";
import {
  contactMatchesRouteSlug,
  getCanonicalContactRouteParam,
} from "@/lib/entity-route-hrefs";
import {
  normalizeContact,
  normalizeOrganization,
} from "@/lib/entity-normalize";
import { deleteContactAction } from "@/lib/mutations/contacts";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import {
  findLocalOrApi,
  preferLocalOrApi,
} from "@/lib/sync/prefer-local-or-api";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

export function ContactOverviewScreen({
  contactParam,
  organizationRouteParam,
}: {
  contactParam: string;
  organizationRouteParam?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const organizationContext = useOrganizationRouteContext(organizationRouteParam);
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );
  const orgsResource = useApiResource<{ organizations: ApiOrganization[] }>(
    (client) => client.requestJson("/api/v1/organizations"),
  );
  const localContacts = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM contacts WHERE deleted_at IS NULL",
  );
  const localOrgs = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM organizations WHERE deleted_at IS NULL",
  );

  const contact = useMemo(() => {
    const match = findLocalOrApi(
      localContacts.data?.map((row) => snakeRow(row) as ApiContact),
      contactsResource.data?.contacts,
      (entry) => contactMatchesRouteSlug(entry, contactParam),
    );
    return match ? normalizeContact(match) : null;
  }, [contactParam, contactsResource.data, localContacts.data]);

  const organizations = useMemo(() => {
    const rows = preferLocalOrApi(
      localOrgs.data?.map((row) => snakeRow(row) as ApiOrganization),
      orgsResource.data?.organizations,
    );
    return rows.map(normalizeOrganization);
  }, [localOrgs.data, orgsResource.data]);

  const handleDeleteContact = useCallback(async () => {
    if (!contact) {
      return { ok: false as const, error: "Contact is required." };
    }
    const result = await deleteContactAction({
      contactId: contact.id,
      pathname,
    });
    if (!result.ok) {
      return result;
    }
    router.replace(result.redirectHref);
    return result;
  }, [contact, pathname, router]);

  if (contactsResource.loading && !contact) {
    return (
      <div className="loading-list">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} />
        ))}
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="error-state">
        <strong>Contact not found</strong>
        <p>No contact matches “{contactParam}”.</p>
        <Link href="/contacts">Back to contacts</Link>
      </div>
    );
  }

  const routeParam = getCanonicalContactRouteParam(contact);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RegisterEntityDeleteAction
        entityLabel={`contact "${contact.name}"`}
        onDelete={handleDeleteContact}
      />
      <ContactLayoutBreadcrumb
        contactRouteParam={routeParam}
        contactName={contact.name}
        organizationContext={organizationContext}
      />
      <ContactNav contactRouteParam={routeParam} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ContactOverviewPanel
          contact={contact}
          organizations={organizations}
        />
      </div>
    </div>
  );
}
