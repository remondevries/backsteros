"use client";

import type { Organization as ApiOrganization } from "@backsteros/contracts";
import { useMemo } from "react";

import { useApiResource } from "@/lib/api-context";
import {
  getCanonicalOrganizationRouteParam,
  organizationMatchesRouteSlug,
} from "@/lib/entity-route-hrefs";
import { normalizeOrganization } from "@/lib/entity-normalize";
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

export type OrganizationRouteContext = {
  organizationRouteParam: string;
  organizationName: string;
};

/** Resolve org breadcrumb context when viewing under /organizations/:org/... */
export function useOrganizationRouteContext(
  organizationRouteParam: string | null | undefined,
): OrganizationRouteContext | undefined {
  const orgsResource = useApiResource<{ organizations: ApiOrganization[] }>(
    (client) => client.requestJson("/api/v1/organizations"),
  );
  const localOrgs = usePowerSyncQuery<Record<string, unknown>>(
    organizationRouteParam
      ? "SELECT * FROM organizations WHERE deleted_at IS NULL"
      : null,
  );

  return useMemo(() => {
    if (!organizationRouteParam) return undefined;

    const match = findLocalOrApi(
      localOrgs.data?.map((row) => snakeRow(row) as ApiOrganization),
      orgsResource.data?.organizations,
      (entry) => organizationMatchesRouteSlug(entry, organizationRouteParam),
    );
    if (!match) {
      // Omit context while loading / missing so breadcrumbs never flash the slug.
      return undefined;
    }

    const organization = normalizeOrganization(match);
    return {
      organizationRouteParam: getCanonicalOrganizationRouteParam(organization),
      organizationName: organization.name,
    };
  }, [organizationRouteParam, localOrgs.data, orgsResource.data]);
}
