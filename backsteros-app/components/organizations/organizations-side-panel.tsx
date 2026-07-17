"use client";

import type { Organization as ApiOrganization } from "@backsteros/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useTransition } from "react";
import { toast } from "sonner";

import { MobileRemoteImage } from "@/components/mobile/mobile-remote-image";
import { ContentSidePanelHeader } from "@/components/shell/content-side-panel-header";
import { ContentSidePanelList } from "@/components/shell/content-side-panel-list";
import { SidePanelPlusIcon } from "@/components/shell/side-panel-plus-icon";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { useApiResource } from "@/lib/api-context";
import { getOrganizationAvatarSrc } from "@/lib/avatars/urls";
import { normalizeOrganization } from "@/lib/entity-normalize";
import { organizationMatchesRouteSlug } from "@/lib/entity-route-hrefs";
import { createOrganizationAction } from "@/lib/mutations/organizations";
import {
  getOrganizationSidePanelHref,
  getOrganizationsHref,
  getSelectedOrganizationSlugFromPathname,
} from "@/lib/organizations/navigation-path";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { keyboardNavItemProps } from "@/lib/shortcuts/keyboard-nav-item";
import { LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL } from "@/lib/shortcuts/list-keyboard-nav-zone";
import { sidePanelItemClass } from "@/lib/side-panel-styles";
import { createLocalOrganization } from "@/lib/sync/local-organization-mutations";
import { preferLocalOrApi } from "@/lib/sync/prefer-local-or-api";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

export function OrganizationsSidePanel({ pathname }: { pathname: string }) {
  const router = useRouter();
  const listRef = useRef<HTMLElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  const [isCreating, startCreateTransition] = useTransition();
  const selectedSlug = getSelectedOrganizationSlugFromPathname(pathname);
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

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof organizations>();
    for (const organization of organizations) {
      const first = (organization.name || "").trim()[0]?.toUpperCase() ?? "#";
      const key = first >= "A" && first <= "Z" ? first : "#";
      const existing = groups.get(key);
      if (existing) existing.push(organization);
      else groups.set(key, [organization]);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
  }, [organizations]);

  const selectedOrganizationId = useMemo(() => {
    if (!selectedSlug) return null;
    return (
      organizations.find((organization) =>
        organizationMatchesRouteSlug(organization, selectedSlug),
      )?.id ?? null
    );
  }, [organizations, selectedSlug]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: organizations.map((organization) => organization.id),
    selectedId: selectedOrganizationId,
    onNavigate: (organizationId) => {
      const organization = organizations.find(
        (entry) => entry.id === organizationId,
      );
      if (!organization) return;
      const href = getOrganizationSidePanelHref(organization, pathname);
      if (href !== pathname) {
        router.push(href);
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: organizations.length > 0,
  });

  const handleCreateOrganization = useCallback(() => {
    startCreateTransition(async () => {
      const result = await runEntityPersist(
        () => createLocalOrganization({ name: "New organization" }),
        () => createOrganizationAction({ name: "New organization" }),
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      router.push(
        getOrganizationsHref({
          number: result.organizationNumber,
          key: result.organizationKey,
        }),
      );
    });
  }, [router]);

  return (
    <div className="app-content-side-panel app-content-side-panel--organizations flex h-full min-h-0 flex-col">
      <ContentSidePanelHeader
        title="Organizations"
        actions={
          <button
            type="button"
            onClick={handleCreateOrganization}
            disabled={isCreating}
            className="app-side-panel-section-action"
            aria-label="Create organization"
          >
            <SidePanelPlusIcon />
          </button>
        }
      />
      <div className="app-content-side-panel-main flex min-h-0 flex-1 flex-col">
        {!organizations.length ? (
          <p className="app-content-side-panel-empty">
            No organizations yet. Use the plus button to add one.
          </p>
        ) : (
          <ContentSidePanelList
            ref={listRef}
            aria-label="Organizations"
            {...listContainerProps}
          >
            {grouped.flatMap(([letter, entries]) => [
              <li key={`group-${letter}`} className="px-2 pt-3 pb-1">
                <span className="text-[11px] font-semibold tracking-wide text-foreground/40">
                  {letter}
                </span>
              </li>,
              ...entries.map((organization) => {
                const isActive = organizationMatchesRouteSlug(
                  organization,
                  selectedSlug,
                );
                const href = getOrganizationSidePanelHref(
                  organization,
                  pathname,
                );

                return (
                  <li key={organization.id}>
                    <Link
                      href={href}
                      scroll={false}
                      className={sidePanelItemClass({
                        active: isActive,
                        keyboardHighlighted: highlightedId === organization.id,
                      })}
                      aria-current={isActive ? "page" : undefined}
                      {...keyboardNavItemProps(organization.id)}
                    >
                      {organization.avatarStorageKey ? (
                        <span
                          className="app-side-panel-item-icon"
                          aria-hidden="true"
                        >
                          <MobileRemoteImage
                            kind="organization-avatar"
                            entityId={organization.id}
                            storageKey={organization.avatarStorageKey}
                            fallbackSrc={getOrganizationAvatarSrc(
                              organization.id,
                              organization.updatedAt,
                            )}
                            alt=""
                            size={16}
                            className="rounded-full object-cover"
                          />
                        </span>
                      ) : null}
                      <span className="app-side-panel-item-label">
                        {organization.name}
                      </span>
                    </Link>
                  </li>
                );
              }),
            ])}
          </ContentSidePanelList>
        )}
      </div>
    </div>
  );
}
