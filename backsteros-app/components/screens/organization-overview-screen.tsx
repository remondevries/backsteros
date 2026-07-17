"use client";

import type { Organization as ApiOrganization } from "@backsteros/contracts";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { RegisterEntityDeleteAction } from "@/components/entity-actions/register-entity-delete-action";
import { OrganizationLayoutBreadcrumb } from "@/components/organizations/organization-layout-breadcrumb";
import { OrganizationNav } from "@/components/organizations/organization-nav";
import { OrganizationOverviewPanel } from "@/components/organizations/organization-overview-panel";
import { useApiResource } from "@/lib/api-context";
import {
  getCanonicalOrganizationRouteParam,
  organizationMatchesRouteSlug,
} from "@/lib/entity-route-hrefs";
import { normalizeOrganization } from "@/lib/entity-normalize";
import { deleteOrganizationAction } from "@/lib/mutations/organizations";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { findLocalOrApi } from "@/lib/sync/prefer-local-or-api";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

export function OrganizationOverviewScreen({
  organizationParam,
}: {
  organizationParam: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
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
  }, [localOrgs.data, organizationParam, orgsResource.data]);

  const handleDeleteOrganization = useCallback(async () => {
    if (!organization) {
      return { ok: false as const, error: "Organization is required." };
    }
    const result = await deleteOrganizationAction({
      organizationId: organization.id,
      pathname,
    });
    if (!result.ok) {
      return result;
    }
    router.replace(result.redirectHref);
    return result;
  }, [organization, pathname, router]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RegisterEntityDeleteAction
        entityLabel={`organization "${organization.name}"`}
        onDelete={handleDeleteOrganization}
      />
      <OrganizationLayoutBreadcrumb organizationName={organization.name} />
      <OrganizationNav
        organizationRouteParam={routeParam}
        organizationId={organization.id}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <OrganizationOverviewPanel
          organization={organization}
          onSaved={() => {
            orgsResource.reload();
          }}
        />
      </div>
    </div>
  );
}
