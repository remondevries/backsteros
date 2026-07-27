"use client";

import type {
  Contact as ApiContact,
  Organization as ApiOrganization,
} from "@backsteros/contracts";
import Link from "next/link";
import { useMemo } from "react";

import { OrganizationContactsList } from "@/components/organizations/organization-contacts-list";
import { OrganizationLayoutBreadcrumb } from "@/components/organizations/organization-layout-breadcrumb";
import { OrganizationNav } from "@/components/organizations/organization-nav";
import { apiErrorMessage, useApiResource } from "@/lib/api-context";
import {
  getCanonicalOrganizationRouteParam,
  organizationMatchesRouteSlug,
} from "@/lib/entity-route-hrefs";
import {
  normalizeContact,
  normalizeOrganization,
} from "@/lib/entity-normalize";
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

export function OrganizationContactsScreen({
  organizationParam,
}: {
  organizationParam: string;
}) {
  const orgsResource = useApiResource<{ organizations: ApiOrganization[] }>(
    (client) => client.requestJson("/api/v1/organizations"),
  );
  const localOrgs = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM organizations WHERE deleted_at IS NULL",
  );

  const organization = useMemo(() => {
    const match = findLocalOrApi(
      localOrgs.data?.map((row) => snakeRow(row) as ApiOrganization),
      orgsResource.data?.organizations,
      (entry) => organizationMatchesRouteSlug(entry, organizationParam),
    );
    return match ? normalizeOrganization(match) : null;
  }, [organizationParam, localOrgs.data, orgsResource.data]);

  const contactsResource = useApiResource<{ contacts: ApiContact[] }>(
    (client) =>
      organization
        ? client.requestJson(
            `/api/v1/contacts?organizationId=${encodeURIComponent(organization.id)}`,
          )
        : Promise.resolve({ contacts: [] as ApiContact[] }),
    [organization?.id],
  );

  const localContacts = usePowerSyncQuery<Record<string, unknown>>(
    organization
      ? "SELECT * FROM contacts WHERE deleted_at IS NULL AND organization_id = ? ORDER BY updated_at DESC"
      : null,
    organization ? [organization.id] : [],
  );

  const contacts = useMemo(() => {
    const rows = preferLocalOrApi(
      localContacts.data?.map((row) => snakeRow(row) as ApiContact),
      contactsResource.data?.contacts,
    );
    return rows
      .map(normalizeContact)
      .sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        }),
      );
  }, [contactsResource.data, localContacts.data]);

  if (orgsResource.loading && !organization) {
    return (
      <div className="loading-list">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} />
        ))}
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="error-state">
        <strong>Organization not found</strong>
        <p>No organization matches “{organizationParam}”.</p>
        <Link href="/organizations">Back to organizations</Link>
      </div>
    );
  }

  const routeParam = getCanonicalOrganizationRouteParam(organization);
  const loading = contactsResource.loading && !localContacts.data;
  const error = !localContacts.data ? contactsResource.error : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <OrganizationLayoutBreadcrumb organizationName={organization.name} />
      <OrganizationNav
        organizationRouteParam={routeParam}
        organizationId={organization.id}
      />
      <div className="flex min-h-0 flex-1 flex-col p-2">
        {loading ? (
          <div className="loading-list">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} />
            ))}
          </div>
        ) : null}
        {error ? (
          <div className="error-state">
            <strong>Could not load contacts</strong>
            <p>{apiErrorMessage(error)}</p>
            <button type="button" onClick={contactsResource.reload}>
              Try again
            </button>
          </div>
        ) : null}
        {!loading && !error && contacts.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-2 py-6 text-sm text-foreground/60">
            <p>No contacts linked to this organization yet.</p>
            <p className="text-foreground/45">
              Use <span className="text-foreground/70">Create new contact</span>{" "}
              above to add one linked to this organization.
            </p>
          </div>
        ) : null}
        {!loading && !error && contacts.length > 0 ? (
          <OrganizationContactsList
            contacts={contacts}
            organizationRouteParam={routeParam}
          />
        ) : null}
      </div>
    </div>
  );
}
