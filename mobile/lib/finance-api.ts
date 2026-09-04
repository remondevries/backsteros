import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  BankAccount,
  BankAccountBalance,
  BankAccountCashflow,
  BankAccountInput,
  FinanceAssetsDebt,
  FinanceAssetsDebtRange,
  FinanceSpendPanel,
  FinancialCategory,
  FinancialCategoryInput,
  FinancialGoal,
  FinancialGoalInput,
  FinancialRecurring,
  FinancialRecurringInput,
  FinancialTransaction,
  MoneybirdInvoiceRevenue,
  MoneybirdSalesInvoiceDetail,
  MoneybirdSalesInvoiceSummary,
  MoneybirdSettings,
  UpdateFinancialTransactionInput,
  WorkspaceCashflow,
} from "@backsteros/contracts";

/** Desktop-parity page size for the transactions list. */
export const TRANSACTIONS_PAGE_LIMIT = 200;

export type TransactionFilters = {
  q?: string;
  /** Scope to a single bank account (`/bank-accounts/:id/transactions`). */
  accountId?: string;
  categoryId?: string;
  goalId?: string;
  recurringId?: string;
  organizationId?: string;
  uncategorized?: boolean;
  /** `YYYY-MM` calendar month. */
  month?: string;
  limit?: number;
  cursor?: string;
  includeTotal?: boolean;
};

/** Pure path builder so pagination/filtering stays unit-testable. */
export function buildTransactionsPath(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  const q = filters.q?.trim();
  if (q) params.set("q", q);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.goalId) params.set("goalId", filters.goalId);
  if (filters.recurringId) params.set("recurringId", filters.recurringId);
  if (filters.organizationId) params.set("organizationId", filters.organizationId);
  if (filters.uncategorized) params.set("uncategorized", "true");
  if (filters.month) params.set("month", filters.month);
  params.set("limit", String(filters.limit ?? TRANSACTIONS_PAGE_LIMIT));
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.includeTotal) params.set("includeTotal", "true");
  const base = filters.accountId
    ? `/api/v1/bank-accounts/${encodeURIComponent(filters.accountId)}/transactions`
    : "/api/v1/transactions";
  return `${base}?${params.toString()}`;
}

export type TransactionsPage = {
  transactions: FinancialTransaction[];
  nextCursor: string | null;
  total?: number;
};

export function fetchTransactions(
  client: BacksterosApiClient,
  filters: TransactionFilters,
): Promise<TransactionsPage> {
  return client.requestJson<TransactionsPage>(buildTransactionsPath(filters));
}

/** Paginate every transaction in a calendar month (dashboard daily chart). */
export async function fetchAllMonthTransactions(
  client: BacksterosApiClient,
  month: string,
  pageLimit = 500,
): Promise<FinancialTransaction[]> {
  const rows: FinancialTransaction[] = [];
  let cursor: string | null = null;
  do {
    const page = await fetchTransactions(client, {
      month,
      limit: pageLimit,
      cursor: cursor ?? undefined,
    });
    rows.push(...page.transactions);
    cursor = page.nextCursor;
  } while (cursor);
  return rows;
}

export function fetchTransaction(
  client: BacksterosApiClient,
  id: string,
): Promise<FinancialTransaction> {
  return client.requestJson<FinancialTransaction>(
    `/api/v1/transactions/${encodeURIComponent(id)}`,
  );
}

export function patchTransaction(
  client: BacksterosApiClient,
  id: string,
  input: UpdateFinancialTransactionInput,
): Promise<FinancialTransaction> {
  return client.requestJson<FinancialTransaction>(
    `/api/v1/transactions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function fetchBankAccounts(
  client: BacksterosApiClient,
): Promise<BankAccount[]> {
  const body = await client.requestJson<{ bankAccounts: BankAccount[] }>(
    "/api/v1/bank-accounts",
  );
  return body.bankAccounts ?? [];
}

/** Running balances keyed by bank account id. */
export async function fetchBankAccountBalances(
  client: BacksterosApiClient,
): Promise<Record<string, number>> {
  const body = await client.requestJson<{ balances: BankAccountBalance[] }>(
    "/api/v1/bank-accounts/balances",
  );
  const byId: Record<string, number> = {};
  for (const balance of body.balances ?? []) {
    byId[balance.bankAccountId] = balance.balanceCents;
  }
  return byId;
}

/** Monthly income/expense for one bank account (desktop account detail chart). */
export function fetchBankAccountCashflow(
  client: BacksterosApiClient,
  accountId: string,
  year?: number,
): Promise<BankAccountCashflow> {
  const suffix = year != null ? `?year=${year}` : "";
  return client.requestJson<BankAccountCashflow>(
    `/api/v1/bank-accounts/${encodeURIComponent(accountId)}/cashflow${suffix}`,
  );
}

export function createBankAccount(
  client: BacksterosApiClient,
  input: BankAccountInput,
): Promise<BankAccount> {
  return client.requestJson<BankAccount>("/api/v1/bank-accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateBankAccount(
  client: BacksterosApiClient,
  id: string,
  input: Partial<BankAccountInput>,
): Promise<BankAccount> {
  return client.requestJson<BankAccount>(
    `/api/v1/bank-accounts/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function fetchFinancialCategories(
  client: BacksterosApiClient,
): Promise<FinancialCategory[]> {
  const body = await client.requestJson<{ categories: FinancialCategory[] }>(
    "/api/v1/financial-categories",
  );
  return body.categories ?? [];
}

export function createFinancialCategory(
  client: BacksterosApiClient,
  input: FinancialCategoryInput,
): Promise<FinancialCategory> {
  return client.requestJson<FinancialCategory>("/api/v1/financial-categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateFinancialCategory(
  client: BacksterosApiClient,
  id: string,
  input: Partial<FinancialCategoryInput>,
): Promise<FinancialCategory> {
  return client.requestJson<FinancialCategory>(
    `/api/v1/financial-categories/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function fetchFinancialGoals(
  client: BacksterosApiClient,
): Promise<FinancialGoal[]> {
  const body = await client.requestJson<{ goals: FinancialGoal[] }>(
    "/api/v1/financial-goals",
  );
  return body.goals ?? [];
}

export function createFinancialGoal(
  client: BacksterosApiClient,
  input: FinancialGoalInput,
): Promise<FinancialGoal> {
  return client.requestJson<FinancialGoal>("/api/v1/financial-goals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateFinancialGoal(
  client: BacksterosApiClient,
  id: string,
  input: Partial<FinancialGoalInput>,
): Promise<FinancialGoal> {
  return client.requestJson<FinancialGoal>(
    `/api/v1/financial-goals/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function deleteFinancialGoal(
  client: BacksterosApiClient,
  id: string,
): Promise<FinancialGoal> {
  return client.requestJson<FinancialGoal>(
    `/api/v1/financial-goals/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function fetchFinancialRecurrings(
  client: BacksterosApiClient,
): Promise<FinancialRecurring[]> {
  const body = await client.requestJson<{ recurrings: FinancialRecurring[] }>(
    "/api/v1/financial-recurrings",
  );
  return body.recurrings ?? [];
}

export function createFinancialRecurring(
  client: BacksterosApiClient,
  input: FinancialRecurringInput,
): Promise<FinancialRecurring> {
  return client.requestJson<FinancialRecurring>("/api/v1/financial-recurrings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateFinancialRecurring(
  client: BacksterosApiClient,
  id: string,
  input: Partial<FinancialRecurringInput>,
): Promise<FinancialRecurring> {
  return client.requestJson<FinancialRecurring>(
    `/api/v1/financial-recurrings/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function deleteFinancialRecurring(
  client: BacksterosApiClient,
  id: string,
): Promise<FinancialRecurring> {
  return client.requestJson<FinancialRecurring>(
    `/api/v1/financial-recurrings/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function fetchMoneybirdSettings(
  client: BacksterosApiClient,
): Promise<MoneybirdSettings> {
  return client.requestJson<MoneybirdSettings>("/api/v1/settings/moneybird");
}

export type MoneybirdInvoicesPage = {
  invoices: MoneybirdSalesInvoiceSummary[];
  page: number;
  perPage: number;
  hasMore: boolean;
  totalPages: number;
};

export function fetchMoneybirdInvoices(
  client: BacksterosApiClient,
  query?: { page?: number; perPage?: number; filter?: string },
): Promise<MoneybirdInvoicesPage> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.perPage) params.set("perPage", String(query.perPage));
  if (query?.filter) params.set("filter", query.filter);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return client.requestJson<MoneybirdInvoicesPage>(
    `/api/v1/finance/moneybird/invoices${suffix}`,
  );
}

export function fetchMoneybirdInvoiceDetail(
  client: BacksterosApiClient,
  invoiceId: string,
): Promise<MoneybirdSalesInvoiceDetail> {
  return client.requestJson<MoneybirdSalesInvoiceDetail>(
    `/api/v1/finance/moneybird/invoices/${encodeURIComponent(invoiceId)}`,
  );
}

/** Monthly billed sales-invoice totals from Moneybird for a calendar year. */
export function fetchMoneybirdInvoiceRevenue(
  client: BacksterosApiClient,
  year?: number,
): Promise<MoneybirdInvoiceRevenue> {
  const suffix = year ? `?year=${year}` : "";
  return client.requestJson<MoneybirdInvoiceRevenue>(
    `/api/v1/finance/moneybird/invoice-revenue${suffix}`,
  );
}

/** Moneybird list filter for invoices dated in a calendar year. */
export function buildMoneybirdInvoicesPeriodFilter(year: number): string {
  return `period:${year}0101..${year}1231`;
}

/**
 * Billed Moneybird sales-invoice states (same set as invoice-revenue).
 * Draft / uncollectible are excluded at the API filter.
 */
export const MONEYBIRD_BILLED_INVOICE_STATE_FILTER =
  "state:open|scheduled|pending_payment|reminded|late|paid";

/** Moneybird list filter for billed invoices dated in a calendar month (`YYYY-MM`). */
export function buildMoneybirdInvoicesMonthPeriodFilter(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const lastDay = new Date(year, month, 0).getDate();
  const prefix = `${year}${String(month).padStart(2, "0")}`;
  return `period:${prefix}01..${prefix}${String(lastDay).padStart(2, "0")},${MONEYBIRD_BILLED_INVOICE_STATE_FILTER}`;
}

/** Moneybird list filter for billed invoices dated in a calendar year. */
export function buildMoneybirdInvoicesBilledYearFilter(year: number): string {
  return `${buildMoneybirdInvoicesPeriodFilter(year)},${MONEYBIRD_BILLED_INVOICE_STATE_FILTER}`;
}

/** Paginate Moneybird sales invoices for a calendar month (billed states only). */
export async function fetchAllMoneybirdInvoicesForMonth(
  client: BacksterosApiClient,
  monthKey: string,
): Promise<MoneybirdSalesInvoiceSummary[]> {
  const monthFilter = buildMoneybirdInvoicesMonthPeriodFilter(monthKey);
  let invoices = await paginateMoneybirdInvoices(client, monthFilter);

  // Fall back to the year list (same path as invoice-revenue) and filter
  // client-side — some Moneybird admins return empty for tight month ranges.
  if (invoices.length === 0) {
    const year = Number(monthKey.slice(0, 4));
    const yearInvoices = await paginateMoneybirdInvoices(
      client,
      buildMoneybirdInvoicesBilledYearFilter(year),
    );
    invoices = yearInvoices.filter(
      (invoice) => (invoice.invoiceDate ?? "").slice(0, 7) === monthKey,
    );
  }

  return invoices;
}

async function paginateMoneybirdInvoices(
  client: BacksterosApiClient,
  filter: string,
): Promise<MoneybirdSalesInvoiceSummary[]> {
  const invoices: MoneybirdSalesInvoiceSummary[] = [];
  for (let page = 1; page <= 50; page++) {
    const result = await fetchMoneybirdInvoices(client, {
      page,
      perPage: 100,
      filter,
    });
    invoices.push(...result.invoices);
    if (!result.hasMore || result.invoices.length === 0) break;
  }
  return invoices;
}

/** Moneybird filter that lists invoices for a contact across all periods. */
export function buildMoneybirdContactInvoicesFilter(contactId: string): string {
  return `contact_id:${contactId.trim()}`;
}

export function fetchAssetsDebt(
  client: BacksterosApiClient,
  range: FinanceAssetsDebtRange,
): Promise<FinanceAssetsDebt> {
  return client.requestJson<FinanceAssetsDebt>(
    `/api/v1/finance/assets-debt?range=${encodeURIComponent(range)}`,
  );
}

/** Monthly income/expense + per-category spend for a calendar year. */
export function fetchWorkspaceCashflow(
  client: BacksterosApiClient,
  year?: number,
  asOf?: string,
): Promise<WorkspaceCashflow> {
  const params = new URLSearchParams();
  if (year != null) params.set("year", String(year));
  if (asOf) params.set("asOf", asOf);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return client.requestJson<WorkspaceCashflow>(
    `/api/v1/finance/cashflow${suffix}`,
  );
}

export function fetchFinanceSpendPanel(
  client: BacksterosApiClient,
  month?: string,
): Promise<FinanceSpendPanel> {
  const suffix = month ? `?month=${encodeURIComponent(month)}` : "";
  return client.requestJson<FinanceSpendPanel>(
    `/api/v1/finance/spend-panel${suffix}`,
  );
}

/** Permanently delete transactions by id (desktop batch-delete parity). */
export function batchDeleteTransactions(
  client: BacksterosApiClient,
  ids: string[],
): Promise<{ deleted: number }> {
  return client.requestJson<{ deleted: number }>(
    "/api/v1/transactions/batch-delete",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    },
  );
}
