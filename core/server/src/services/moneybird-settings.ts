import { eq } from "drizzle-orm";

import type {
  MoneybirdAdministrationSummary,
  MoneybirdInvoiceRevenue,
  MoneybirdSalesInvoiceDetail,
  MoneybirdSalesInvoiceSummary,
  MoneybirdSettings,
  MoneybirdTestConnectionResult,
  UpdateMoneybirdSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import {
  applyTaxPercentagesToDetail,
  findLastInvoicePageNumber,
  MoneybirdApiError,
  MoneybirdClient,
  type MoneybirdSalesInvoice,
} from "../lib/moneybird-client.js";
import { previewCursorApiKey } from "./cursor-settings.js";

export function previewMoneybirdToken(token: string): string {
  return previewCursorApiKey(token);
}

const INVOICE_PAGE_COUNT_TTL_MS = 5 * 60 * 1000;
const invoicePageCountCache = new Map<
  string,
  { totalPages: number; expiresAt: number }
>();

function invoicePageCountCacheKey(
  workspaceId: string,
  administrationId: string,
  filter: string,
  perPage: number,
): string {
  return `${workspaceId}:${administrationId}:${perPage}:${filter}`;
}

function readCachedInvoicePageCount(key: string): number | null {
  const entry = invoicePageCountCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    invoicePageCountCache.delete(key);
    return null;
  }
  return entry.totalPages;
}

function writeCachedInvoicePageCount(key: string, totalPages: number): void {
  invoicePageCountCache.set(key, {
    totalPages,
    expiresAt: Date.now() + INVOICE_PAGE_COUNT_TTL_MS,
  });
}

export type MoneybirdSalesInvoicesPage = {
  invoices: MoneybirdSalesInvoiceSummary[];
  page: number;
  perPage: number;
  hasMore: boolean;
  totalPages: number;
};

async function getSecretRow(workspaceId: string): Promise<{
  moneybirdApiToken: string | null;
  moneybirdAdministrationId: string | null;
} | null> {
  const [row] = await db
    .select({
      moneybirdApiToken: workspaceIntegrationSecrets.moneybirdApiToken,
      moneybirdAdministrationId:
        workspaceIntegrationSecrets.moneybirdAdministrationId,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

export async function getMoneybirdCredentials(
  workspaceId: string,
): Promise<{ apiToken: string | null; administrationId: string | null }> {
  const row = await getSecretRow(workspaceId);
  const apiToken = row?.moneybirdApiToken?.trim() || null;
  const administrationId = row?.moneybirdAdministrationId?.trim() || null;
  return { apiToken, administrationId };
}

export async function getMoneybirdSettings(
  workspaceId: string,
): Promise<MoneybirdSettings> {
  const { apiToken, administrationId } =
    await getMoneybirdCredentials(workspaceId);
  let administrationName: string | null = null;

  if (apiToken && administrationId) {
    try {
      const client = new MoneybirdClient({ apiToken });
      const administrations = await client.listAdministrations();
      administrationName =
        administrations.find((entry) => entry.id === administrationId)?.name ??
        null;
    } catch {
      // Keep settings readable even if Moneybird is unreachable.
    }
  }

  return {
    apiTokenConfigured: Boolean(apiToken),
    apiTokenPreview: apiToken ? previewMoneybirdToken(apiToken) : null,
    administrationId,
    administrationName,
    connected: Boolean(apiToken && administrationId),
  };
}

export async function updateMoneybirdSettings(
  workspaceId: string,
  patch: UpdateMoneybirdSettingsInput,
): Promise<MoneybirdSettings> {
  const current = await getMoneybirdCredentials(workspaceId);
  let nextToken = current.apiToken;
  let nextAdministrationId = current.administrationId;

  if (patch.apiToken !== undefined) {
    const trimmed = patch.apiToken.trim();
    nextToken = trimmed.length > 0 ? trimmed : null;
  }
  if (patch.administrationId !== undefined) {
    const trimmed = patch.administrationId?.trim() ?? "";
    nextAdministrationId = trimmed.length > 0 ? trimmed : null;
  }

  // When saving a new token without an admin id, pick the only administration.
  if (
    patch.apiToken !== undefined &&
    nextToken &&
    !nextAdministrationId
  ) {
    try {
      const client = new MoneybirdClient({ apiToken: nextToken });
      const administrations = await client.listAdministrations();
      if (administrations.length === 1) {
        nextAdministrationId = administrations[0]!.id;
      }
    } catch {
      // Leave administration unset; user can pick after fixing the token.
    }
  }

  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      moneybirdApiToken: nextToken,
      moneybirdAdministrationId: nextAdministrationId,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        moneybirdApiToken: nextToken,
        moneybirdAdministrationId: nextAdministrationId,
        updatedAt: new Date(),
      },
    });

  return getMoneybirdSettings(workspaceId);
}

export async function listMoneybirdAdministrations(
  workspaceId: string,
): Promise<MoneybirdAdministrationSummary[]> {
  const { apiToken } = await getMoneybirdCredentials(workspaceId);
  if (!apiToken) {
    throw new MoneybirdApiError(
      400,
      "",
      "Moneybird API token is not configured",
    );
  }
  const client = new MoneybirdClient({ apiToken });
  return client.listAdministrations();
}

export async function testMoneybirdConnection(
  workspaceId: string,
): Promise<MoneybirdTestConnectionResult> {
  const { apiToken, administrationId } =
    await getMoneybirdCredentials(workspaceId);
  if (!apiToken) {
    return {
      ok: false,
      error: "Moneybird API token is not configured.",
      administrationName: null,
      invoiceSampleCount: null,
    };
  }

  try {
    const client = new MoneybirdClient({
      apiToken,
      administrationId,
    });
    const administrations = await client.listAdministrations();
    if (administrations.length === 0) {
      return {
        ok: false,
        error: "Token works, but no administrations were returned.",
        administrationName: null,
        invoiceSampleCount: null,
      };
    }

    const selected =
      (administrationId
        ? administrations.find((entry) => entry.id === administrationId)
        : null) ?? null;

    if (administrationId && !selected) {
      return {
        ok: false,
        error:
          "Stored administration id was not found for this Moneybird token.",
        administrationName: null,
        invoiceSampleCount: null,
      };
    }

    if (!selected) {
      return {
        ok: true,
        error: null,
        administrationName: null,
        invoiceSampleCount: null,
      };
    }

    const invoices = await new MoneybirdClient({
      apiToken,
      administrationId: selected.id,
    }).listSalesInvoices({ page: 1, perPage: 5 });

    return {
      ok: true,
      error: null,
      administrationName: selected.name,
      invoiceSampleCount: invoices.length,
    };
  } catch (error) {
    const message =
      error instanceof MoneybirdApiError
        ? error.status === 401
          ? "Moneybird rejected the API token (unauthorized)."
          : error.message
        : error instanceof Error
          ? error.message
          : "Moneybird connection test failed.";
    return {
      ok: false,
      error: message,
      administrationName: null,
      invoiceSampleCount: null,
    };
  }
}

export async function listMoneybirdSalesInvoices(
  workspaceId: string,
  options?: { page?: number; perPage?: number; filter?: string },
): Promise<MoneybirdSalesInvoiceSummary[]> {
  const page = await listMoneybirdSalesInvoicesPage(workspaceId, options);
  return page.invoices;
}

/**
 * List one Moneybird sales-invoice page and resolve `totalPages` for the
 * filter. Moneybird never returns totals; we probe (with a short cache).
 */
export async function listMoneybirdSalesInvoicesPage(
  workspaceId: string,
  options?: { page?: number; perPage?: number; filter?: string },
): Promise<MoneybirdSalesInvoicesPage> {
  const { apiToken, administrationId } =
    await getMoneybirdCredentials(workspaceId);
  if (!apiToken) {
    throw new MoneybirdApiError(
      400,
      "",
      "Moneybird API token is not configured",
    );
  }
  if (!administrationId) {
    throw new MoneybirdApiError(
      400,
      "",
      "Moneybird administration id is not configured",
    );
  }
  const client = new MoneybirdClient({ apiToken, administrationId });
  // Moneybird defaults to `period:this_year` when filter is omitted. Passing an
  // explicit calendar-year range keeps that behaviour while still allowing
  // callers to override. Century-wide ranges (e.g. 2000..2099) return HTTP 400.
  const year = new Date().getFullYear();
  const filter =
    options?.filter?.trim() || `period:${year}0101..${year}1231`;
  const page = options?.page ?? 1;
  const perPage = options?.perPage ?? 50;
  const invoices = await client.listSalesInvoices({
    page,
    perPage,
    filter,
  });
  const hasMore = invoices.length >= perPage;
  const cacheKey = invoicePageCountCacheKey(
    workspaceId,
    administrationId,
    filter,
    perPage,
  );

  let totalPages: number;
  if (!hasMore) {
    totalPages = Math.max(1, page);
    writeCachedInvoicePageCount(cacheKey, totalPages);
  } else {
    const cached = readCachedInvoicePageCount(cacheKey);
    if (cached != null && cached > page) {
      totalPages = cached;
    } else {
      totalPages = await findLastInvoicePageNumber({
        perPage,
        knownFullPage: page,
        probe: async (probePage) => {
          const batch = await client.listSalesInvoices({
            page: probePage,
            perPage,
            filter,
          });
          return batch.length;
        },
      });
      writeCachedInvoicePageCount(cacheKey, totalPages);
    }
  }

  return {
    invoices,
    page,
    perPage,
    hasMore,
    totalPages,
  };
}

const BILLED_INVOICE_STATES = new Set([
  "open",
  "scheduled",
  "pending_payment",
  "reminded",
  "late",
  "paid",
]);

function eurosToCents(amount: string | null): number {
  if (!amount) return 0;
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

function monthKeyFromInvoiceDate(invoiceDate: string | null): string | null {
  if (!invoiceDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return null;
  return invoiceDate.slice(0, 7);
}

/**
 * Sum billed Moneybird sales invoices by calendar month for `year`.
 * Draft / uncollectible invoices are excluded. Expense is always 0 (purchase
 * invoices / outflows not wired yet).
 */
export async function getMoneybirdInvoiceRevenue(
  workspaceId: string,
  year: number,
): Promise<MoneybirdInvoiceRevenue> {
  const { apiToken, administrationId } =
    await getMoneybirdCredentials(workspaceId);
  if (!apiToken) {
    throw new MoneybirdApiError(
      400,
      "",
      "Moneybird API token is not configured",
    );
  }
  if (!administrationId) {
    throw new MoneybirdApiError(
      400,
      "",
      "Moneybird administration id is not configured",
    );
  }

  const client = new MoneybirdClient({ apiToken, administrationId });
  const filter = `period:${year}0101..${year}1231,state:open|scheduled|pending_payment|reminded|late|paid`;
  const incomeByMonth = new Map<string, number>();
  const perPage = 100;
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page++) {
    const batch: MoneybirdSalesInvoice[] = await client.listSalesInvoices({
      page,
      perPage,
      filter,
    });
    for (const invoice of batch) {
      if (!BILLED_INVOICE_STATES.has(invoice.state)) continue;
      const month = monthKeyFromInvoiceDate(invoice.invoiceDate);
      if (!month || !month.startsWith(`${year}-`)) continue;
      const cents = eurosToCents(invoice.totalPriceInclTax);
      incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + cents);
    }
    if (batch.length < perPage) break;
  }

  const months: MoneybirdInvoiceRevenue["months"] = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    months.push({
      month,
      incomeCents: incomeByMonth.get(month) ?? 0,
      expenseCents: 0,
    });
  }

  return { year, months };
}

function requireMoneybirdClient(workspaceId: string): Promise<{
  client: MoneybirdClient;
}> {
  return getMoneybirdCredentials(workspaceId).then(
    ({ apiToken, administrationId }) => {
      if (!apiToken) {
        throw new MoneybirdApiError(
          400,
          "",
          "Moneybird API token is not configured",
        );
      }
      if (!administrationId) {
        throw new MoneybirdApiError(
          400,
          "",
          "Moneybird administration id is not configured",
        );
      }
      return {
        client: new MoneybirdClient({ apiToken, administrationId }),
      };
    },
  );
}

/**
 * Full sales invoice for the finance detail panel: lines, tax totals,
 * recipient contact, and sender identity (when Moneybird provides one).
 */
export async function getMoneybirdSalesInvoiceDetail(
  workspaceId: string,
  invoiceId: string,
): Promise<MoneybirdSalesInvoiceDetail> {
  const id = invoiceId.trim();
  if (!id) {
    throw new MoneybirdApiError(400, "", "Invoice id is required");
  }

  const { client } = await requireMoneybirdClient(workspaceId);
  const [detail, taxRates] = await Promise.all([
    client.getSalesInvoice(id),
    client.listTaxRates().catch(() => []),
  ]);

  const taxPercentageByRateId = new Map<string, string | null>();
  for (const rate of taxRates) {
    taxPercentageByRateId.set(rate.id, rate.percentage);
  }
  const withTax = applyTaxPercentagesToDetail(detail, taxPercentageByRateId);

  let sender: MoneybirdSalesInvoiceDetail["sender"] = null;
  if (detail.identityId) {
    try {
      const identity = await client.getIdentity(detail.identityId);
      sender = {
        companyName: identity.companyName,
        firstName: identity.firstName,
        lastName: identity.lastName,
        address1: identity.address1,
        address2: identity.address2,
        zipcode: identity.zipcode,
        city: identity.city,
        country: identity.country,
        customerId: identity.customerId,
        phone: identity.phone,
        email: identity.email,
        chamberOfCommerce: identity.chamberOfCommerce,
        taxNumber: identity.taxNumber,
        bankAccountNumber: identity.bankAccountNumber,
      };
    } catch {
      sender = null;
    }
  }

  return {
    id: withTax.id,
    invoiceId: withTax.invoiceId,
    state: withTax.state,
    language: withTax.language,
    invoiceDate: withTax.invoiceDate,
    dueDate: withTax.dueDate,
    reference: withTax.reference,
    currency: withTax.currency,
    pricesAreInclTax: withTax.pricesAreInclTax,
    totalPriceInclTax: withTax.totalPriceInclTax,
    totalPriceExclTax: withTax.totalPriceExclTax,
    contactId: withTax.contactId,
    recipient: withTax.recipient,
    sender,
    lines: withTax.lines,
    taxTotals: withTax.taxTotals,
  };
}
