import type {
  BankAccount,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
  FinancialTransaction,
  MapboxGeocodeResult,
  MapboxSettings,
  MoneybirdSalesInvoiceDetail,
  MoneybirdSalesInvoiceSummary,
  MoneybirdSettings,
  Organization as ApiOrganization,
} from "@backsteros/contracts";
import {
  coerceOrganizationEmailEntries,
  coerceOrganizationPhoneEntries,
} from "@backsteros/contracts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  AvatarUpload,
  buildMoneybirdContactInvoicesFilter,
  buildMoneybirdInvoicesFilter,
  CrmActivityFeedView,
  EntityDetailLayout,
  FinanceInvoicesView,
  formatContactAddressLine,
  normalizeContactSocialAccounts,
  OrganizationContactsListView,
  OrganizationDetailOverlay,
  OrganizationDetailView,
  OrganizationTransactionsSection,
  OrganizationsOverviewView,
  ORGANIZATION_CARD_SECTIONS,
  ORGANIZATION_DETAIL_COLLAPSE_DURATION_MS,
  ORGANIZATION_DETAIL_CONTENT_FADE_MS,
  ORGANIZATION_DETAIL_EXPAND_FADE_MS,
  ProjectsOverviewView,
  RegisterEntityDeleteAction,
  RegisterPageIcon,
  RegisterPageTitle,
  resolveCountryOption,
  ScopedLettersListView,
  buildOrganizationProjectsHref,
  resolveScopedLetterDetailHref,
  getOrganizationContactHref,
  getOrganizationOverlayHref,
  getOrganizationProjectHref,
  getOrganizationSectionHref,
  getOrganizationsGroupHref,
  getUniqueListItemRouteParam,
  isOrganizationCardSectionId,
  isOrganizationSectionId,
  localCalendarYear,
  parseCrmGroupId,
  parseListBoardViewFromLocation,
  parseOrganizationOverlayLayout,
  parseOrganizationSectionId,
  parseSectionTabIndex,
  persistListBoardView,
  primeTabTitle,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  resolveListItemFromSlug,
  resolveOrganizationWorkspaceTabs,
  shouldHandleGlobalShortcut,
  type ContactListItem,
  type ListBoardView,
  type OrganizationExpandedWorkspaceTabId,
  type OrganizationListItem,
  type OrganizationOverlayLayout,
  type OrganizationOverviewDetails,
  type OrganizationSectionId,
  type ProjectStatus,
  type TaskStatus,
  projectReorderPatches,
} from "@backsteros/ui";

import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";
import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
} from "../lib/avatar-upload";
import {
  useCrmActivityFeed,
  useCrmGroupOrganizationIds,
  useCrmGroupsCatalog,
  useCrmGroupsForSubject,
  addCrmGroupMemberWithRetry,
  notifyCrmGroupsChanged,
} from "../lib/use-crm-data";
import { useDesktopPowerSync } from "../lib/powersync-context";
import {
  useKeepAliveActive,
  useKeepAliveFrozen,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { type ProjectLocationState } from "../lib/project-type-cache";
import { buildWorkingProjectIdSet } from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import { navigateToHref } from "../router/navigate-href";

function asCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

type MoneybirdInvoicesListResponse = {
  invoices: MoneybirdSalesInvoiceSummary[];
  page: number;
  perPage: number;
  hasMore: boolean;
  totalPages: number;
};

function orgSlug(org: {
  number?: number | null;
  key?: string | null;
  id: string;
}) {
  return org.number ?? org.key ?? org.id;
}

async function fetchAllOrganizationTransactions(
  client: {
    requestJson: <T>(path: string) => Promise<T>;
  },
  organizationId: string,
): Promise<FinancialTransaction[]> {
  const rows: FinancialTransaction[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({
      organizationId,
      limit: "500",
    });
    if (cursor) params.set("cursor", cursor);
    const body = await client.requestJson<{
      transactions: FinancialTransaction[];
      nextCursor: string | null;
    }>(`/api/v1/transactions?${params}`);
    rows.push(...body.transactions);
    cursor = body.nextCursor;
  } while (cursor);
  return rows;
}

export function OrganizationsPage() {
  // Keep-alive + HMR: touch export so Fast Refresh remounts after shell port.
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const keepAliveActive = useKeepAliveActive();
  const keepAliveFrozen = useKeepAliveFrozen();
  const location = useShellLocation();
  const { slug: routedSlug, section: sectionParam } = useShellParams() as {
    slug?: string;
    section?: string;
  };
  const workspace = useDesktopWorkspaceData();
  const agentStatus = useDesktopAgentStatusOptional();
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const { organizations, projects, letters, contacts } = workspace;
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    keepAliveFrozen ? [] : organizations,
  );
  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? [] : contacts,
  );
  const [avatarOverride, setAvatarOverride] = useState<
    string | null | undefined
  >(undefined);

  const selected = routedSlug
    ? resolveListItemFromSlug(organizations, routedSlug)
    : null;

  const overlayLayout: OrganizationOverlayLayout = parseOrganizationOverlayLayout(
    location.searchStr ?? "",
  );
  const selectedGroupId = parseCrmGroupId(location.searchStr ?? "");
  const groupsCatalog = useCrmGroupsCatalog(keepAliveActive);
  const groupMembers = useCrmGroupOrganizationIds(
    selectedGroupId,
    keepAliveActive && Boolean(selectedGroupId),
  );
  const selectedGroupName = selectedGroupId
    ? (groupsCatalog.groups.find((group) => group.id === selectedGroupId)
        ?.name ?? null)
    : null;

  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [detailCollapseAnimating, setDetailCollapseAnimating] =
    useState(false);
  const detailCollapseAnimTimerRef = useRef<number | null>(null);
  const detailCollapseRafRef = useRef<number | null>(null);
  const detailCloseNavTimerRef = useRef<number | null>(null);
  const detailCollapsedRef = useRef(detailCollapsed);
  detailCollapsedRef.current = detailCollapsed;
  /** Organization id shown in the panel — lags `selected` during switch fade. */
  const [panelOrganizationId, setPanelOrganizationId] = useState<
    string | null
  >(selected?.id ?? null);
  const [contentFaded, setContentFaded] = useState(false);
  const contentFadeTokenRef = useRef(0);
  /** Organizations list opacity during expand/collapse to page workspace. */
  const [listFaded, setListFaded] = useState(() => overlayLayout === "page");
  /** Expanded workspace opacity during expand/collapse. */
  const [workspaceFaded, setWorkspaceFaded] = useState(false);
  const expandAnimTokenRef = useRef(0);
  const expandAnimTimerRef = useRef<number | null>(null);
  const pendingWorkspaceFadeInRef = useRef(false);
  const pendingListFadeInRef = useRef(false);
  /** Keep a just-created organization at the top of the list until navigation leaves it. */
  const [pinnedOrganizationId, setPinnedOrganizationId] = useState<
    string | null
  >(null);
  const pinnedWasSelectedRef = useRef(false);
  const [workspaceTab, setWorkspaceTab] =
    useState<OrganizationExpandedWorkspaceTabId>("projects");
  /** Activity / Details on the profile card — local so it never closes the workspace. */
  const [cardSection, setCardSection] = useState<"overview" | "details">(
    "overview",
  );

  useEffect(() => {
    if (!pinnedOrganizationId) {
      pinnedWasSelectedRef.current = false;
      return;
    }
    if (selected?.id === pinnedOrganizationId) {
      pinnedWasSelectedRef.current = true;
      return;
    }
    if (pinnedWasSelectedRef.current) {
      setPinnedOrganizationId(null);
    }
  }, [pinnedOrganizationId, selected?.id]);

  const panelOrganization: OrganizationListItem | null = panelOrganizationId
    ? (organizations.find((entry) => entry.id === panelOrganizationId) ??
      (selected?.id === panelOrganizationId ? selected : null))
    : null;

  const details: ApiOrganization | null = panelOrganizationId
    ? (workspace.organizationDetails[panelOrganizationId] ?? null)
    : null;

  const moneybirdContactId =
    details?.moneybirdContactId?.trim() ||
    panelOrganization?.moneybirdContactId?.trim() ||
    null;

  const [mapboxConfigured, setMapboxConfigured] = useState<boolean | null>(
    null,
  );
  const [mapImageSrc, setMapImageSrc] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapHint, setMapHint] = useState<string | null>(null);
  const [geocodeFailed, setGeocodeFailed] = useState(false);
  const [moneybirdAdministrationId, setMoneybirdAdministrationId] = useState<
    string | null
  >(null);
  const [moneybirdCompanyFields, setMoneybirdCompanyFields] = useState<{
    chamberOfCommerce: string | null;
    taxNumber: string | null;
  } | null>(null);
  const moneybirdSyncKeyRef = useRef<string | null>(null);
  const geocodeAttemptKeyRef = useRef<string | null>(null);
  const mapCoordsKeyRef = useRef<string | null>(null);
  const mapImageSrcRef = useRef<string | null>(null);
  const patchOrganization = workspace.patchOrganization;

  const organizationLatitude = asCoord(details?.latitude);
  const organizationLongitude = asCoord(details?.longitude);
  const moneybirdHref =
    moneybirdContactId && moneybirdAdministrationId
      ? `https://moneybird.com/${encodeURIComponent(moneybirdAdministrationId)}/contacts/${encodeURIComponent(moneybirdContactId)}`
      : null;
  const chamberOfCommerce =
    moneybirdCompanyFields?.chamberOfCommerce?.trim() ||
    details?.chamberOfCommerce?.trim() ||
    null;
  const taxNumber =
    moneybirdCompanyFields?.taxNumber?.trim() ||
    details?.taxNumber?.trim() ||
    null;

  const [hasTransactions, setHasTransactions] = useState(false);
  const [hasInvoices, setHasInvoices] = useState(false);
  const [financeProbeReady, setFinanceProbeReady] = useState(false);

  const [orgTransactions, setOrgTransactions] = useState<
    FinancialTransaction[]
  >([]);
  const [orgTransactionsLoading, setOrgTransactionsLoading] = useState(false);
  const [financeCategories, setFinanceCategories] = useState<
    FinancialCategory[]
  >([]);
  const [financeAccounts, setFinanceAccounts] = useState<BankAccount[]>([]);
  const [financeGoals, setFinanceGoals] = useState<FinancialGoal[]>([]);
  const [financeRecurrings, setFinanceRecurrings] = useState<
    FinancialRecurring[]
  >([]);

  const [orgInvoices, setOrgInvoices] = useState<
    MoneybirdSalesInvoiceSummary[]
  >([]);
  const [orgInvoicesLoading, setOrgInvoicesLoading] = useState(false);
  const [orgInvoicesError, setOrgInvoicesError] = useState<string | null>(
    null,
  );
  const [orgInvoicesConnected, setOrgInvoicesConnected] = useState(false);
  const [orgInvoicesPage, setOrgInvoicesPage] = useState(1);
  const [orgInvoicesTotalPages, setOrgInvoicesTotalPages] = useState(1);
  const [orgInvoicesHasMore, setOrgInvoicesHasMore] = useState(false);
  const [orgInvoicesYear, setOrgInvoicesYear] = useState(() =>
    localCalendarYear(),
  );
  const [orgInvoiceStatusIds, setOrgInvoiceStatusIds] = useState<string[]>([]);
  const [selectedOrgInvoiceId, setSelectedOrgInvoiceId] = useState<
    string | null
  >(null);
  const [orgInvoiceDetail, setOrgInvoiceDetail] =
    useState<MoneybirdSalesInvoiceDetail | null>(null);
  const [orgInvoiceDetailLoading, setOrgInvoiceDetailLoading] =
    useState(false);
  const [orgInvoiceDetailError, setOrgInvoiceDetailError] = useState<
    string | null
  >(null);

  const orgProjectsListView = useMemo(
    () =>
      parseListBoardViewFromLocation(
        location.pathname,
        location.searchStr,
        PROJECTS_LIST_BOARD_STORAGE_KEY,
      ),
    [location.pathname, location.searchStr],
  );

  useEffect(() => {
    setAvatarOverride(undefined);
  }, [panelOrganizationId]);

  useEffect(() => {
    setCardSection("overview");
  }, [panelOrganizationId]);

  const visibleWorkspaceTabs = useMemo(
    () =>
      resolveOrganizationWorkspaceTabs({ hasTransactions, hasInvoices }) as {
        id: OrganizationExpandedWorkspaceTabId;
        label: string;
      }[],
    [hasInvoices, hasTransactions],
  );
  const visibleWorkspaceTabIds = useMemo(
    () => visibleWorkspaceTabs.map((entry) => entry.id),
    [visibleWorkspaceTabs],
  );

  useEffect(() => {
    if (!financeProbeReady) return;
    if (workspaceTab === "transactions" && !hasTransactions) {
      setWorkspaceTab("projects");
    } else if (workspaceTab === "invoices" && !hasInvoices) {
      setWorkspaceTab("projects");
    }
  }, [financeProbeReady, hasInvoices, hasTransactions, workspaceTab]);

  const activeSection = parseOrganizationSectionId(sectionParam);
  // Standalone card tabs (Activity / Details) are local — URL section is for
  // deep links; workspace tabs (Projects/Contacts/…) are separate state.
  const profileSection: "overview" | "details" = cardSection;
  const activityFeed = useCrmActivityFeed(
    "organization",
    panelOrganizationId,
    keepAliveActive &&
      Boolean(panelOrganizationId) &&
      profileSection === "overview",
  );
  const crmGroups = useCrmGroupsForSubject(
    "organization",
    panelOrganizationId,
    keepAliveActive && Boolean(panelOrganizationId),
  );
  const groupOptions = useMemo(
    () =>
      crmGroups.allGroups.map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color,
      })),
    [crmGroups.allGroups],
  );
  const memberGroupIds = useMemo(
    () => crmGroups.memberGroups.map((group) => group.id),
    [crmGroups.memberGroups],
  );
  const handleMemberGroupIdsChange = useCallback(
    (nextIds: string[]) => {
      const previous = new Set(memberGroupIds);
      const next = new Set(nextIds);
      for (const groupId of next) {
        if (!previous.has(groupId)) {
          void crmGroups.toggleMembership(groupId, true);
        }
      }
      for (const groupId of previous) {
        if (!next.has(groupId)) {
          void crmGroups.toggleMembership(groupId, false);
        }
      }
    },
    [crmGroups.toggleMembership, memberGroupIds],
  );

  useEffect(() => {
    if (!keepAliveActive) return;
    let cancelled = false;
    void (async () => {
      try {
        const mapbox = await client.requestJson<MapboxSettings>(
          "/api/v1/settings/mapbox",
        );
        if (!cancelled) setMapboxConfigured(mapbox.accessTokenConfigured);
      } catch {
        if (!cancelled) setMapboxConfigured(false);
      }
    })();
    void (async () => {
      try {
        const moneybird = await client.requestJson<MoneybirdSettings>(
          "/api/v1/settings/moneybird",
        );
        if (!cancelled) {
          setMoneybirdAdministrationId(moneybird.administrationId);
        }
      } catch {
        if (!cancelled) setMoneybirdAdministrationId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, keepAliveActive]);

  useEffect(() => {
    setGeocodeFailed(false);
    moneybirdSyncKeyRef.current = null;
    geocodeAttemptKeyRef.current = null;
    mapCoordsKeyRef.current = null;
    mapImageSrcRef.current = null;
  }, [panelOrganizationId]);

  useEffect(() => {
    let cancelled = false;
    let fetchedUrl: string | null = null;

    if (organizationLatitude == null || organizationLongitude == null) {
      mapCoordsKeyRef.current = null;
      setMapImageSrc((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      mapImageSrcRef.current = null;
      setMapLoading(false);
      return;
    }

    // Settings still loading — keep any existing tile; don't flash empty.
    if (mapboxConfigured == null) {
      return;
    }

    if (!mapboxConfigured) {
      mapCoordsKeyRef.current = null;
      setMapImageSrc((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      mapImageSrcRef.current = null;
      setMapLoading(false);
      return;
    }

    const coordsKey = `${organizationLatitude.toFixed(5)},${organizationLongitude.toFixed(5)}`;
    if (mapCoordsKeyRef.current === coordsKey && mapImageSrcRef.current) {
      return;
    }

    setMapLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          lat: String(organizationLatitude),
          lng: String(organizationLongitude),
          width: "640",
          height: "320",
        });
        const blob = await client.requestBinary(
          `/api/v1/mapbox/static-map?${params}`,
        );
        if (cancelled) return;
        fetchedUrl = URL.createObjectURL(blob);
        mapCoordsKeyRef.current = coordsKey;
        mapImageSrcRef.current = fetchedUrl;
        setMapImageSrc((current) => {
          if (current) URL.revokeObjectURL(current);
          return fetchedUrl;
        });
        setMapHint(null);
      } catch {
        if (cancelled) return;
        mapCoordsKeyRef.current = null;
        mapImageSrcRef.current = null;
        setMapImageSrc((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
        setMapHint("Couldn’t load the map image.");
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, mapboxConfigured, organizationLatitude, organizationLongitude]);

  useEffect(() => {
    const addressLine = formatContactAddressLine({
      address: details?.address,
      city: details?.city,
      postalCode: details?.postalCode,
      country: details?.country,
      region: details?.region,
    });
    if (mapImageSrc) {
      setMapHint(null);
      return;
    }
    if (organizationLatitude != null && organizationLongitude != null) {
      if (mapboxConfigured === false) {
        setMapHint(
          "Add a Mapbox token in Settings → Mapbox to show this on a map.",
        );
        return;
      }
      // Coords present — fetch effect owns load/error hints.
      return;
    }
    if (!addressLine) {
      setMapHint(null);
      return;
    }
    if (mapboxConfigured === false) {
      setMapHint(
        "Add a Mapbox token in Settings → Mapbox to show this on a map.",
      );
      return;
    }
    if (mapboxConfigured == null) {
      setMapHint(null);
      return;
    }
    if (geocodeFailed) {
      setMapHint("Couldn’t locate this address.");
      return;
    }
    setMapHint("Locating address…");
  }, [
    details?.address,
    details?.city,
    details?.country,
    details?.postalCode,
    details?.region,
    geocodeFailed,
    mapImageSrc,
    mapboxConfigured,
    organizationLatitude,
    organizationLongitude,
  ]);

  const organizationDetails = workspace.organizationDetails;
  const organizationDetailsRef = useRef(organizationDetails);
  organizationDetailsRef.current = organizationDetails;

  const resolveOrganizationLocation = useCallback(
    async (
      organizationId: string,
      parts: {
        address?: string | null;
        city?: string | null;
        postalCode?: string | null;
        country?: string | null;
        region?: string | null;
      },
    ) => {
      const addressLine = formatContactAddressLine(parts);
      if (!addressLine) {
        setGeocodeFailed(false);
        geocodeAttemptKeyRef.current = null;
        await patchOrganization(organizationId, {
          latitude: null,
          longitude: null,
        });
        return;
      }
      if (!mapboxConfigured) {
        setGeocodeFailed(false);
        return;
      }
      const attemptKey = `${organizationId}:${addressLine}:${parts.country ?? ""}`;
      if (geocodeAttemptKeyRef.current === attemptKey) {
        return;
      }
      geocodeAttemptKeyRef.current = attemptKey;
      try {
        const params = new URLSearchParams({ q: addressLine });
        const countryCode = resolveCountryOption(parts.country)?.code;
        if (countryCode) {
          params.set("country", countryCode);
        }
        const body = await client.requestJson<{
          result: MapboxGeocodeResult | null;
        }>(`/api/v1/mapbox/geocode?${params}`);
        if (!body.result) {
          setGeocodeFailed(true);
          await patchOrganization(organizationId, {
            latitude: null,
            longitude: null,
          });
          return;
        }
        setGeocodeFailed(false);
        const nextLat = body.result.latitude;
        const nextLng = body.result.longitude;
        const current = organizationDetailsRef.current[organizationId];
        const currentLat = asCoord(current?.latitude);
        const currentLng = asCoord(current?.longitude);
        if (
          currentLat != null &&
          currentLng != null &&
          Math.abs(currentLat - nextLat) < 1e-5 &&
          Math.abs(currentLng - nextLng) < 1e-5
        ) {
          return;
        }
        await patchOrganization(organizationId, {
          latitude: nextLat,
          longitude: nextLng,
        });
      } catch {
        setGeocodeFailed(true);
        geocodeAttemptKeyRef.current = null;
      }
    },
    [client, mapboxConfigured, patchOrganization],
  );

  useEffect(() => {
    if (!keepAliveActive || !moneybirdContactId || !panelOrganizationId) {
      setMoneybirdCompanyFields(null);
      moneybirdSyncKeyRef.current = null;
      return;
    }
    const syncKey = `${panelOrganizationId}:${moneybirdContactId}`;
    if (moneybirdSyncKeyRef.current === syncKey) return;

    let cancelled = false;
    void (async () => {
      try {
        const body = await client.requestJson<{
          chamberOfCommerce: string | null;
          taxNumber: string | null;
          address1: string | null;
          address2: string | null;
          zipcode: string | null;
          city: string | null;
          country: string | null;
        }>(
          `/api/v1/finance/moneybird/contacts/${encodeURIComponent(moneybirdContactId)}`,
        );
        if (cancelled) return;
        moneybirdSyncKeyRef.current = syncKey;

        const nextChamber = body.chamberOfCommerce?.trim() || null;
        const nextTax = body.taxNumber?.trim() || null;
        setMoneybirdCompanyFields({
          chamberOfCommerce: nextChamber,
          taxNumber: nextTax,
        });

        const line1 = body.address1?.trim() || "";
        const line2 = body.address2?.trim() || "";
        const addressFromMoneybird =
          [line1, line2].filter(Boolean).join("\n") || null;
        const cityFromMoneybird = body.city?.trim() || null;
        const postalFromMoneybird = body.zipcode?.trim() || null;
        const countryRaw = body.country?.trim() || null;
        const countryFromMoneybird =
          resolveCountryOption(countryRaw)?.code ?? countryRaw;
        const hasMoneybirdAddress = Boolean(
          addressFromMoneybird ||
            cityFromMoneybird ||
            postalFromMoneybird ||
            countryFromMoneybird,
        );

        const current = organizationDetailsRef.current[panelOrganizationId];
        const patch: Record<string, string | null> = {};
        if ((current?.chamberOfCommerce ?? null) !== nextChamber) {
          patch.chamberOfCommerce = nextChamber;
        }
        if ((current?.taxNumber ?? null) !== nextTax) {
          patch.taxNumber = nextTax;
        }
        if (hasMoneybirdAddress) {
          if ((current?.address ?? null) !== addressFromMoneybird) {
            patch.address = addressFromMoneybird;
          }
          if ((current?.city ?? null) !== cityFromMoneybird) {
            patch.city = cityFromMoneybird;
          }
          if ((current?.postalCode ?? null) !== postalFromMoneybird) {
            patch.postalCode = postalFromMoneybird;
          }
          if ((current?.country ?? null) !== countryFromMoneybird) {
            patch.country = countryFromMoneybird;
          }
          if ((current?.region ?? null) != null) {
            patch.region = null;
          }
        }

        if (Object.keys(patch).length > 0) {
          await patchOrganization(panelOrganizationId, patch);
        }
        if (cancelled) return;
        if (hasMoneybirdAddress) {
          await resolveOrganizationLocation(panelOrganizationId, {
            address: addressFromMoneybird,
            city: cityFromMoneybird,
            postalCode: postalFromMoneybird,
            country: countryFromMoneybird,
            region: null,
          });
        }
      } catch {
        if (!cancelled) {
          setMoneybirdCompanyFields(null);
          moneybirdSyncKeyRef.current = null;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    client,
    keepAliveActive,
    moneybirdContactId,
    panelOrganizationId,
    patchOrganization,
    resolveOrganizationLocation,
  ]);

  // If address exists but coords were never written (e.g. Mapbox wasn't ready
  // during Moneybird sync), geocode once Mapbox is available.
  useEffect(() => {
    if (
      !keepAliveActive ||
      !panelOrganizationId ||
      !mapboxConfigured ||
      !details
    ) {
      return;
    }
    if (organizationLatitude != null && organizationLongitude != null) {
      return;
    }
    const parts = {
      address: details.address ?? null,
      city: details.city ?? null,
      postalCode: details.postalCode ?? null,
      country: details.country ?? null,
      region: details.region ?? null,
    };
    if (!formatContactAddressLine(parts)) return;
    void resolveOrganizationLocation(panelOrganizationId, parts);
  }, [
    details?.address,
    details?.city,
    details?.country,
    details?.postalCode,
    details?.region,
    keepAliveActive,
    mapboxConfigured,
    organizationLatitude,
    organizationLongitude,
    panelOrganizationId,
    resolveOrganizationLocation,
  ]);

  const sectionLabel =
    profileSection === "overview"
      ? null
      : (ORGANIZATION_CARD_SECTIONS.find((entry) => entry.id === profileSection)
          ?.label ?? null);

  const selectedSlugValue = selected ? String(orgSlug(selected)) : null;

  const accountAvatarSrcById = useDesktopAvatarSrcMap(
    "bank_account",
    financeAccounts,
  );

  const orgListItem = useMemo(() => {
    if (!panelOrganization) return null;
    return {
      id: panelOrganization.id,
      name: panelOrganization.name,
      number: panelOrganization.number,
      key: panelOrganization.key,
      moneybirdContactId,
    };
  }, [moneybirdContactId, panelOrganization]);

  // Sync Activity / Details from deep-link URLs when no workspace tab is open.
  useEffect(() => {
    if (sectionParam === "details") {
      setCardSection("details");
      return;
    }
    if (!sectionParam || sectionParam === "overview" || sectionParam === "activity") {
      setCardSection("overview");
    }
  }, [sectionParam]);

  // Invalid section segment → overview. Legacy full-page workspace tabs
  // (`/projects`, `/contacts`, `/letters`, `/transactions`, `/invoices`) →
  // expanded overlay layout with the matching workspace tab.
  useEffect(() => {
    if (!keepAliveActive) return;
    if (!selected || !sectionParam || !selectedSlugValue) return;
    if (
      sectionParam === "projects" ||
      sectionParam === "contacts" ||
      sectionParam === "letters" ||
      sectionParam === "transactions" ||
      sectionParam === "invoices"
    ) {
      setWorkspaceTab(sectionParam);
      setDetailCollapsed(false);
      navigate(
        getOrganizationOverlayHref(selectedSlugValue, {
          layout: "page",
          groupId: selectedGroupId,
        }),
        { replace: true },
      );
      return;
    }
    if (
      sectionParam !== "overview" &&
      sectionParam !== "activity" &&
      sectionParam !== "details" &&
      !isOrganizationSectionId(sectionParam)
    ) {
      navigate(getOrganizationSectionHref(selectedSlugValue, "overview"), {
        replace: true,
      });
    }
  }, [
    keepAliveActive,
    navigate,
    sectionParam,
    selected,
    selectedGroupId,
    selectedSlugValue,
  ]);

  useDesktopSectionBreadcrumb(
    selected
      ? [
          {
            label: "Organizations",
            href: getOrganizationsGroupHref(selectedGroupId),
          },
          {
            label: selected.name,
            href:
              profileSection === "overview" || !selectedSlugValue
                ? undefined
                : getOrganizationOverlayHref(selectedSlugValue, {
                    layout: overlayLayout,
                    groupId: selectedGroupId,
                  }),
          },
          ...(sectionLabel ? [{ label: sectionLabel }] : []),
        ]
      : [{ label: selectedGroupName ?? "Organizations" }],
    { enabled: keepAliveActive },
  );

  const handleDeleteOrganization = useCallback(async () => {
    if (!selected) {
      return { ok: false as const, error: "Organization is required." };
    }
    try {
      await workspace.softDeleteOrganization(selected.id);
      navigate(getOrganizationsGroupHref(selectedGroupId), { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete organization.",
      };
    }
  }, [navigate, selected, selectedGroupId, workspace]);

  useEffect(() => {
    if (!panelOrganizationId) {
      setHasTransactions(false);
      setHasInvoices(false);
      setFinanceProbeReady(false);
      return;
    }
    let cancelled = false;
    setFinanceProbeReady(false);
    setHasTransactions(false);
    setHasInvoices(false);
    void (async () => {
      const contactId = moneybirdContactId;
      try {
        const [txProbe, invoiceProbe] = await Promise.all([
          client.requestJson<{ transactions: FinancialTransaction[] }>(
            `/api/v1/transactions?${new URLSearchParams({
              organizationId: panelOrganizationId,
              limit: "1",
            })}`,
          ),
          contactId
            ? client
                .requestJson<MoneybirdInvoicesListResponse>(
                  `/api/v1/finance/moneybird/invoices?${new URLSearchParams({
                    page: "1",
                    perPage: "1",
                    filter: buildMoneybirdContactInvoicesFilter(contactId),
                  })}`,
                )
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setHasTransactions(txProbe.transactions.length > 0);
        setHasInvoices(
          Boolean(invoiceProbe && invoiceProbe.invoices.length > 0),
        );
        setOrgInvoicesConnected(invoiceProbe != null);
      } catch {
        if (cancelled) return;
        setHasTransactions(false);
        setHasInvoices(false);
      } finally {
        if (!cancelled) setFinanceProbeReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, moneybirdContactId, panelOrganizationId]);

  useEffect(() => {
    if (
      !panelOrganizationId ||
      overlayLayout !== "page" ||
      workspaceTab !== "transactions"
    ) {
      return;
    }
    let cancelled = false;
    setOrgTransactionsLoading(true);
    void (async () => {
      try {
        const [
          transactions,
          categoriesBody,
          accountsBody,
          goalsBody,
          recurringsBody,
        ] = await Promise.all([
          fetchAllOrganizationTransactions(client, panelOrganizationId),
          client.requestJson<{ categories: FinancialCategory[] }>(
            "/api/v1/financial-categories",
          ),
          client.requestJson<{ bankAccounts: BankAccount[] }>(
            "/api/v1/bank-accounts",
          ),
          client.requestJson<{ goals: FinancialGoal[] }>(
            "/api/v1/financial-goals",
          ),
          client.requestJson<{ recurrings: FinancialRecurring[] }>(
            "/api/v1/financial-recurrings",
          ),
        ]);
        if (cancelled) return;
        setOrgTransactions(transactions);
        setFinanceCategories(categoriesBody.categories);
        setFinanceAccounts(accountsBody.bankAccounts);
        setFinanceGoals(goalsBody.goals);
        setFinanceRecurrings(recurringsBody.recurrings);
      } catch {
        if (cancelled) return;
        setOrgTransactions([]);
      } finally {
        if (!cancelled) setOrgTransactionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, overlayLayout, panelOrganizationId, workspaceTab]);

  useEffect(() => {
    if (
      !panelOrganizationId ||
      overlayLayout !== "page" ||
      workspaceTab !== "invoices" ||
      !moneybirdContactId
    ) {
      return;
    }
    let cancelled = false;
    setOrgInvoicesLoading(true);
    setOrgInvoicesError(null);
    void (async () => {
      try {
        const filter = buildMoneybirdInvoicesFilter(
          orgInvoicesYear,
          orgInvoiceStatusIds,
          { contactId: moneybirdContactId },
        );
        const body = await client.requestJson<MoneybirdInvoicesListResponse>(
          `/api/v1/finance/moneybird/invoices?${new URLSearchParams({
            page: String(orgInvoicesPage),
            perPage: "50",
            filter,
          })}`,
        );
        if (cancelled) return;
        setOrgInvoices(body.invoices);
        setOrgInvoicesPage(body.page);
        setOrgInvoicesTotalPages(body.totalPages);
        setOrgInvoicesHasMore(body.hasMore);
        setOrgInvoicesConnected(true);
      } catch (error) {
        if (cancelled) return;
        setOrgInvoices([]);
        setOrgInvoicesHasMore(false);
        setOrgInvoicesTotalPages(1);
        setOrgInvoicesError(
          error instanceof Error
            ? error.message
            : "Failed to load Moneybird invoices",
        );
      } finally {
        if (!cancelled) setOrgInvoicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    client,
    moneybirdContactId,
    orgInvoiceStatusIds,
    orgInvoicesPage,
    orgInvoicesYear,
    overlayLayout,
    panelOrganizationId,
    workspaceTab,
  ]);

  useEffect(() => {
    setSelectedOrgInvoiceId(null);
  }, [orgInvoicesPage, orgInvoicesYear, orgInvoiceStatusIds, panelOrganizationId]);

  useEffect(() => {
    if (workspaceTab !== "invoices" || !selectedOrgInvoiceId) {
      setOrgInvoiceDetail(null);
      setOrgInvoiceDetailError(null);
      setOrgInvoiceDetailLoading(false);
      return;
    }
    let cancelled = false;
    setOrgInvoiceDetailLoading(true);
    setOrgInvoiceDetailError(null);
    void (async () => {
      try {
        const detail = await client.requestJson<MoneybirdSalesInvoiceDetail>(
          `/api/v1/finance/moneybird/invoices/${encodeURIComponent(selectedOrgInvoiceId)}`,
        );
        if (cancelled) return;
        setOrgInvoiceDetail(detail);
      } catch (error) {
        if (cancelled) return;
        setOrgInvoiceDetail(null);
        setOrgInvoiceDetailError(
          error instanceof Error
            ? error.message
            : "Failed to load invoice detail",
        );
      } finally {
        if (!cancelled) setOrgInvoiceDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, selectedOrgInvoiceId, workspaceTab]);

  const patchOrgTransaction = useCallback(
    async (
      id: string,
      patch: {
        categoryId?: string | null;
        organizationId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
        projectId?: string | null;
        notes?: string | null;
        bankAccountId?: string | null;
      },
    ) => {
      const updated = await client.requestJson<FinancialTransaction>(
        `/api/v1/transactions/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setOrgTransactions((current) => {
        const next = current
          .map((row) => (row.id === id ? updated : row))
          .filter((row) => row.organizationId === panelOrganizationId);
        setHasTransactions(next.length > 0);
        return next;
      });
    },
    [client, panelOrganizationId],
  );

  const bulkPatchOrgTransactions = useCallback(
    async (
      ids: string[],
      patch: {
        categoryId?: string | null;
        organizationId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
        projectId?: string | null;
        notes?: string | null;
        bankAccountId?: string | null;
      },
    ) => {
      for (let offset = 0; offset < ids.length; offset += 500) {
        const chunk = ids.slice(offset, offset + 500);
        await client.requestJson("/api/v1/transactions/batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: chunk, patch }),
        });
      }
      if (!panelOrganizationId) return;
      const refreshed = await fetchAllOrganizationTransactions(
        client,
        panelOrganizationId,
      );
      setOrgTransactions(refreshed);
      setHasTransactions(refreshed.length > 0);
    },
    [client, panelOrganizationId],
  );

  const orgProjects = useMemo(
    () =>
      selected
        ? projects.filter((project) => project.organizationId === selected.id)
        : [],
    [projects, selected],
  );

  const workingProjectIds = useMemo(
    () =>
      buildWorkingProjectIdSet(
        workspace.allTasks,
        agentStatus?.workingTaskIds ?? new Set(),
      ),
    [agentStatus?.workingTaskIds, workspace.allTasks],
  );

  const orgLetters = useMemo(() => {
    if (!selected) return [];
    return letters.filter((letter) => {
      if (letter.organizationId === selected.id) return true;
      const record = workspace.letterRecords[letter.id];
      return record?.organizationId === selected.id;
    });
  }, [letters, selected, workspace.letterRecords]);

  const orgContacts = useMemo(() => {
    if (!selected) return [];
    return contacts
      .filter((contact) => contact.organizationId === selected.id)
      .map((contact) => {
        const detail = workspace.contactDetails[contact.id];
        return {
          ...contact,
          email: contact.email ?? detail?.email ?? null,
          title: contact.title ?? detail?.title ?? null,
          avatarSrc: contactAvatarSrc[contact.id] ?? null,
        } satisfies ContactListItem;
      })
      .sort((left, right) =>
        (left.name || "").localeCompare(right.name || "", undefined, {
          sensitivity: "base",
        }),
      );
  }, [contactAvatarSrc, contacts, selected, workspace.contactDetails]);

  const overviewOrganizations = useMemo((): OrganizationListItem[] => {
    const mapped = organizations.map((org) => ({
      ...org,
      avatarSrc: organizationAvatarSrc[org.id] ?? org.avatarSrc ?? null,
    }));
    if (!selectedGroupId) return mapped;
    return mapped.filter((org) =>
      groupMembers.organizationIds.has(org.id),
    );
  }, [
    groupMembers.organizationIds,
    organizationAvatarSrc,
    organizations,
    selectedGroupId,
  ]);

  const openOrganization = useCallback(
    (organization: OrganizationListItem) => {
      const routeParam = getUniqueListItemRouteParam(
        organization,
        organizations,
      );
      navigate(
        getOrganizationOverlayHref(routeParam, { groupId: selectedGroupId }),
      );
    },
    [navigate, organizations, selectedGroupId],
  );

  const createAndOpenOrganization = useCallback(() => {
    void workspace
      .createOrganization({ name: "New organization" })
      .then(async (created) => {
        if (selectedGroupId) {
          try {
            await addCrmGroupMemberWithRetry(client, powerSync, {
              groupId: selectedGroupId,
              subjectType: "organization",
              subjectId: created.id,
            });
            notifyCrmGroupsChanged();
          } catch (error) {
            console.warn(
              "[desktop] assign organization to group failed",
              error,
            );
          }
        }
        setPinnedOrganizationId(created.id);
        navigate(
          getOrganizationOverlayHref(
            getUniqueListItemRouteParam(created, [
              ...organizations,
              {
                id: created.id,
                key: created.key,
                number: created.number,
              },
            ]),
            { groupId: selectedGroupId },
          ),
        );
      })
      .catch((error) => {
        console.warn("[desktop] create organization failed", error);
      });
  }, [
    client,
    navigate,
    organizations,
    powerSync,
    selectedGroupId,
    workspace,
  ]);

  const expandOverlay = useCallback(() => {
    if (!selectedSlugValue) return;
    if (overlayLayout === "page") return;
    setDetailCollapsed(false);
    const token = ++expandAnimTokenRef.current;
    pendingListFadeInRef.current = false;
    pendingWorkspaceFadeInRef.current = true;
    setListFaded(true);
    if (expandAnimTimerRef.current != null) {
      window.clearTimeout(expandAnimTimerRef.current);
    }
    expandAnimTimerRef.current = window.setTimeout(() => {
      expandAnimTimerRef.current = null;
      if (expandAnimTokenRef.current !== token) return;
      setWorkspaceFaded(true);
      navigate(
        getOrganizationOverlayHref(selectedSlugValue, {
          section: cardSection === "overview" ? undefined : cardSection,
          layout: "page",
          groupId: selectedGroupId,
        }),
        { replace: true },
      );
    }, ORGANIZATION_DETAIL_EXPAND_FADE_MS);
  }, [cardSection, navigate, overlayLayout, selectedGroupId, selectedSlugValue]);

  const collapseOverlay = useCallback(() => {
    if (!selectedSlugValue) return;
    setDetailCollapsed(false);
    if (overlayLayout !== "page") {
      navigate(
        getOrganizationOverlayHref(selectedSlugValue, {
          section: cardSection === "overview" ? undefined : cardSection,
          layout: "panel",
          groupId: selectedGroupId,
        }),
        { replace: true },
      );
      return;
    }
    const token = ++expandAnimTokenRef.current;
    pendingWorkspaceFadeInRef.current = false;
    pendingListFadeInRef.current = true;
    setWorkspaceFaded(true);
    if (expandAnimTimerRef.current != null) {
      window.clearTimeout(expandAnimTimerRef.current);
    }
    expandAnimTimerRef.current = window.setTimeout(() => {
      expandAnimTimerRef.current = null;
      if (expandAnimTokenRef.current !== token) return;
      setListFaded(true);
      navigate(
        getOrganizationOverlayHref(selectedSlugValue, {
          section: cardSection === "overview" ? undefined : cardSection,
          layout: "panel",
          groupId: selectedGroupId,
        }),
        { replace: true },
      );
    }, ORGANIZATION_DETAIL_EXPAND_FADE_MS);
  }, [cardSection, navigate, overlayLayout, selectedGroupId, selectedSlugValue]);

  // After expand navigates to page: fade workspace in.
  useLayoutEffect(() => {
    if (overlayLayout !== "page") return;
    if (!pendingWorkspaceFadeInRef.current) {
      setListFaded(true);
      return;
    }
    pendingWorkspaceFadeInRef.current = false;
    setWorkspaceFaded(true);
    setListFaded(true);
    const token = expandAnimTokenRef.current;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (expandAnimTokenRef.current !== token) return;
        setWorkspaceFaded(false);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [overlayLayout]);

  // After collapse navigates to panel: fade list back in.
  // Direct leave from page (breadcrumb / Escape) skips the pending flag — still
  // restore the catalog so it is not left at opacity 0.
  useLayoutEffect(() => {
    if (overlayLayout !== "panel") return;
    if (!pendingListFadeInRef.current) {
      if (!selected) {
        setListFaded(false);
        setWorkspaceFaded(false);
      }
      return;
    }
    pendingListFadeInRef.current = false;
    setListFaded(true);
    setWorkspaceFaded(false);
    const token = expandAnimTokenRef.current;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (expandAnimTokenRef.current !== token) return;
        setListFaded(false);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [overlayLayout, selected]);

  useEffect(() => {
    return () => {
      if (expandAnimTimerRef.current != null) {
        window.clearTimeout(expandAnimTimerRef.current);
      }
    };
  }, []);

  const beginDetailCollapseAnimation = useCallback((apply: () => void) => {
    setDetailCollapseAnimating(true);
    if (detailCollapseAnimTimerRef.current != null) {
      window.clearTimeout(detailCollapseAnimTimerRef.current);
      detailCollapseAnimTimerRef.current = null;
    }
    if (detailCollapseRafRef.current != null) {
      window.cancelAnimationFrame(detailCollapseRafRef.current);
      detailCollapseRafRef.current = null;
    }
    // Enable transition for one paint, then flip collapsed so width interpolates.
    detailCollapseRafRef.current = window.requestAnimationFrame(() => {
      detailCollapseRafRef.current = window.requestAnimationFrame(() => {
        detailCollapseRafRef.current = null;
        apply();
        detailCollapseAnimTimerRef.current = window.setTimeout(() => {
          detailCollapseAnimTimerRef.current = null;
          setDetailCollapseAnimating(false);
        }, ORGANIZATION_DETAIL_COLLAPSE_DURATION_MS);
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (detailCollapseAnimTimerRef.current != null) {
        window.clearTimeout(detailCollapseAnimTimerRef.current);
      }
      if (detailCollapseRafRef.current != null) {
        window.cancelAnimationFrame(detailCollapseRafRef.current);
      }
      if (detailCloseNavTimerRef.current != null) {
        window.clearTimeout(detailCloseNavTimerRef.current);
      }
    };
  }, []);

  const hideDetail = useCallback(() => {
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(true);
    });
  }, [beginDetailCollapseAnimation]);

  const showDetail = useCallback(() => {
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(false);
    });
  }, [beginDetailCollapseAnimation]);

  const closeOverlay = useCallback(() => {
    if (detailCloseNavTimerRef.current != null) {
      window.clearTimeout(detailCloseNavTimerRef.current);
      detailCloseNavTimerRef.current = null;
    }

    const leave = () => {
      expandAnimTokenRef.current += 1;
      pendingListFadeInRef.current = false;
      pendingWorkspaceFadeInRef.current = false;
      if (expandAnimTimerRef.current != null) {
        window.clearTimeout(expandAnimTimerRef.current);
        expandAnimTimerRef.current = null;
      }
      setListFaded(false);
      setWorkspaceFaded(false);
      setDetailCollapsed(false);
      navigate(getOrganizationsGroupHref(selectedGroupId), { replace: true });
    };

    // Already on the reopen strip — leave immediately.
    if (detailCollapsedRef.current) {
      leave();
      return;
    }

    // Slide closed, then navigate so Escape matches `]` hide animation.
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(true);
    });
    detailCloseNavTimerRef.current = window.setTimeout(() => {
      detailCloseNavTimerRef.current = null;
      leave();
    }, ORGANIZATION_DETAIL_COLLAPSE_DURATION_MS);
  }, [beginDetailCollapseAnimation, navigate, selectedGroupId]);

  // Selecting an organization while the reopen strip is showing should NOT
  // slide the panel open — stay collapsed. First open (no prior selection)
  // uses the overlay enter slide; switching while expanded fades content.
  const prevSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevSelectedIdRef.current;
    prevSelectedIdRef.current = selected?.id ?? null;

    if (!selected?.id) {
      setDetailCollapsed(false);
      return;
    }
    // Switching organizations while the strip is showing: keep the strip.
    if (detailCollapsed && prevId != null) return;
  }, [selected?.id, detailCollapsed]);

  // Opacity crossfade when switching organizations while the panel is open.
  // useLayoutEffect so fade-out starts before paint (no flash of new chrome).
  useLayoutEffect(() => {
    const nextId = selected?.id ?? null;
    if (nextId === panelOrganizationId) return;

    // Route can briefly miss a match while keep-alive href flips — keep the
    // current card mounted so we don't abort mid-fade / remount the rail.
    if (nextId == null) return;

    const canFade =
      panelOrganizationId != null && !detailCollapsed && !detailCollapseAnimating;

    if (!canFade) {
      contentFadeTokenRef.current += 1;
      setPanelOrganizationId(nextId);
      setContentFaded(false);
      return;
    }

    const token = ++contentFadeTokenRef.current;
    setContentFaded(true);
    const timer = window.setTimeout(() => {
      if (contentFadeTokenRef.current !== token) return;
      setPanelOrganizationId(nextId);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (contentFadeTokenRef.current !== token) return;
          setContentFaded(false);
        });
      });
    }, ORGANIZATION_DETAIL_CONTENT_FADE_MS);

    return () => window.clearTimeout(timer);
  }, [detailCollapseAnimating, detailCollapsed, panelOrganizationId, selected?.id]);

  // Close the panel only when the route truly leaves organizations (no slug).
  useLayoutEffect(() => {
    if (routedSlug) return;
    contentFadeTokenRef.current += 1;
    expandAnimTokenRef.current += 1;
    pendingListFadeInRef.current = false;
    pendingWorkspaceFadeInRef.current = false;
    if (expandAnimTimerRef.current != null) {
      window.clearTimeout(expandAnimTimerRef.current);
      expandAnimTimerRef.current = null;
    }
    setPanelOrganizationId(null);
    setContentFaded(false);
    setListFaded(false);
    setWorkspaceFaded(false);
    setDetailCollapsed(false);
  }, [routedSlug]);

  useEffect(() => {
    if (!keepAliveActive || !selected) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!shouldHandleGlobalShortcut(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (overlayLayout === "page") {
          collapseOverlay();
        } else {
          closeOverlay();
        }
        return;
      }

      if (
        overlayLayout === "page" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        const tabIndex = parseSectionTabIndex(event.key);
        if (tabIndex != null) {
          const tab = visibleWorkspaceTabIds[tabIndex];
          if (tab) {
            if (!shouldHandleGlobalShortcut(event)) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            setWorkspaceTab(tab);
          }
          return;
        }
      }

      if (!isAgentPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      beginDetailCollapseAnimation(() => {
        setDetailCollapsed((current) => !current);
      });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    beginDetailCollapseAnimation,
    closeOverlay,
    collapseOverlay,
    keepAliveActive,
    overlayLayout,
    selected,
    visibleWorkspaceTabIds,
  ]);

  function handleSectionChange(next: OrganizationSectionId) {
    if (!selectedSlugValue || !isOrganizationCardSectionId(next)) return;
    setCardSection(next);
    navigate(
      getOrganizationOverlayHref(selectedSlugValue, {
        section: next === "overview" ? undefined : next,
        layout: overlayLayout,
        groupId: selectedGroupId,
      }),
      { replace: true },
    );
  }

  function renderSection(sectionId: OrganizationSectionId) {
    if (!selected || !selectedSlugValue) return null;
    const organization = selected;
    const organizationSlug = selectedSlugValue;

    if (sectionId === "projects") {
      return (
        <ProjectsOverviewView
          projects={orgProjects}
          workingProjectIds={workingProjectIds}
          nestedAreas={workspace.areas.map((area) => ({
            id: area.id,
            name: area.name,
            parent:
              area.parent === "personal" ||
              area.parent === "business" ||
              area.parent === "clients"
                ? area.parent
                : null,
            sortOrder: area.sortOrder,
          }))}
          showAreaFilters={false}
          emptyMessage="No projects linked to this organization."
          view={orgProjectsListView}
          onViewChange={(nextView: ListBoardView) => {
            persistListBoardView(nextView, PROJECTS_LIST_BOARD_STORAGE_KEY);
            navigate(
              buildOrganizationProjectsHref(organizationSlug, {
                view: nextView,
              }),
            );
          }}
          onSelectProject={(key) => {
            const match = projects.find(
              (entry) => entry.key.toLowerCase() === key.toLowerCase(),
            );
            const href = getOrganizationProjectHref(organizationSlug, key);
            if (match?.name) primeTabTitle(href, match.name);
            const state: ProjectLocationState | undefined = match?.type
              ? { projectType: match.type }
              : undefined;
            navigate(href, state ? { state } : undefined);
          }}
          onStatusChange={(projectId, status: ProjectStatus) => {
            void workspace.patchProject(projectId, { status });
          }}
          onPriorityChange={(projectId, priority) => {
            void workspace.patchProject(projectId, { priority });
          }}
          onStartDateChange={(projectId, startDate) => {
            void workspace.patchProject(projectId, {
              startDate: startDate ? startDate.toISOString() : null,
            });
          }}
          onDueDateChange={(projectId, dueDate) => {
            void workspace.patchProject(projectId, {
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onCreateProject={async ({ status, name }) => {
            return workspace.createProject({
              name,
              status,
              organizationId: organization.id,
            });
          }}
          onCreatedProject={(id, key) => {
            if (!key) return;
            const href = getOrganizationProjectHref(organizationSlug, key);
            const match =
              projects.find((entry) => entry.id === id) ??
              projects.find(
                (entry) => entry.key.toLowerCase() === key.toLowerCase(),
              );
            if (match?.name) primeTabTitle(href, match.name);
            navigate(href);
          }}
          onReorder={(request) => {
            const patches = projectReorderPatches(orgProjects, request);
            for (const patch of patches) {
              void workspace.patchProject(patch.id, {
                status: patch.status,
                sortOrder: patch.sortOrder,
              });
            }
          }}
        />
      );
    }

    if (sectionId === "letters") {
      return (
        <ScopedLettersListView
          letters={orgLetters}
          onSelectLetter={(letter) =>
            navigate(
              resolveScopedLetterDetailHref(letter, {
                kind: "organization",
                organizationRouteParam: organizationSlug,
              }),
            )
          }
          onStatusChange={(letterId, status: TaskStatus) => {
            void workspace.patchLetter(letterId, { status });
          }}
          onDueDateChange={(letterId, dueDate) => {
            void workspace.patchLetter(letterId, {
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onCompose={(status) => {
            const params = new URLSearchParams({
              organizationId: organization.id,
              status,
            });
            navigate(`/letters/new?${params.toString()}`);
          }}
        />
      );
    }

    if (sectionId === "contacts") {
      return (
        <OrganizationContactsListView
          contacts={orgContacts}
          onSelectContact={(contact) =>
            navigate(getOrganizationContactHref(organizationSlug, contact))
          }
        />
      );
    }

    if (sectionId === "transactions") {
      return (
        <div className="organization-detail__finance-section">
          <OrganizationTransactionsSection
            transactions={orgTransactions}
            loading={orgTransactionsLoading}
            categories={financeCategories}
            accounts={financeAccounts}
            accountAvatarSrcById={accountAvatarSrcById}
            organizations={organizations}
            projects={projects}
            goals={financeGoals}
            recurrings={financeRecurrings}
            emptyLabel="No transactions linked to this organization."
            onPatchTransaction={(id, patch) => {
              void patchOrgTransaction(id, patch);
            }}
            onBulkPatchTransactions={(ids, patch) => {
              void bulkPatchOrgTransactions(ids, patch);
            }}
            onCreateOrganizationFromQuery={(query) =>
              workspace.createOrganization({ name: query })
            }
          />
        </div>
      );
    }

    if (sectionId === "invoices") {
      return (
        <div className="organization-detail__finance-section">
          <FinanceInvoicesView
            embedded
            hideOrganizationFilter
            invoices={orgInvoices}
            loading={orgInvoicesLoading}
            error={orgInvoicesError}
            connected={orgInvoicesConnected}
            page={orgInvoicesPage}
            totalPages={orgInvoicesTotalPages}
            hasMore={orgInvoicesHasMore}
            onPageChange={setOrgInvoicesPage}
            year={orgInvoicesYear}
            latestYear={localCalendarYear()}
            onYearChange={(nextYear) => {
              setOrgInvoicesYear(nextYear);
              setOrgInvoicesPage(1);
            }}
            filterStatusIds={orgInvoiceStatusIds}
            onFilterStatusIdsChange={(values) => {
              setOrgInvoiceStatusIds(values);
              setOrgInvoicesPage(1);
            }}
            organizations={orgListItem ? [orgListItem] : []}
            selectedInvoiceId={selectedOrgInvoiceId}
            onSelectedInvoiceChange={setSelectedOrgInvoiceId}
            invoiceDetail={orgInvoiceDetail}
            invoiceDetailLoading={orgInvoiceDetailLoading}
            invoiceDetailError={orgInvoiceDetailError}
          />
        </div>
      );
    }

    return null;
  }

  function renderOrganizationDetail() {
    const organization = panelOrganization ?? selected;
    if (!organization) return null;
    const syncedAvatarSrc = organizationAvatarSrc[organization.id] ?? null;
    const avatarSrc =
      avatarOverride !== undefined ? avatarOverride : syncedAvatarSrc;

    return (
      <OrganizationDetailView
        organization={{
          id: organization.id,
          name: organization.name,
          key: organization.key,
          number: organization.number,
          displayId:
            organization.number != null
              ? `O-${organization.number}`
              : organization.key ?? null,
          phone: details?.phone ?? null,
          email: details?.email ?? null,
          emails: coerceOrganizationEmailEntries(details?.emails),
          phones: coerceOrganizationPhoneEntries(details?.phones),
          website: details?.website ?? null,
          address: details?.address ?? null,
          city: details?.city ?? null,
          postalCode: details?.postalCode ?? null,
          country: details?.country ?? null,
          region: details?.region ?? null,
          latitude: organizationLatitude,
          longitude: organizationLongitude,
          summary: details?.summary ?? null,
          size: details?.size ?? null,
          socialAccounts: normalizeContactSocialAccounts(
            details?.socialAccounts,
          ),
          chamberOfCommerce,
          taxNumber,
          moneybirdContactId: details?.moneybirdContactId ?? moneybirdContactId,
        }}
        sections={ORGANIZATION_CARD_SECTIONS}
        section={profileSection}
        onSectionChange={handleSectionChange}
        onMore={expandOverlay}
        renderSection={renderSection}
        moneybirdHref={moneybirdHref}
        mapImageSrc={mapImageSrc}
        mapLoading={mapLoading}
        mapHint={mapHint}
        onAfterLocationSave={(parts) => {
          geocodeAttemptKeyRef.current = null;
          void resolveOrganizationLocation(organization.id, parts);
        }}
        activitySlot={
          <CrmActivityFeedView
            items={activityFeed.items}
            loading={activityFeed.loading}
            error={activityFeed.error}
            nextCursor={activityFeed.nextCursor}
            onLoadMore={activityFeed.loadMore}
            onSubmitNote={activityFeed.submitNote}
            onOpenMeeting={(meetingId) =>
              navigate(`/calendar/meetings/${encodeURIComponent(meetingId)}`)
            }
          />
        }
        groupOptions={groupOptions}
        memberGroupIds={memberGroupIds}
        onMemberGroupIdsChange={handleMemberGroupIdsChange}
        overviewHeaderAccessory={
          <AvatarUpload
            displayName={organization.name}
            avatarSrc={avatarSrc}
            showHint={false}
            onUpload={async (file) => {
              const result = await uploadDesktopAvatar(
                client,
                "organization",
                organization.id,
                file,
              );
              if (result.ok) {
                const url = URL.createObjectURL(file);
                setAvatarOverride((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return url;
                });
              }
              return result;
            }}
            onRemove={async () => {
              const result = await removeDesktopAvatar(
                client,
                "organization",
                organization.id,
              );
              if (result.ok) {
                setAvatarOverride((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return null;
                });
              }
              return result;
            }}
          />
        }
        onSaveName={(name) => {
          void workspace.patchOrganization(organization.id, { name });
          return { ok: true };
        }}
        onSaveDetails={(patch: OrganizationOverviewDetails) => {
          void workspace.patchOrganization(organization.id, patch);
        }}
      />
    );
  }

  const organizationTabTitle = selected?.name ?? "Organizations";
  const organizationTabAvatarSrc = selected
    ? (avatarOverride !== undefined
        ? avatarOverride
        : (organizationAvatarSrc[selected.id] ?? null))
    : null;

  // Standalone list + resizable right detail rail (hide/show with ]).
  // Only treat as "not found" when the slug matches nothing and we aren't
  // still showing a lagged panel organization (switch fade / brief resolve miss).
  if (routedSlug && !selected && !panelOrganization) {
    return (
      <div
        className="organizations-page journal-day-layout desktop-journal-day-layout"
        data-content-detail
        data-detail-split
      >
        <div className="journal-day-layout__main">
          <OrganizationsOverviewView
            organizations={overviewOrganizations}
            emptyMessage={
              selectedGroupId
                ? "No organizations in this group yet."
                : "No organizations yet."
            }
            pinnedOrganizationId={pinnedOrganizationId}
            onSelect={(organization) => openOrganization(organization)}
            onAdd={createAndOpenOrganization}
          />
        </div>
        <EntityDetailLayout
          sectionLabel="Organizations"
          title={null}
          emptyMessage="Organization not found."
        />
      </div>
    );
  }

  const panelOpen = Boolean(panelOrganization ?? selected);

  // List is only covered during expanded page layout (or the expand fade-out
  // while the overlay is still open). Never keep the catalog invisible after
  // breadcrumb / Escape leave the overlay — that matched a stuck `listFaded`.
  const listExpandFaded = listFaded && panelOpen;

  return (
    <div
      className={[
        "organizations-page",
        "journal-day-layout",
        "desktop-journal-day-layout",
        panelOpen && detailCollapsed ? "is-calendar-collapsed" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-content-detail
      data-detail-split
      data-calendar-collapsed={
        panelOpen && detailCollapsed ? "true" : "false"
      }
    >
      {keepAliveActive && selected ? (
        <>
          <RegisterPageTitle
            active={keepAliveActive}
            href={location.pathname}
            title={
              overlayLayout === "page" ? organizationTabTitle : "Organizations"
            }
          />
          <RegisterPageIcon
            active={keepAliveActive}
            href={location.pathname}
            icon={overlayLayout === "page" ? organizationTabAvatarSrc : null}
          />
          {activeSection === "overview" ? (
            <RegisterEntityDeleteAction
              entityLabel={`organization "${selected.name}"`}
              onDelete={handleDeleteOrganization}
            />
          ) : null}
        </>
      ) : keepAliveActive ? (
        <>
          <RegisterPageTitle
            active={keepAliveActive}
            href={location.pathname}
            title="Organizations"
          />
          <RegisterPageIcon
            active={keepAliveActive}
            href={location.pathname}
            icon={null}
          />
        </>
      ) : null}

      <div
        className={[
          "journal-day-layout__main",
          listExpandFaded ? "is-expand-faded" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <OrganizationsOverviewView
          organizations={overviewOrganizations}
          emptyMessage={
            selectedGroupId
              ? "No organizations in this group yet."
              : "No organizations yet."
          }
          selectedId={selected?.id ?? null}
          pinnedOrganizationId={pinnedOrganizationId}
          onSelect={(organization) => openOrganization(organization)}
          onAdd={createAndOpenOrganization}
        />
      </div>

      <OrganizationDetailOverlay
        open={panelOpen}
        collapsed={detailCollapsed}
        collapseAnimating={detailCollapseAnimating}
        contentFaded={contentFaded}
        workspaceFaded={workspaceFaded}
        overlayLayout={overlayLayout}
        title={panelOrganization?.name ?? selected?.name ?? "Organization"}
        onExpand={expandOverlay}
        onCollapse={collapseOverlay}
        onHide={hideDetail}
        onShow={showDetail}
        workspaceTabs={visibleWorkspaceTabs}
        workspaceTab={workspaceTab}
        onWorkspaceTabChange={setWorkspaceTab}
        renderWorkspaceTab={(tab) => renderSection(tab)}
      >
        {renderOrganizationDetail()}
      </OrganizationDetailOverlay>
    </div>
  );
}
