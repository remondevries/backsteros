import type {
  BankAccount,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
  FinancialTransaction,
  MoneybirdSalesInvoiceDetail,
  MoneybirdSalesInvoiceSummary,
  Organization as ApiOrganization,
} from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  AvatarUpload,
  buildMoneybirdContactInvoicesFilter,
  buildMoneybirdInvoicesFilter,
  EntityDetailLayout,
  FinanceInvoicesView,
  OrganizationContactsListView,
  OrganizationDetailView,
  OrganizationTransactionsSection,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  ScopedLettersListView,
  ProjectsOverviewView,
  buildOrganizationProjectsHref,
  getLettersHref,
  getOrganizationContactHref,
  getOrganizationProjectHref,
  getOrganizationSectionHref,
  getOrganizationsHref,
  groupItemsByAlphaLetter,
  getUniqueListItemRouteParam,
  isOrganizationSectionId,
  localCalendarYear,
  organizationMatchesSlug,
  parseListBoardViewFromLocation,
  parseOrganizationSectionId,
  persistListBoardView,
  primeTabTitle,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  resolveVisibleOrganizationSections,
  type ListBoardView,
  type OrganizationOverviewDetails,
  type OrganizationSectionId,
  type ContactListItem,
  type ProjectStatus,
  type TaskStatus,
  projectReorderPatches,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
} from "../lib/avatar-upload";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { type ProjectLocationState } from "../lib/project-type-cache";
import { buildWorkingProjectIdSet } from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";

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
  const navigate = useNavigate();
  const location = useLocation();
  const { slug, section: sectionParam } = useParams<{
    slug?: string;
    section?: string;
  }>();
  const workspace = useDesktopWorkspaceData();
  const agentStatus = useDesktopAgentStatusOptional();
  const { client } = useDesktopApi();
  const { organizations, projects, letters, contacts } = workspace;
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const [avatarOverride, setAvatarOverride] = useState<
    string | null | undefined
  >(undefined);

  const selected = slug
    ? organizations.find((org) => organizationMatchesSlug(org, slug)) ?? null
    : null;

  const orgProjectsListView = useMemo(
    () =>
      parseListBoardViewFromLocation(
        location.pathname,
        location.search,
        PROJECTS_LIST_BOARD_STORAGE_KEY,
      ),
    [location.pathname, location.search],
  );

  useEffect(() => {
    setAvatarOverride(undefined);
  }, [selected?.id]);

  const details: ApiOrganization | null = selected
    ? (workspace.organizationDetails[selected.id] ?? null)
    : null;

  const activeSection = parseOrganizationSectionId(sectionParam);
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

  const [orgInvoices, setOrgInvoices] = useState<MoneybirdSalesInvoiceSummary[]>(
    [],
  );
  const [orgInvoicesLoading, setOrgInvoicesLoading] = useState(false);
  const [orgInvoicesError, setOrgInvoicesError] = useState<string | null>(null);
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
  const [orgInvoiceDetailLoading, setOrgInvoiceDetailLoading] = useState(false);
  const [orgInvoiceDetailError, setOrgInvoiceDetailError] = useState<
    string | null
  >(null);

  const visibleSections = useMemo(
    () =>
      resolveVisibleOrganizationSections({
        hasTransactions,
        hasInvoices,
      }),
    [hasInvoices, hasTransactions],
  );

  const sectionLabel =
    activeSection === "overview"
      ? null
      : (visibleSections.find((entry) => entry.id === activeSection)?.label ??
        null);

  const selectedSlugValue = selected ? String(orgSlug(selected)) : null;

  const moneybirdContactId =
    details?.moneybirdContactId?.trim() ||
    (
      selected
        ? organizations.find((entry) => entry.id === selected.id)
        : null
    )?.moneybirdContactId?.trim() ||
    null;

  const accountAvatarSrcById = useDesktopAvatarSrcMap(
    "bank_account",
    financeAccounts,
  );

  const orgListItem = useMemo(() => {
    if (!selected) return null;
    return {
      id: selected.id,
      name: selected.name,
      number: selected.number,
      key: selected.key,
      moneybirdContactId: moneybirdContactId,
    };
  }, [moneybirdContactId, selected]);

  useEffect(() => {
    if (slug) return;
    // Match side-panel alpha order (not API/sort_order).
    const first =
      groupItemsByAlphaLetter(organizations).flatMap(
        ([, entries]) => entries,
      )[0] ?? null;
    if (first) {
      const routeParam = getUniqueListItemRouteParam(first, organizations);
      navigate(getOrganizationsHref(routeParam), { replace: true });
    }
  }, [navigate, organizations, slug]);

  useEffect(() => {
    if (!selected || !sectionParam || !selectedSlugValue) return;
    if (
      sectionParam === "overview" ||
      !isOrganizationSectionId(sectionParam)
    ) {
      navigate(getOrganizationSectionHref(selectedSlugValue, "overview"), {
        replace: true,
      });
    }
  }, [navigate, sectionParam, selected, selectedSlugValue]);

  useEffect(() => {
    if (!selected || !financeProbeReady || !selectedSlugValue) return;
    const visibleIds = new Set(visibleSections.map((entry) => entry.id));
    if (!visibleIds.has(activeSection)) {
      navigate(getOrganizationSectionHref(selectedSlugValue, "overview"), {
        replace: true,
      });
    }
  }, [
    activeSection,
    financeProbeReady,
    navigate,
    selected,
    selectedSlugValue,
    visibleSections,
  ]);

  useEffect(() => {
    if (!selected) {
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
      const contactId =
        details?.moneybirdContactId?.trim() ||
        moneybirdContactId ||
        null;
      try {
        const [txProbe, invoiceProbe] = await Promise.all([
          client.requestJson<{ transactions: FinancialTransaction[] }>(
            `/api/v1/transactions?${new URLSearchParams({
              organizationId: selected.id,
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
  }, [client, details?.moneybirdContactId, moneybirdContactId, selected]);

  useEffect(() => {
    if (!selected || activeSection !== "transactions") return;
    let cancelled = false;
    setOrgTransactionsLoading(true);
    void (async () => {
      try {
        const [transactions, categoriesBody, accountsBody, goalsBody, recurringsBody] =
          await Promise.all([
            fetchAllOrganizationTransactions(client, selected.id),
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
  }, [activeSection, client, selected]);

  useEffect(() => {
    if (!selected || activeSection !== "invoices" || !moneybirdContactId) {
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
    activeSection,
    client,
    moneybirdContactId,
    orgInvoiceStatusIds,
    orgInvoicesPage,
    orgInvoicesYear,
    selected,
  ]);

  useEffect(() => {
    setSelectedOrgInvoiceId(null);
  }, [orgInvoicesPage, orgInvoicesYear, orgInvoiceStatusIds, selected?.id]);

  useEffect(() => {
    if (activeSection !== "invoices" || !selectedOrgInvoiceId) {
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
  }, [activeSection, client, selectedOrgInvoiceId]);

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
          .filter((row) => row.organizationId === selected?.id);
        setHasTransactions(next.length > 0);
        return next;
      });
    },
    [client, selected?.id],
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
      if (!selected) return;
      const refreshed = await fetchAllOrganizationTransactions(
        client,
        selected.id,
      );
      setOrgTransactions(refreshed);
      setHasTransactions(refreshed.length > 0);
    },
    [client, selected],
  );

  useDesktopSectionBreadcrumb(
    selected
      ? [
          { label: "Organizations", href: "/organizations" },
          {
            label: selected.name,
            href:
              activeSection === "overview" || !selectedSlugValue
                ? undefined
                : getOrganizationSectionHref(selectedSlugValue, "overview"),
          },
          ...(sectionLabel ? [{ label: sectionLabel }] : []),
        ]
      : [{ label: "Organizations" }],
  );

  const handleDeleteOrganization = useCallback(async () => {
    if (!selected) {
      return { ok: false as const, error: "Organization is required." };
    }
    try {
      await workspace.softDeleteOrganization(selected.id);
      navigate("/organizations", { replace: true });
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
  }, [navigate, selected, workspace]);

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

  if (!slug) {
    return (
      <EntityDetailLayout
        sectionLabel="Organizations"
        title={null}
        resolving={organizations.length > 0}
      />
    );
  }

  if (!selected || !selectedSlugValue) {
    if (!workspace.ready) {
      return (
        <EntityDetailLayout
          sectionLabel="Organizations"
          title={null}
          resolving
        />
      );
    }
    return (
      <EntityDetailLayout
        sectionLabel="Organizations"
        title={null}
        emptyMessage="Organization not found."
      />
    );
  }

  const organization = selected;
  const organizationSlug = selectedSlugValue;

  function handleSectionChange(next: OrganizationSectionId) {
    navigate(getOrganizationSectionHref(organizationSlug, next), {
      replace: true,
    });
  }

  function renderSection(sectionId: OrganizationSectionId) {
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
          onSelectLetter={(letter) => navigate(getLettersHref(letter.number))}
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

  return (
    <>
      <RegisterPageTitle title={organization.name} />
      {activeSection === "overview" ? (
        <RegisterEntityDeleteAction
          entityLabel={`organization "${organization.name}"`}
          onDelete={handleDeleteOrganization}
        />
      ) : null}
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
          website: details?.website ?? null,
          address: details?.address ?? null,
          city: details?.city ?? null,
          postalCode: details?.postalCode ?? null,
          country: details?.country ?? null,
          summary: details?.summary ?? null,
          moneybirdContactId:
            details?.moneybirdContactId ?? moneybirdContactId,
        }}
        organizationSlug={organizationSlug}
        sections={visibleSections}
        section={activeSection}
        onSectionChange={handleSectionChange}
        renderSection={renderSection}
        overviewHeaderAccessory={
          <AvatarUpload
            displayName={organization.name}
            avatarSrc={
              avatarOverride !== undefined
                ? avatarOverride
                : (organizationAvatarSrc[organization.id] ?? null)
            }
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
    </>
  );
}
