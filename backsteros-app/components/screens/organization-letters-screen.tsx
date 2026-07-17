"use client";

import type {
  Letter as ApiLetter,
  Organization as ApiOrganization,
} from "@backsteros/contracts";
import Link from "next/link";
import { useMemo } from "react";

import { ScopedLettersList } from "@/components/letters/scoped-letters-list";
import { OrganizationLayoutBreadcrumb } from "@/components/organizations/organization-layout-breadcrumb";
import { OrganizationNav } from "@/components/organizations/organization-nav";
import { apiErrorMessage, useApiResource } from "@/lib/api-context";
import {
  getCanonicalOrganizationRouteParam,
  getLettersHref,
  organizationMatchesRouteSlug,
} from "@/lib/entity-route-hrefs";
import {
  normalizeLetter,
  normalizeOrganization,
} from "@/lib/entity-normalize";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import {
  findLocalOrApi,
  preferLocalOrApi,
} from "@/lib/sync/prefer-local-or-api";
import type { TaskStatus } from "@/lib/task-status";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

function letterComposeHref(
  organizationId: string,
  status: TaskStatus,
): string {
  const params = new URLSearchParams({
    organizationId,
    status,
  });
  return `/letters/new?${params.toString()}`;
}

export function OrganizationLettersScreen({
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

  const lettersResource = useApiResource<{ letters: ApiLetter[] }>(
    (client) =>
      organization
        ? client.requestJson(
            `/api/v1/letters?organizationId=${encodeURIComponent(organization.id)}`,
          )
        : Promise.resolve({ letters: [] as ApiLetter[] }),
    [organization?.id],
  );

  const localLetters = usePowerSyncQuery<Record<string, unknown>>(
    organization
      ? "SELECT * FROM letters WHERE deleted_at IS NULL AND organization_id = ? ORDER BY sort_order, updated_at DESC"
      : null,
    organization ? [organization.id] : [],
  );

  const letters = useMemo(() => {
    const rows = preferLocalOrApi(
      localLetters.data?.map((row) => snakeRow(row) as ApiLetter),
      lettersResource.data?.letters,
    );
    return rows.map(normalizeLetter);
  }, [lettersResource.data, localLetters.data]);

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
  const loading = lettersResource.loading && !localLetters.data;
  const error = !localLetters.data ? lettersResource.error : null;

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
            <strong>Could not load letters</strong>
            <p>{apiErrorMessage(error)}</p>
            <button type="button" onClick={lettersResource.reload}>
              Try again
            </button>
          </div>
        ) : null}
        {!loading && !error ? (
          <ScopedLettersList
            letters={letters}
            resolveHref={(letter) =>
              letter.number != null
                ? getLettersHref(letter.number)
                : `/letters/${letter.id}`
            }
            resolveComposeHref={(status) =>
              letterComposeHref(organization.id, status)
            }
          />
        ) : null}
      </div>
    </div>
  );
}
