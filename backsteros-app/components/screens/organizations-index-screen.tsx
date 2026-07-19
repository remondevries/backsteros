"use client";

import type { Organization as ApiOrganization } from "@backsteros/contracts";
import { groupItemsByAlphaLetter } from "@backsteros/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { ListLayoutBreadcrumb } from "@/components/navigation/list-layout-breadcrumb";
import { useApiResource } from "@/lib/api-context";
import { normalizeOrganization } from "@/lib/entity-normalize";
import { getUniqueOrganizationRouteParam } from "@/lib/entity-route-hrefs";
import { getOrganizationBasePath } from "@/lib/organization-sections";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { preferLocalOrApi } from "@/lib/sync/prefer-local-or-api";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

/** Open the first organization in sidebar list order when visiting `/organizations`. */
export function OrganizationsIndexScreen() {
  const router = useRouter();
  const resource = useApiResource<{ organizations: ApiOrganization[] }>(
    (client) => client.requestJson("/api/v1/organizations"),
  );
  const local = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM organizations WHERE deleted_at IS NULL ORDER BY updated_at DESC",
  );

  const organizations = useMemo(() => {
    const rows = preferLocalOrApi(
      local.data?.map((row) => snakeRow(row) as ApiOrganization),
      resource.data?.organizations,
    );
    return rows
      .map((organization) => normalizeOrganization(organization))
      .sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        }),
      );
  }, [local.data, resource.data]);

  // Match side-panel alpha order (not raw API order).
  const first =
    groupItemsByAlphaLetter(organizations).flatMap(
      ([, entries]) => entries,
    )[0] ?? null;

  useEffect(() => {
    if (!first) return;
    const routeParam = getUniqueOrganizationRouteParam(first, organizations);
    router.replace(getOrganizationBasePath(routeParam));
  }, [first, organizations, router]);

  if (resource.loading && !local.data) {
    return (
      <>
        <ListLayoutBreadcrumb label="Organizations" />
        <div className="loading-list">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} />
          ))}
        </div>
      </>
    );
  }

  if (first) {
    return (
      <>
        <ListLayoutBreadcrumb label="Organizations" />
        <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-foreground/60">
          <p className="max-w-sm text-center">Opening organization…</p>
        </div>
      </>
    );
  }

  return (
    <>
      <ListLayoutBreadcrumb label="Organizations" />
      <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-foreground/60">
        <p className="max-w-sm text-center">
          No organizations yet. Use the plus button in the sidebar to add your
          first organization.
        </p>
      </div>
    </>
  );
}
