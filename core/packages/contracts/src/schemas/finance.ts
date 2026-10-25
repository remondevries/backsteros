import { z } from "zod";

import {
  bankAccountTypeSchema,
  financialAmountSignSchema,
  financialCategoryKindSchema,
  financialCategoryListingSchema,
  financialGoalListingSchema,
  financialGoalSavingModeSchema,
  financialImportDialectSchema,
  isoDateSchema,
  nullableIsoDateSchema,
} from "./common.js";
import { calendarDateSchema } from "./crm-portal.js";
export const bankAccountInputSchema = z.object({
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  ibanOrMask: z.string().max(64).nullable().optional(),
  currency: z.string().min(3).max(8).optional(),
  type: bankAccountTypeSchema.optional(),
  /** Optional accent / chart color (#RGB or #RRGGBB). */
  color: z
    .string()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
    .nullable()
    .optional(),
  /** Link to a Moneybird financial account for mutation sync. */
  moneybirdFinancialAccountId: z.string().min(1).max(64).nullable().optional(),
  sortOrder: z.number().int().optional(),
  /** Avatar blob key — set via avatar PUT / sync, not typical REST create. */
  avatarStorageKey: z.string().nullable().optional(),
  avatarContentType: z.string().nullable().optional(),
});

export const updateBankAccountSchema = bankAccountInputSchema.partial();

export const bankAccountSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  key: z.string(),
  name: z.string(),
  ibanOrMask: z.string().nullable(),
  currency: z.string(),
  type: bankAccountTypeSchema,
  avatarStorageKey: z.string().nullable(),
  avatarContentType: z.string().nullable(),
  color: z.string().nullable(),
  moneybirdFinancialAccountId: z.string().nullable(),
  moneybirdLastSyncedAt: nullableIsoDateSchema,
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

/** Aggregated running balance without loading Tier C transaction rows. */
export const bankAccountBalanceSchema = z.object({
  bankAccountId: z.string(),
  balanceCents: z.number().int(),
});

export const listBankAccountBalancesResponseSchema = z.object({
  balances: z.array(bankAccountBalanceSchema),
});

/** Dashboard assets vs debt sparkline ranges. */
export const financeAssetsDebtRangeSchema = z.enum([
  "1W",
  "1M",
  "3M",
  "YTD",
  "1Y",
  "ALL",
]);

export const financeAssetsDebtQuerySchema = z.object({
  range: financeAssetsDebtRangeSchema.optional(),
});

export const financeAssetsDebtPointSchema = z.object({
  date: calendarDateSchema,
  assetsCents: z.number().int().nonnegative(),
  debtCents: z.number().int().nonnegative(),
});

export const financeAssetsDebtResponseSchema = z.object({
  range: financeAssetsDebtRangeSchema,
  asOf: calendarDateSchema,
  assetsCents: z.number().int().nonnegative(),
  debtCents: z.number().int().nonnegative(),
  /** Snapshot at the start of the selected range (for % change). */
  startAssetsCents: z.number().int().nonnegative(),
  startDebtCents: z.number().int().nonnegative(),
  points: z.array(financeAssetsDebtPointSchema),
});

/** Workspace-wide income (credits) for a calendar month. */
export const bankAccountsMonthIncomeQuerySchema = z.object({
  /** `YYYY-MM` — defaults to the current calendar month. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export const bankAccountsMonthIncomeResponseSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  incomeCents: z.number().int().nonnegative(),
});

/** One calendar month of income (credits) and expense (debits as positive). */
export const bankAccountCashflowMonthSchema = z.object({
  /** `YYYY-MM` */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  incomeCents: z.number().int().nonnegative(),
  expenseCents: z.number().int().nonnegative(),
});

export const bankAccountCashflowQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2100).optional(),
});

export const bankAccountCashflowResponseSchema = z.object({
  bankAccountId: z.string(),
  year: z.number().int(),
  months: z.array(bankAccountCashflowMonthSchema),
});

/** Workspace-wide monthly cashflow + YTD net income for the Cash Flow page. */
export const workspaceCashflowQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2100).optional(),
  /** Calendar date `YYYY-MM-DD` used as YTD end (defaults to today). */
  asOf: calendarDateSchema.optional(),
});

export const workspaceCashflowResponseSchema = z.object({
  year: z.number().int(),
  /** Inclusive YTD end date (`YYYY-MM-DD`). */
  asOf: calendarDateSchema,
  months: z.array(bankAccountCashflowMonthSchema),
  /** Net income (income − expense) from Jan 1 of `year` through `asOf`. */
  ytdNetCents: z.number().int(),
  /**
   * Net income for the same calendar span in the previous year
   * (Jan 1 … same month/day of `year - 1`).
   */
  priorYtdNetCents: z.number().int(),
  ytdIncomeCents: z.number().int().nonnegative(),
  priorYtdIncomeCents: z.number().int().nonnegative(),
  ytdExpenseCents: z.number().int().nonnegative(),
  priorYtdExpenseCents: z.number().int().nonnegative(),
  /**
   * Net spend per calendar month × category (`categoryId` null = uncategorized).
   * Positive = net outflow; negative = net inflow (credits reduce spend).
   * Client rolls children into roots and caps to top categories + Other.
   */
  categoryMonths: z.array(
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      categoryId: z.string().nullable(),
      expenseCents: z.number().int(),
    }),
  ),
});

/** Spend detail side panel (multi-year history + month categories). */
export const financeSpendPanelQuerySchema = z.object({
  /** `YYYY-MM` — defaults to the current calendar month. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  /** How many trailing months of history to include (default 36). */
  historyMonths: z.coerce.number().int().min(6).max(60).optional(),
});

export const financeSpendPanelResponseSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  monthExpenseCents: z.number().int().nonnegative(),
  history: z.array(
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      expenseCents: z.number().int().nonnegative(),
    }),
  ),
  yearMetrics: z.array(
    z.object({
      year: z.number().int(),
      spendCents: z.number().int().nonnegative(),
      avgMonthlyCents: z.number().int().nonnegative(),
    }),
  ),
  categories: z.array(
    z.object({
      categoryId: z.string().nullable(),
      /** Net spend polarity: positive = outflow, negative = inflow. */
      expenseCents: z.number().int(),
    }),
  ),
});

export const financialCategoryInputSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().nullable().optional(),
  kind: financialCategoryKindSchema.optional(),
  listing: financialCategoryListingSchema.optional(),
  icon: z.string().nullable().optional(),
  /** Monthly budget in cents. Null or 0 means no budget. */
  budgetCents: z.number().int().nonnegative().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateFinancialCategorySchema = financialCategoryInputSchema.partial();

export const financialCategorySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  kind: financialCategoryKindSchema,
  listing: financialCategoryListingSchema,
  icon: z.string().nullable(),
  budgetCents: z.number().int().nonnegative().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const financialGoalInputSchema = z.object({
  name: z.string().min(1).max(255),
  listing: financialGoalListingSchema.optional(),
  icon: z.string().nullable().optional(),
  /** Target savings amount in cents. Null or 0 means no goal amount. */
  goalAmountCents: z.number().int().nonnegative().nullable().optional(),
  /** When saving for this goal should start (YYYY-MM-DD). */
  startDate: calendarDateSchema.nullable().optional(),
  /** Optional target end of the goal period (YYYY-MM-DD). */
  endDate: calendarDateSchema.nullable().optional(),
  /** Contribution per saving-mode period in cents. */
  contributionCents: z.number().int().nonnegative().nullable().optional(),
  savingMode: financialGoalSavingModeSchema.optional(),
  sortOrder: z.number().int().optional(),
});

export const updateFinancialGoalSchema = financialGoalInputSchema.partial();

export const financialGoalSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  listing: financialGoalListingSchema,
  icon: z.string().nullable(),
  goalAmountCents: z.number().int().nonnegative().nullable(),
  startDate: calendarDateSchema.nullable(),
  endDate: calendarDateSchema.nullable(),
  contributionCents: z.number().int().nonnegative().nullable(),
  savingMode: financialGoalSavingModeSchema,
  /**
   * Sum of linked transaction amounts in cents (actual deposits/spend tagged
   * to this goal). Not stored — computed on read.
   */
  savedCents: z.number().int(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

/** Client proposal + estimate package (portal Financials → Estimates). */
export const CLIENT_ESTIMATE_STATUSES = [
  "concept",
  "in_review",
  "approved",
  "declined",
] as const;

export const clientEstimateStatusSchema = z.enum(CLIENT_ESTIMATE_STATUSES);

export const clientEstimateSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  /** Workspace-scoped display number for ES-{n}. */
  number: z.number().int().positive().nullable(),
  organizationId: z.string().nullable(),
  projectId: z.string().nullable(),
  title: z.string(),
  subtitle: z.string().nullable(),
  clientLabel: z.string().nullable(),
  authorContactId: z.string().nullable(),
  authorName: z.string().nullable(),
  /**
   * Portal recipients ("To") — contact ids who may see this estimate.
   * Empty = legacy org-wide portal visibility for that organization.
   */
  toContactIds: z.array(z.string()).default([]),
  versionLabel: z.string().nullable(),
  /** Display / due date label (e.g. "oktober 2026"), not necessarily ISO. */
  documentDate: z.string().nullable(),
  status: clientEstimateStatusSchema,
  /** Quoted total in cents (EUR). */
  totalAmountCents: z.number().int().nonnegative().nullable(),
  proposalMarkdown: z.string(),
  estimateMarkdown: z.string(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const createClientEstimateSchema = z.object({
  organizationId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  title: z.string().min(1).max(500),
  subtitle: z.string().max(2000).nullable().optional(),
  clientLabel: z.string().max(500).nullable().optional(),
  authorContactId: z.string().min(1).nullable().optional(),
  authorName: z.string().max(500).nullable().optional(),
  toContactIds: z.array(z.string().min(1)).max(200).optional(),
  versionLabel: z.string().max(200).nullable().optional(),
  documentDate: z.string().max(200).nullable().optional(),
  status: clientEstimateStatusSchema.optional(),
  totalAmountCents: z.number().int().nonnegative().nullable().optional(),
  proposalMarkdown: z.string().max(5_000_000).optional(),
  estimateMarkdown: z.string().max(5_000_000).optional(),
  sortOrder: z.number().int().optional(),
});

export const updateClientEstimateSchema = createClientEstimateSchema
  .partial()
  .extend({
    organizationId: z.string().min(1).nullable().optional(),
    projectId: z.string().min(1).nullable().optional(),
  });

export const listClientEstimatesQuerySchema = z.object({
  organizationId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const financialRecurringInputSchema = z.object({
  name: z.string().min(1).max(255),
  icon: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  /** Expected next payment amount in cents. */
  amountCents: z.number().int().nonnegative().nullable().optional(),
  /** Next expected payment date (YYYY-MM-DD). */
  nextDate: calendarDateSchema.nullable().optional(),
  /** When true, nextDate is not auto-rolled into the current month. */
  archived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateFinancialRecurringSchema =
  financialRecurringInputSchema.partial();

export const financialRecurringSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  categoryId: z.string().nullable(),
  amountCents: z.number().int().nonnegative().nullable(),
  nextDate: calendarDateSchema.nullable(),
  archived: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

/** Cash Flow planning scratchpad row type. */
export const cashflowPlannerEntryTypeSchema = z.enum(["expense", "income"]);

export const cashflowPlannerEntryInputSchema = z.object({
  entryType: cashflowPlannerEntryTypeSchema,
  name: z.string().min(1).max(255),
  /** Absolute amount in cents; sign comes from entryType. */
  amountCents: z.number().int().nonnegative(),
  /** Due / pay date (YYYY-MM-DD). */
  dueDate: calendarDateSchema,
  /** Optional free-text group label (e.g. Housing, Week 1). */
  groupLabel: z.string().max(255).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateCashflowPlannerEntrySchema =
  cashflowPlannerEntryInputSchema.partial();

export const cashflowPlannerEntrySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  entryType: cashflowPlannerEntryTypeSchema,
  name: z.string(),
  amountCents: z.number().int().nonnegative(),
  dueDate: calendarDateSchema,
  groupLabel: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const financialImportBatchSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  bankAccountId: z.string(),
  originalFilename: z.string(),
  storageKey: z.string(),
  dialect: financialImportDialectSchema,
  rowCount: z.number().int().nonnegative(),
  insertedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
});

export const financialImportResultSchema = z.object({
  batchId: z.string(),
  dialect: financialImportDialectSchema,
  rowCount: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  skippedAccountMismatch: z.number().int().nonnegative(),
});

export const financialTransactionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  bankAccountId: z.string(),
  importBatchId: z.string().nullable(),
  bookedOn: calendarDateSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  payee: z.string(),
  counterparty: z.string().nullable(),
  memo: z.string().nullable(),
  /**
   * Optional adjusted title for UI. Original payee/memo/raw are never rewritten.
   * Null/empty → clients fall back to payee → memo → counterparty.
   */
  displayName: z.string().nullable(),
  balanceAfterCents: z.number().int().nullable(),
  externalId: z.string().nullable(),
  fingerprint: z.string(),
  sourceCode: z.string().nullable(),
  sourceType: z.string().nullable(),
  /**
   * Moneybird `settlement_state` (or equivalent). Null for CSV imports /
   * unknown → treat as settled. Void states (refused, cancelled, …) stay in
   * the ledger for classification but must not affect balances or cashflow.
   */
  settlementState: z.string().nullable(),
  /** Original CSV row columns preserved at import time. */
  raw: z.record(z.string(), z.string()).default({}),
  organizationId: z.string().nullable(),
  projectId: z.string().nullable(),
  categoryId: z.string().nullable(),
  goalId: z.string().nullable(),
  recurringId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const updateFinancialTransactionSchema = z.object({
  /** Move the transaction to another bank account in the same workspace. */
  bankAccountId: z.string().optional(),
  organizationId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  recurringId: z.string().nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  /** User-adjusted display title; null clears the override. */
  displayName: z.string().max(500).nullable().optional(),
});

export const batchUpdateFinancialTransactionsSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  patch: updateFinancialTransactionSchema,
});

export const batchDeleteFinancialTransactionsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const batchDeleteFinancialTransactionsResponseSchema = z.object({
  deleted: z.number().int().nonnegative(),
});

export const listFinancialTransactionsQuerySchema = z.object({
  q: z.string().optional(),
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM")
    .optional(),
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
  categoryId: z.string().optional(),
  goalId: z.string().optional(),
  recurringId: z.string().optional(),
  /**
   * Comma-separated category ids for multi-select filter.
   * Combined with `uncategorized` using OR when both are present.
   */
  categoryIds: z.string().optional(),
  /** Pass `"true"` to filter rows with no category. */
  uncategorized: z.enum(["true", "false"]).optional(),
  /** Pass `"true"` to filter rows with no organization. */
  unassignedOrg: z.enum(["true", "false"]).optional(),
  /** Pass `"true"` to filter rows with no goal. */
  unassignedGoal: z.enum(["true", "false"]).optional(),
  /** Pass `"true"` to filter rows with no recurring. */
  unassignedRecurring: z.enum(["true", "false"]).optional(),
  amountSign: financialAmountSignSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().optional(),
  /**
   * When `"true"`, response includes `total` — full matching row count
   * (ignores cursor / pagination). Used by dashboard review badge.
   */
  includeTotal: z.enum(["true", "false"]).optional(),
});

export const listFinancialTransactionsResponseSchema = z.object({
  transactions: z.array(financialTransactionSchema),
  nextCursor: z.string().nullable(),
  /** Present when the request set `includeTotal=true`. */
  total: z.number().int().nonnegative().optional(),
});

export const moneybirdSalesInvoiceSchema = z.object({
  id: z.string(),
  invoiceId: z.string().nullable(),
  state: z.string(),
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  reference: z.string().nullable(),
  currency: z.string().nullable(),
  totalPriceInclTax: z.string().nullable(),
  totalPriceExclTax: z.string().nullable(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable(),
});

export const moneybirdSalesInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  /** Moneybird filter string, e.g. `state:open|late` or `period:this_year`. */
  filter: z.string().max(500).optional(),
});

export const moneybirdSalesInvoicesResponseSchema = z.object({
  invoices: z.array(moneybirdSalesInvoiceSchema),
  page: z.number().int(),
  perPage: z.number().int(),
  /** True when Moneybird may have another page after this one. */
  hasMore: z.boolean(),
  /**
   * Last Moneybird list page for this filter (discovered via probes;
   * Moneybird does not return totals).
   */
  totalPages: z.number().int().positive(),
});

/** Postal / company address block for invoice recipient or sender identity. */
export const moneybirdInvoicePartySchema = z.object({
  companyName: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  address1: z.string().nullable(),
  address2: z.string().nullable(),
  zipcode: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  customerId: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  chamberOfCommerce: z.string().nullable(),
  taxNumber: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
});

export const moneybirdInvoiceLineSchema = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.string().nullable(),
  price: z.string().nullable(),
  totalPriceExclTax: z.string().nullable(),
  taxRateId: z.string().nullable(),
  /** Percentage string from Moneybird tax rates, e.g. `"21.0"`. */
  taxPercentage: z.string().nullable(),
});

export const moneybirdInvoiceTaxTotalSchema = z.object({
  taxRateId: z.string().nullable(),
  taxableAmount: z.string().nullable(),
  taxAmount: z.string().nullable(),
  taxPercentage: z.string().nullable(),
});

/** Full Moneybird sales invoice for the finance detail panel. */
export const moneybirdSalesInvoiceDetailSchema = z.object({
  id: z.string(),
  invoiceId: z.string().nullable(),
  state: z.string(),
  language: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  reference: z.string().nullable(),
  currency: z.string().nullable(),
  pricesAreInclTax: z.boolean(),
  totalPriceInclTax: z.string().nullable(),
  totalPriceExclTax: z.string().nullable(),
  contactId: z.string().nullable(),
  recipient: moneybirdInvoicePartySchema,
  sender: moneybirdInvoicePartySchema.nullable(),
  lines: z.array(moneybirdInvoiceLineSchema),
  taxTotals: z.array(moneybirdInvoiceTaxTotalSchema),
});

export const moneybirdInvoiceRevenueQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2100).optional(),
});

/** Monthly billed sales-invoice totals from Moneybird (expense always 0 for now). */
export const moneybirdInvoiceRevenueResponseSchema = z.object({
  year: z.number().int(),
  months: z.array(bankAccountCashflowMonthSchema),
});

/** Active Moneybird financial accounts (bank / card / payment rails). */
export const moneybirdFinancialAccountSchema = z.object({
  id: z.string(),
  type: z.string().nullable(),
  name: z.string(),
  identifier: z.string().nullable(),
  currency: z.string().nullable(),
  provider: z.string().nullable(),
  moneybirdAccount: z.boolean(),
  active: z.boolean(),
});

export const moneybirdFinancialAccountsResponseSchema = z.object({
  financialAccounts: z.array(moneybirdFinancialAccountSchema),
});

/** Result of ingesting Moneybird financial mutations into a bank account. */
export const moneybirdBankAccountSyncResultSchema = z.object({
  bankAccountId: z.string(),
  moneybirdFinancialAccountId: z.string(),
  fetched: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  /** Mutations refreshed because Moneybird `version` advanced. */
  updated: z.number().int().nonnegative(),
  /** Local Moneybird rows removed after they disappeared from the sync set. */
  removed: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  lastSyncedAt: isoDateSchema,
});

export const moneybirdBankAccountSyncQuerySchema = z.object({
  /** Moneybird period filter; defaults to this_year. */
  period: z.string().min(1).max(64).optional(),
});

export type BankAccount = z.infer<typeof bankAccountSchema>;

export type BankAccountInput = z.infer<typeof bankAccountInputSchema>;

export type BankAccountBalance = z.infer<typeof bankAccountBalanceSchema>;

export type FinanceAssetsDebtRange = z.infer<typeof financeAssetsDebtRangeSchema>;

export type FinanceAssetsDebt = z.infer<typeof financeAssetsDebtResponseSchema>;

export type BankAccountCashflowMonth = z.infer<
  typeof bankAccountCashflowMonthSchema
>;

export type BankAccountCashflow = z.infer<
  typeof bankAccountCashflowResponseSchema
>;

export type WorkspaceCashflow = z.infer<typeof workspaceCashflowResponseSchema>;

export type FinanceSpendPanel = z.infer<typeof financeSpendPanelResponseSchema>;

export type BankAccountsMonthIncome = z.infer<
  typeof bankAccountsMonthIncomeResponseSchema
>;

export type FinancialCategory = z.infer<typeof financialCategorySchema>;

export type FinancialCategoryInput = z.infer<typeof financialCategoryInputSchema>;

export type FinancialGoal = z.infer<typeof financialGoalSchema>;

export type FinancialGoalInput = z.infer<typeof financialGoalInputSchema>;

export type ClientEstimate = z.infer<typeof clientEstimateSchema>;

export type ClientEstimateStatus = z.infer<typeof clientEstimateStatusSchema>;

export type CreateClientEstimateInput = z.infer<
  typeof createClientEstimateSchema
>;

export type UpdateClientEstimateInput = z.infer<
  typeof updateClientEstimateSchema
>;

export type ListClientEstimatesQuery = z.infer<
  typeof listClientEstimatesQuerySchema
>;

export type FinancialRecurring = z.infer<typeof financialRecurringSchema>;

export type FinancialRecurringInput = z.infer<
  typeof financialRecurringInputSchema
>;

export type CashflowPlannerEntryType = z.infer<
  typeof cashflowPlannerEntryTypeSchema
>;

export type CashflowPlannerEntry = z.infer<typeof cashflowPlannerEntrySchema>;

export type CashflowPlannerEntryInput = z.infer<
  typeof cashflowPlannerEntryInputSchema
>;

export type FinancialImportBatch = z.infer<typeof financialImportBatchSchema>;

export type FinancialImportResult = z.infer<typeof financialImportResultSchema>;

export type FinancialTransaction = z.infer<typeof financialTransactionSchema>;

export type UpdateFinancialTransactionInput = z.infer<
  typeof updateFinancialTransactionSchema
>;

export type BatchDeleteFinancialTransactionsInput = z.infer<
  typeof batchDeleteFinancialTransactionsSchema
>;

export type BatchDeleteFinancialTransactionsResponse = z.infer<
  typeof batchDeleteFinancialTransactionsResponseSchema
>;

export type MoneybirdSalesInvoiceSummary = z.infer<
  typeof moneybirdSalesInvoiceSchema
>;

export type MoneybirdInvoiceParty = z.infer<typeof moneybirdInvoicePartySchema>;

export type MoneybirdInvoiceLine = z.infer<typeof moneybirdInvoiceLineSchema>;

export type MoneybirdInvoiceTaxTotal = z.infer<
  typeof moneybirdInvoiceTaxTotalSchema
>;

export type MoneybirdSalesInvoiceDetail = z.infer<
  typeof moneybirdSalesInvoiceDetailSchema
>;

export type MoneybirdInvoiceRevenue = z.infer<
  typeof moneybirdInvoiceRevenueResponseSchema
>;

export type MoneybirdFinancialAccount = z.infer<
  typeof moneybirdFinancialAccountSchema
>;

export type MoneybirdBankAccountSyncResult = z.infer<
  typeof moneybirdBankAccountSyncResultSchema
>;
