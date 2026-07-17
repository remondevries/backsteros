"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createOrganizationAction } from "@/lib/mutations/organizations";
import { updateLetterOrganizationAction } from "@/lib/mutations/letters";
import { createLocalOrganization } from "@/lib/sync/local-organization-mutations";
import { updateLocalLetterOrganization } from "@/lib/sync/local-letter-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import {
  getOrganizationFallbackIcon,
  useOrganizationDropdownOptions } from "@/components/organizations/organization-dropdown-options";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { PropertyDropdownNavigateRow } from "@/components/ui/property-dropdown-navigate-row";
import { useMergedAssignableList } from "@/hooks/use-merged-assignable-list";
import { getOrganizationHrefFromKey } from "@/lib/entity-route-hrefs";
import {
  PROJECT_ORGANIZATION_NONE,
  type AssignableOrganization } from "@/lib/organizations/assignable-organization";
import {
  createPendingAssignableId,
  getCreateEntityFromQueryLabel,
  isPendingAssignableId,
} from "@/lib/searchable-dropdown-create-from-query";

export type { AssignableOrganization };

type LetterOrganizationFieldProps = {
  letterId: string;
  organizationId: string | null;
  organizations: AssignableOrganization[];
};

export function LetterOrganizationField({
  letterId,
  organizationId: initialOrganizationId,
  organizations }: LetterOrganizationFieldProps) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(initialOrganizationId);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    merged: mergedOrganizations,
    addOptimistic,
    replaceOptimistic,
    removeOptimistic,
  } = useMergedAssignableList(organizations);

  const [prevInitialOrganizationId, setPrevInitialOrganizationId] = useState(initialOrganizationId);
  if (initialOrganizationId !== prevInitialOrganizationId) {
    setPrevInitialOrganizationId(initialOrganizationId);
    setOrganizationId(initialOrganizationId);
  }

  const options = useOrganizationDropdownOptions(mergedOrganizations);
  const dropdownValue = organizationId ?? PROJECT_ORGANIZATION_NONE;
  const selectedOrganization = mergedOrganizations.find(
    (organization) => organization.id === organizationId,
  );
  const fallbackLabel = selectedOrganization?.name ?? "No organization";

  function handleChange(nextValue: string) {
    const normalized =
      nextValue === PROJECT_ORGANIZATION_NONE ? null : nextValue;

    if (normalized === organizationId) {
      return;
    }

    const previousOrganizationId = organizationId;
    setOrganizationId(normalized);
    setError(null);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          updateLocalLetterOrganization({
            letterId,
            organizationId: normalized,
          }),
        () =>
          updateLetterOrganizationAction({
            letterId,
            organizationId: normalized,
            clearContact: true,
          }),
      );

      if (!result.ok) {
        setOrganizationId(previousOrganizationId);
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  function handleCreateFromQuery(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const previousOrganizationId = organizationId;
    const pendingId = createPendingAssignableId();
    const optimisticOrganization: AssignableOrganization = {
      id: pendingId,
      key: pendingId,
      number: null,
      name: trimmed,
      avatarStorageKey: null,
      avatarUpdatedAt: Date.now(),
    };

    addOptimistic(optimisticOrganization);
    setOrganizationId(pendingId);
    setError(null);

    startTransition(async () => {
      const created = await runEntityPersist(
        () => createLocalOrganization({ name: trimmed }),
        () => createOrganizationAction({ name: trimmed }),
      );
      if (!created.ok) {
        removeOptimistic(pendingId);
        setOrganizationId(previousOrganizationId);
        setError(created.error);
        return;
      }

      const createdOrganization: AssignableOrganization = {
        id: created.organizationId,
        key: created.organizationKey,
        number: created.organizationNumber,
        name: trimmed,
        avatarStorageKey: null,
        avatarUpdatedAt: Date.now(),
      };
      replaceOptimistic(pendingId, createdOrganization);
      setOrganizationId(created.organizationId);

      const assigned = await runEntityPersist(
        () =>
          updateLocalLetterOrganization({
            letterId,
            organizationId: created.organizationId,
          }),
        () =>
          updateLetterOrganizationAction({
            letterId,
            organizationId: created.organizationId,
          }),
      );

      if (!assigned.ok) {
        setOrganizationId(previousOrganizationId);
        removeOptimistic(created.organizationId);
        setError(assigned.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <PropertyDropdownNavigateRow
        navigateHref={
          selectedOrganization &&
          !isPendingAssignableId(selectedOrganization.id)
            ? getOrganizationHrefFromKey(
                selectedOrganization.key,
                selectedOrganization.number,
              )
            : null
        }
        navigateLabel={
          selectedOrganization
            ? `Open organization ${selectedOrganization.name}`
            : undefined
        }
      >
        <PropertyDropdown
          value={dropdownValue}
          options={options}
          onChange={handleChange}
          disabled={isPending}
          searchPlaceholder="Change organization…"
          searchShortcutLabel="O"
          ariaLabel="Change organization"
          fallbackIcon={getOrganizationFallbackIcon(selectedOrganization)}
          fallbackLabel={fallbackLabel}
          mutedFallback={!organizationId}
          panelAlign="start"
          taskPropertyDropdownId="organization"
          createFromQueryLabel={(query) =>
            getCreateEntityFromQueryLabel("organization", query)
          }
          onCreateFromQuery={handleCreateFromQuery}
        />
      </PropertyDropdownNavigateRow>
      {error ? (
        <p className="px-1 text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
