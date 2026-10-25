import type {
  BankAccount,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
  FinancialTransaction,
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
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  AvatarUpload,
  buildMoneybirdContactInvoicesFilter,
  buildMoneybirdInvoicesFilter,
  CommunicationChatView,
  CrmActivityFeedView,
  EntityCommunicationListView,
  EntityDetailLayout,
  FinanceInvoicesView,
  normalizeContactSocialAccounts,
  OrganizationContactsListView,
  OrganizationDetailOverlay,
  OrganizationDetailView,
  OrganizationTransactionsSection,
  OrganizationsOverviewView,
  getEmailDetailHref,
  ORGANIZATION_CARD_SECTIONS,
  ORGANIZATION_DETAIL_COLLAPSE_DURATION_MS,
  ORGANIZATION_DETAIL_CONTENT_FADE_MS,
  ORGANIZATION_DETAIL_EXPAND_FADE_MS,
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
  asCoord,
  parseCrmGroupId,
  resolveCrmGroupRedirect,
  parseListBoardViewFromLocation,
  parseOrganizationOverlayLayout,
  parseOrganizationSectionId,
  parseSectionTabIndex,
  persistListBoardView,
  primeTabTitle,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  resolveListItemFromSlug,
  resolveOrganizationAvatarSrc,
  resolveOrganizationWorkspaceTabs,
  shouldHandleGlobalShortcut,
  type ContactListItem,
  type ListBoardView,
  type OrganizationExpandedWorkspaceTabId,
  type OrganizationListItem,
  type OrganizationOverlayLayout,
  type OrganizationSectionId,
  type ProjectStatus,
  type TaskStatus,
  projectReorderPatches,
  mapWorkspaceNestedAreas,
} from "@backsteros/ui";

import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";
import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import { getBrandfetchClientId } from "../lib/brandfetch";
import {
  useCrmActivityFeed,
  useCrmGroupOrganizationIds,
  useCrmGroupsCatalog,
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
import { useOrganizationPropertyHandlers } from "../lib/crm/use-crm-property-handlers";
import { useCrmSubjectGroupMembership } from "../lib/crm/use-crm-subject-group-membership";
import { useEntityDetailOverlayTransition } from "../lib/crm/use-entity-detail-overlay-transition";
import { useMapboxEntityLocation } from "../lib/crm/use-mapbox-entity-location";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { type ProjectLocationState } from "../lib/project-type-cache";
import { buildWorkingProjectIdSet } from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import { useChatInbox } from "../lib/chat/use-chat-inbox";
import { filterCommunicationForOrganization } from "../lib/communication/filter-entity-communication";
import { useCommunicationListItems } from "../lib/communication/use-communication-list-items";
import { navigateToHref } from "../router/navigate-href";
import {
  OrganizationWorkspaceTabPanel,
  type OrganizationProjectsTabHandlers,
} from "./organizations/organization-workspace-tab-panel";

const ORGANIZATION_DETAIL_OVERLAY_DURATIONS = {
  expandFadeMs: ORGANIZATION_DETAIL_EXPAND_FADE_MS,
  collapseMs: ORGANIZATION_DETAIL_COLLAPSE_DURATION_MS,
  contentFadeMs: ORGANIZATION_DETAIL_CONTENT_FADE_MS,
};

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
  const communicationItems = useCommunicationListItems();
  const [workspaceChatId, setWorkspaceChatId] = useState<string | null>(null);
  const chatInbox = useChatInbox({
    enabled: keepAliveActive,
    channelFocused: keepAliveActive && Boolean(workspaceChatId),
  });
  const selectChatConversation = chatInbox.selectConversation;
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
  const effectiveGroupId = groupsCatalog.resolveGroupId(selectedGroupId);
  const groupMembers = useCrmGroupOrganizationIds(
    effectiveGroupId,
    keepAliveActive && Boolean(effectiveGroupId),
  );
  const selectedGroupName = effectiveGroupId
    ? (groupsCatalog.groups.find((group) => group.id === effectiveGroupId)
        ?.name ?? null)
    : null;

  useEffect(() => {
    const redirectId = resolveCrmGroupRedirect(
      selectedGroupId,
      effectiveGroupId,
    );
    if (redirectId) {
      navigate(getOrganizationsGroupHref(redirectId), { replace: true });
    }
  }, [effectiveGroupId, navigate, selectedGroupId]);

  const {
    detailCollapsed,
    setDetailCollapsed,
    detailCollapseAnimating,
    panelEntityId: panelOrganizationId,
    contentFaded,
    listFaded,
    workspaceFaded,
    expandOverlay: expandEntityOverlay,
    collapseOverlay: collapseEntityOverlay,
    hideDetail,
    showDetail,
    toggleDetail,
    closeOverlay: closeEntityOverlay,
  } = useEntityDetailOverlayTransition({
    overlayLayout,
    selectedId: selected?.id ?? null,
    routeHasSelection: Boolean(routedSlug),
    navigate,
    durations: ORGANIZATION_DETAIL_OVERLAY_DURATIONS,
  });
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

  const [moneybirdAdministrationId, setMoneybirdAdministrationId] = useState<
    string | null
  >(null);
  const [moneybirdCompanyFields, setMoneybirdCompanyFields] = useState<{
    chamberOfCommerce: string | null;
    taxNumber: string | null;
  } | null>(null);
  const moneybirdSyncKeyRef = useRef<string | null>(null);
  const patchOrganization = workspace.patchOrganization;

  const organizationLatitude = asCoord(details?.latitude);
  const organizationLongitude = asCoord(details?.longitude);
  const organizationDetails = workspace.organizationDetails;
  const organizationDetailsRef = useRef(organizationDetails);
  organizationDetailsRef.current = organizationDetails;
  const {
    mapImageSrc,
    mapLoading,
    mapHint,
    resolveLocation: resolveOrganizationLocation,
  } = useMapboxEntityLocation({
    active: keepAliveActive,
    entityId: panelOrganizationId,
    address: details
      ? {
          address: details.address ?? null,
          city: details.city ?? null,
          postalCode: details.postalCode ?? null,
          region: details.region ?? null,
          country: details.country ?? null,
        }
      : null,
    latitude: organizationLatitude,
    longitude: organizationLongitude,
    readCoordinates: (organizationId) =>
      organizationDetailsRef.current[organizationId],
    patchCoordinates: (organizationId, coordinates) =>
      patchOrganization(organizationId, coordinates),
    autoGeocodeMissingCoordinates: true,
  });
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
  const {
    groupOptions,
    memberGroupIds,
    onMemberGroupIdsChange: handleMemberGroupIdsChange,
  } = useCrmSubjectGroupMembership({
    subjectType: "organization",
    subjectId: panelOrganizationId,
    enabled: keepAliveActive && Boolean(panelOrganizationId),
    notOnServerMessage:
      "This organization isn’t on the server yet, so it can’t join a group. Wait for sync or re-save it, then try again.",
  });

  useEffect(() => {
    if (!keepAliveActive) return;
    let cancelled = false;
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
    moneybirdSyncKeyRef.current = null;
  }, [panelOrganizationId]);

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
        // Pull CoC / VAT from Moneybird only when present — never blank local
        // fields just because Moneybird left them empty.
        if (
          nextChamber &&
          (current?.chamberOfCommerce ?? null) !== nextChamber
        ) {
          patch.chamberOfCommerce = nextChamber;
        }
        if (nextTax && (current?.taxNumber ?? null) !== nextTax) {
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
  // (`/projects`, `/contacts`, `/letters`, `/emails`, `/transactions`,
  // `/invoices`) → expanded overlay layout with the matching workspace tab.
  useEffect(() => {
    if (!keepAliveActive) return;
    if (!selected || !sectionParam || !selectedSlugValue) return;
    if (
      sectionParam === "projects" ||
      sectionParam === "contacts" ||
      sectionParam === "letters" ||
      sectionParam === "emails" ||
      sectionParam === "transactions" ||
      sectionParam === "invoices"
    ) {
      setWorkspaceTab(sectionParam);
      setDetailCollapsed(false);
      navigate(
        getOrganizationOverlayHref(selectedSlugValue, {
          layout: "page",
          groupId: effectiveGroupId,
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
    effectiveGroupId,
    keepAliveActive,
    navigate,
    sectionParam,
    selected,
    selectedGroupId,
    selectedSlugValue,
    setDetailCollapsed,
  ]);

  useDesktopSectionBreadcrumb(
    selected
      ? [
          {
            label: "Organizations",
            href: getOrganizationsGroupHref(effectiveGroupId),
          },
          {
            label: selected.name,
            href:
              profileSection === "overview" || !selectedSlugValue
                ? undefined
                : getOrganizationOverlayHref(selectedSlugValue, {
                    layout: overlayLayout,
                    groupId: effectiveGroupId,
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
      navigate(getOrganizationsGroupHref(effectiveGroupId), { replace: true });
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
  }, [effectiveGroupId, navigate, selected, workspace]);

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

  const orgContactIds = useMemo(
    () => new Set(orgContacts.map((contact) => contact.id)),
    [orgContacts],
  );

  const orgCommunication = useMemo(() => {
    if (!selected) {
      return {
        emails: [] as const,
        supportTasks: [] as const,
        conversations: [] as const,
      };
    }
    return filterCommunicationForOrganization({
      organizationId: selected.id,
      contactIds: orgContactIds,
      items: keepAliveFrozen ? [] : communicationItems,
      conversations: keepAliveFrozen ? [] : chatInbox.conversations,
      contacts: orgContacts.map((contact) => {
        const detail = workspace.contactDetails[contact.id];
        return {
          id: contact.id,
          email: contact.email ?? detail?.email ?? null,
          emails: detail?.emails ?? contact.emails,
          phone: contact.phone ?? detail?.phone ?? null,
          phones: detail?.phones ?? contact.phones ?? [],
        };
      }),
    });
  }, [
    chatInbox.conversations,
    communicationItems,
    keepAliveFrozen,
    orgContactIds,
    orgContacts,
    selected,
    workspace.contactDetails,
  ]);

  useEffect(() => {
    setWorkspaceChatId(null);
  }, [selected?.id]);

  const overviewOrganizations = useMemo((): OrganizationListItem[] => {
    const clientId = getBrandfetchClientId();
    const mapped = organizations.map((org) => {
      const detailsWebsite =
        workspace.organizationDetails[org.id]?.website ?? org.website;
      return {
        ...org,
        website: detailsWebsite ?? org.website ?? null,
        avatarSrc: resolveOrganizationAvatarSrc({
          uploadedSrc: organizationAvatarSrc[org.id] ?? org.avatarSrc ?? null,
          avatarStorageKey: org.avatarStorageKey,
          website: detailsWebsite ?? org.website,
          brandfetchClientId: clientId,
        }),
      };
    });
    if (!effectiveGroupId) return mapped;
    return mapped.filter((org) =>
      groupMembers.organizationIds.has(org.id),
    );
  }, [
    effectiveGroupId,
    groupMembers.organizationIds,
    organizationAvatarSrc,
    organizations,
    workspace.organizationDetails,
  ]);

  const openOrganization = useCallback(
    (organization: OrganizationListItem) => {
      const routeParam = getUniqueListItemRouteParam(
        organization,
        organizations,
      );
      navigate(
        getOrganizationOverlayHref(routeParam, { groupId: effectiveGroupId }),
      );
    },
    [effectiveGroupId, navigate, organizations],
  );

  const createAndOpenOrganization = useCallback(() => {
    void workspace
      .createOrganization({ name: "New organization" })
      .then(async (created) => {
        if (effectiveGroupId) {
          try {
            await addCrmGroupMemberWithRetry(client, powerSync, {
              groupId: effectiveGroupId,
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
            { groupId: effectiveGroupId },
          ),
        );
      })
      .catch((error) => {
        console.warn("[desktop] create organization failed", error);
      });
  }, [client, effectiveGroupId, navigate, organizations, powerSync, workspace]);

  const overlayHref = useCallback(
    (layout: OrganizationOverlayLayout) =>
      selectedSlugValue
        ? getOrganizationOverlayHref(selectedSlugValue, {
            section: cardSection === "overview" ? undefined : cardSection,
            layout,
            groupId: effectiveGroupId,
          })
        : null,
    [cardSection, effectiveGroupId, selectedSlugValue],
  );

  const expandOverlay = useCallback(() => {
    const href = overlayHref("page");
    if (href) expandEntityOverlay(href);
  }, [expandEntityOverlay, overlayHref]);

  const collapseOverlay = useCallback(() => {
    const href = overlayHref("panel");
    if (href) collapseEntityOverlay(href);
  }, [collapseEntityOverlay, overlayHref]);

  const closeOverlay = useCallback(() => {
    closeEntityOverlay(getOrganizationsGroupHref(effectiveGroupId));
  }, [closeEntityOverlay, effectiveGroupId]);

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
            setWorkspaceChatId(null);
            selectChatConversation(null);
          }
          return;
        }
      }

      if (!isAgentPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleDetail();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    toggleDetail,
    closeOverlay,
    collapseOverlay,
    keepAliveActive,
    overlayLayout,
    selectChatConversation,
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
        groupId: effectiveGroupId,
      }),
      { replace: true },
    );
  }

  const nestedAreas = useMemo(
    () => mapWorkspaceNestedAreas(workspace.areas),
    [workspace.areas],
  );
  const projectsTabContext = {
    organizationId: selected?.id ?? null,
    organizationSlug: selectedSlugValue,
    orgProjects,
    projects,
    navigate,
    patchProject: workspace.patchProject,
    createProject: workspace.createProject,
    softDeleteProject: workspace.softDeleteProject,
  };
  const projectsTabContextRef = useRef(projectsTabContext);
  projectsTabContextRef.current = projectsTabContext;
  const projectsTabHandlers = useMemo<OrganizationProjectsTabHandlers>(() => {
    const read = () => projectsTabContextRef.current;
    const patchProject = (projectId: string, patch: Record<string, unknown>) => {
      void read().patchProject(projectId, patch);
    };
    return {
      onViewChange: (nextView: ListBoardView) => {
        const { organizationSlug, navigate } = read();
        persistListBoardView(nextView, PROJECTS_LIST_BOARD_STORAGE_KEY);
        if (!organizationSlug) return;
        navigate(
          buildOrganizationProjectsHref(organizationSlug, { view: nextView }),
        );
      },
      onSelectProject: (key) => {
        const { organizationSlug, projects, navigate } = read();
        if (!organizationSlug) return;
        const match = projects.find(
          (entry) => entry.key.toLowerCase() === key.toLowerCase(),
        );
        const href = getOrganizationProjectHref(organizationSlug, key);
        if (match?.name) primeTabTitle(href, match.name);
        const state: ProjectLocationState | undefined = match?.type
          ? { projectType: match.type }
          : undefined;
        navigate(href, state ? { state } : undefined);
      },
      onStatusChange: (projectId, status: ProjectStatus) => {
        patchProject(projectId, { status });
      },
      onPriorityChange: (projectId, priority) => {
        patchProject(projectId, { priority });
      },
      onStartDateChange: (projectId, startDate) => {
        patchProject(projectId, {
          startDate: startDate ? startDate.toISOString() : null,
        });
      },
      onDueDateChange: (projectId, dueDate) => {
        patchProject(projectId, {
          dueDate: dueDate ? dueDate.toISOString() : null,
        });
      },
      onProjectAreaChange: (projectId, area) => {
        patchProject(projectId, { area, areaId: null });
      },
      onCreateProject: async ({ status, name }) =>
        read().createProject({
          name,
          status,
          organizationId: read().organizationId,
        }),
      onCreatedProject: (id, key) => {
        const { organizationSlug, projects, navigate } = read();
        if (!key || !organizationSlug) return;
        const href = getOrganizationProjectHref(organizationSlug, key);
        const match =
          projects.find((entry) => entry.id === id) ??
          projects.find(
            (entry) => entry.key.toLowerCase() === key.toLowerCase(),
          );
        if (match?.name) primeTabTitle(href, match.name);
        navigate(href);
      },
      onReorder: (request) => {
        for (const patch of projectReorderPatches(read().orgProjects, request)) {
          patchProject(patch.id, {
            status: patch.status,
            sortOrder: patch.sortOrder,
          });
        }
      },
      onDeleteProject: async (project) => {
        try {
          await read().softDeleteProject(project.id);
          return { ok: true as const };
        } catch (error) {
          return {
            ok: false as const,
            error:
              error instanceof Error ? error.message : "Failed to delete project.",
          };
        }
      },
    };
  }, []);

  function renderSection(sectionId: OrganizationSectionId) {
    if (!selected || !selectedSlugValue) return null;
    const organization = selected;
    const organizationSlug = selectedSlugValue;

    if (sectionId === "projects") {
      return (
        <OrganizationWorkspaceTabPanel
          projects={orgProjects}
          workingProjectIds={workingProjectIds}
          typeToFilterEnabled={keepAliveActive}
          nestedAreas={nestedAreas}
          view={orgProjectsListView}
          handlers={projectsTabHandlers}
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

    if (sectionId === "emails") {
      return (
        <EntityCommunicationListView
          conversations={orgCommunication.conversations}
          emails={orgCommunication.emails}
          supportTasks={orgCommunication.supportTasks}
          emptyHint="Chats, emails, and support tickets for this organization will show up here."
          resolveAvatarSrc={(conversation) => {
            const matched = orgContacts.find((contact) => {
              const email = conversation.contactEmail?.trim().toLowerCase();
              const phone = conversation.contactPhone?.trim();
              if (email && contact.email?.toLowerCase() === email) return true;
              if (phone && contact.phone === phone) return true;
              return false;
            });
            return matched
              ? (contactAvatarSrc[matched.id] ?? null)
              : null;
          }}
          resolveEmailAvatarSrc={(item) => {
            const contactId = item.contactId?.trim();
            if (contactId) return contactAvatarSrc[contactId] ?? null;
            return null;
          }}
          onSelectChat={(conversationId) => {
            setWorkspaceChatId(conversationId);
            void chatInbox.selectConversation(conversationId);
          }}
          onSelectEmail={(emailId) => {
            const item = orgCommunication.emails.find(
              (entry) => entry.id === emailId,
            );
            if (!item) return;
            navigate(
              getEmailDetailHref(item.inboxId, item.messageId, {
                draftId: item.draftId,
              }),
            );
          }}
          onSelectSupport={(supportId) => {
            navigate(`/tasks/${supportId}`);
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

  const organizationPropertyHandlers = useOrganizationPropertyHandlers({
    client,
    organizationId: (panelOrganization ?? selected)?.id ?? null,
    patchOrganization,
    resolveLocation: resolveOrganizationLocation,
    setAvatarOverride,
  });

  function renderOrganizationDetail() {
    const organization = panelOrganization ?? selected;
    if (!organization) return null;
    const syncedAvatarSrc = organizationAvatarSrc[organization.id] ?? null;
    // Local override: blob after upload, or null after remove (prefer Brandfetch again).
    const uploadedSrc =
      avatarOverride !== undefined ? avatarOverride : syncedAvatarSrc;
    const storedKey =
      avatarOverride === null
        ? null
        : (details?.avatarStorageKey ??
          organization.avatarStorageKey ??
          null);
    const avatarSrc = resolveOrganizationAvatarSrc({
      uploadedSrc,
      avatarStorageKey: storedKey,
      website: details?.website ?? organization.website,
      brandfetchClientId: getBrandfetchClientId(),
    });
    const canRemoveManualAvatar = Boolean(
      storedKey?.trim() ||
        (avatarOverride !== undefined && avatarOverride != null),
    );

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
        onAfterLocationSave={organizationPropertyHandlers.onAfterLocationSave}
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
            linkDot={Boolean(
              (details?.moneybirdContactId ?? moneybirdContactId)?.trim(),
            )}
            onUpload={organizationPropertyHandlers.onUploadAvatar}
            onRemove={
              canRemoveManualAvatar
                ? organizationPropertyHandlers.onRemoveAvatar
                : undefined
            }
          />
        }
        onSaveName={organizationPropertyHandlers.onSaveName}
        onSaveDetails={organizationPropertyHandlers.onSaveDetails}
      />
    );
  }

  const organizationTabTitle = selected?.name ?? "Organizations";
  const organizationTabAvatarSrc = selected
    ? resolveOrganizationAvatarSrc({
        uploadedSrc:
          avatarOverride !== undefined
            ? avatarOverride
            : (organizationAvatarSrc[selected.id] ?? null),
        avatarStorageKey:
          avatarOverride === null
            ? null
            : (workspace.organizationDetails[selected.id]?.avatarStorageKey ??
              selected.avatarStorageKey),
        website:
          workspace.organizationDetails[selected.id]?.website ??
          selected.website,
        brandfetchClientId: getBrandfetchClientId(),
      })
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
            typeToFilterEnabled={keepAliveActive}
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
          typeToFilterEnabled={keepAliveActive}
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
        hideWorkspaceTabs={Boolean(workspaceChatId)}
        workspaceTabs={visibleWorkspaceTabs}
        workspaceTab={workspaceTab}
        onWorkspaceTabChange={(tab) => {
          setWorkspaceTab(tab);
          setWorkspaceChatId(null);
          chatInbox.selectConversation(null);
        }}
        renderWorkspaceTab={(tab) => {
          if (workspaceChatId) {
            return (
              <div className="contact-communication-thread">
                <button
                  type="button"
                  className="contact-communication-thread__back"
                  onClick={() => {
                    setWorkspaceChatId(null);
                    chatInbox.selectConversation(null);
                  }}
                >
                  Back to Communication
                </button>
                <CommunicationChatView
                  pane="thread"
                  conversations={chatInbox.conversations}
                  selectedId={workspaceChatId}
                  detail={chatInbox.detail}
                  loading={chatInbox.loading}
                  detailLoading={chatInbox.detailLoading}
                  error={chatInbox.error}
                  typingIds={chatInbox.typingIds}
                  onSelect={(id) => {
                    void chatInbox.selectConversation(id);
                  }}
                  onSend={chatInbox.sendMessage}
                  onTypingChange={chatInbox.setTyping}
                  resolveAvatarSrc={(conversation) => {
                    const matched = orgContacts.find((contact) => {
                      const email = conversation.contactEmail
                        ?.trim()
                        .toLowerCase();
                      const phone = conversation.contactPhone?.trim();
                      if (email && contact.email?.toLowerCase() === email) {
                        return true;
                      }
                      if (phone && contact.phone === phone) return true;
                      return false;
                    });
                    return matched
                      ? (contactAvatarSrc[matched.id] ?? null)
                      : null;
                  }}
                />
              </div>
            );
          }
          return renderSection(tab);
        }}
      >
        {renderOrganizationDetail()}
      </OrganizationDetailOverlay>
    </div>
  );
}
