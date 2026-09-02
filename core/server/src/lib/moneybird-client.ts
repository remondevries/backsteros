/**
 * Thin Moneybird REST client (API v2).
 * Moneybird IDs are large integers — always treat as strings.
 * @see https://developer.moneybird.com/introduction
 */

import { enqueueMoneybirdRequest } from "./moneybird-request-gate.js";

const MONEYBIRD_API_BASE = "https://moneybird.com/api/v2";

export type MoneybirdAdministration = {
  id: string;
  name: string;
  language: string | null;
  currency: string | null;
};

export type MoneybirdSalesInvoice = {
  id: string;
  invoiceId: string | null;
  state: string;
  invoiceDate: string | null;
  dueDate: string | null;
  reference: string | null;
  currency: string | null;
  totalPriceInclTax: string | null;
  totalPriceExclTax: string | null;
  contactId: string | null;
  contactName: string | null;
};

export type MoneybirdInvoiceParty = {
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  address1: string | null;
  address2: string | null;
  zipcode: string | null;
  city: string | null;
  country: string | null;
  customerId: string | null;
  phone: string | null;
  email: string | null;
  chamberOfCommerce: string | null;
  taxNumber: string | null;
  bankAccountNumber: string | null;
};

export type MoneybirdInvoiceLine = {
  id: string;
  description: string;
  amount: string | null;
  price: string | null;
  totalPriceExclTax: string | null;
  taxRateId: string | null;
  taxPercentage: string | null;
};

export type MoneybirdInvoiceTaxTotal = {
  taxRateId: string | null;
  taxableAmount: string | null;
  taxAmount: string | null;
  taxPercentage: string | null;
};

export type MoneybirdSalesInvoiceDetail = {
  id: string;
  invoiceId: string | null;
  state: string;
  language: string | null;
  identityId: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  reference: string | null;
  currency: string | null;
  pricesAreInclTax: boolean;
  totalPriceInclTax: string | null;
  totalPriceExclTax: string | null;
  contactId: string | null;
  recipient: MoneybirdInvoiceParty;
  lines: MoneybirdInvoiceLine[];
  taxTotals: MoneybirdInvoiceTaxTotal[];
};

export type MoneybirdIdentity = MoneybirdInvoiceParty & {
  id: string;
};

export type MoneybirdTaxRate = {
  id: string;
  percentage: string | null;
  name: string | null;
};

export type MoneybirdFinancialAccount = {
  id: string;
  type: string | null;
  name: string;
  identifier: string | null;
  currency: string | null;
  provider: string | null;
  moneybirdAccount: boolean;
  active: boolean;
};

export type MoneybirdFinancialMutationSyncId = {
  id: string;
  version: number | null;
};

export type MoneybirdFinancialMutation = {
  id: string;
  amount: string;
  code: string | null;
  date: string;
  message: string | null;
  contraAccountName: string | null;
  contraAccountNumber: string | null;
  state: string | null;
  settlementState: string | null;
  financialAccountId: string | null;
  currency: string | null;
  accountServicerTransactionId: string | null;
  version: number | null;
  raw: Record<string, unknown>;
};

export class MoneybirdApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, message?: string) {
    super(message ?? `Moneybird API error (${status})`);
    this.name = "MoneybirdApiError";
    this.status = status;
    this.body = body;
  }
}

function asStringId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function asOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

export function mapMoneybirdAdministration(
  raw: Record<string, unknown>,
): MoneybirdAdministration {
  const id = asStringId(raw.id);
  if (!id) {
    throw new Error("Moneybird administration missing id");
  }
  return {
    id,
    name: asOptionalString(raw.name) ?? "Administration",
    language: asOptionalString(raw.language),
    currency: asOptionalString(raw.currency),
  };
}

export function mapMoneybirdSalesInvoice(
  raw: Record<string, unknown>,
): MoneybirdSalesInvoice {
  const id = asStringId(raw.id);
  if (!id) {
    throw new Error("Moneybird sales invoice missing id");
  }
  const contact =
    raw.contact && typeof raw.contact === "object" && !Array.isArray(raw.contact)
      ? (raw.contact as Record<string, unknown>)
      : null;
  const contactName =
    asOptionalString(contact?.company_name) ??
    asOptionalString(contact?.firstname) ??
    asOptionalString(contact?.lastname) ??
    null;

  return {
    id,
    invoiceId: asOptionalString(raw.invoice_id),
    state: asOptionalString(raw.state) ?? "unknown",
    invoiceDate: asOptionalString(raw.invoice_date),
    dueDate: asOptionalString(raw.due_date),
    reference: asOptionalString(raw.reference),
    currency: asOptionalString(raw.currency),
    totalPriceInclTax: asOptionalString(raw.total_price_incl_tax),
    totalPriceExclTax: asOptionalString(raw.total_price_excl_tax),
    contactId: asStringId(raw.contact_id),
    contactName,
  };
}

function emptyParty(): MoneybirdInvoiceParty {
  return {
    companyName: null,
    firstName: null,
    lastName: null,
    address1: null,
    address2: null,
    zipcode: null,
    city: null,
    country: null,
    customerId: null,
    phone: null,
    email: null,
    chamberOfCommerce: null,
    taxNumber: null,
    bankAccountNumber: null,
  };
}

export function mapMoneybirdInvoiceParty(
  raw: Record<string, unknown> | null,
): MoneybirdInvoiceParty {
  if (!raw) return emptyParty();
  return {
    companyName: asOptionalString(raw.company_name),
    firstName: asOptionalString(raw.firstname),
    lastName: asOptionalString(raw.lastname),
    address1: asOptionalString(raw.address1),
    address2: asOptionalString(raw.address2),
    zipcode: asOptionalString(raw.zipcode),
    city: asOptionalString(raw.city),
    country: asOptionalString(raw.country),
    customerId: asOptionalString(raw.customer_id),
    phone: asOptionalString(raw.phone),
    email: asOptionalString(raw.email),
    chamberOfCommerce: asOptionalString(raw.chamber_of_commerce),
    taxNumber: asOptionalString(raw.tax_number),
    bankAccountNumber:
      asOptionalString(raw.bank_account_number) ??
      asOptionalString(raw.bank_account),
  };
}

export function mapMoneybirdIdentity(
  raw: Record<string, unknown>,
): MoneybirdIdentity {
  const id = asStringId(raw.id);
  if (!id) {
    throw new Error("Moneybird identity missing id");
  }
  return {
    id,
    ...mapMoneybirdInvoiceParty(raw),
  };
}

export function mapMoneybirdFinancialAccount(
  raw: Record<string, unknown>,
): MoneybirdFinancialAccount {
  const id = asStringId(raw.id);
  if (!id) {
    throw new Error("Moneybird financial account missing id");
  }
  return {
    id,
    type: asOptionalString(raw.type),
    name: asOptionalString(raw.name) ?? "Financial account",
    identifier: asOptionalString(raw.identifier),
    currency: asOptionalString(raw.currency),
    provider: asOptionalString(raw.provider),
    moneybirdAccount: Boolean(raw.moneybird_account),
    active: raw.active === undefined ? true : Boolean(raw.active),
  };
}

export function mapMoneybirdFinancialMutationSyncId(
  raw: Record<string, unknown>,
): MoneybirdFinancialMutationSyncId {
  const id = asStringId(raw.id);
  if (!id) {
    throw new Error("Moneybird financial mutation sync id missing id");
  }
  const versionRaw = raw.version;
  const version =
    typeof versionRaw === "number" && Number.isFinite(versionRaw)
      ? versionRaw
      : typeof versionRaw === "string" && versionRaw.trim()
        ? Number(versionRaw)
        : null;
  return {
    id,
    version: version != null && Number.isFinite(version) ? version : null,
  };
}

export function mapMoneybirdFinancialMutation(
  raw: Record<string, unknown>,
): MoneybirdFinancialMutation {
  const id = asStringId(raw.id);
  if (!id) {
    throw new Error("Moneybird financial mutation missing id");
  }
  const amount = asMoneyAmount(raw.amount) ?? asOptionalString(raw.amount);
  if (!amount) {
    throw new Error(`Moneybird financial mutation ${id} missing amount`);
  }
  const date = asOptionalString(raw.date);
  if (!date) {
    throw new Error(`Moneybird financial mutation ${id} missing date`);
  }
  const versionRaw = raw.version;
  const version =
    typeof versionRaw === "number" && Number.isFinite(versionRaw)
      ? versionRaw
      : typeof versionRaw === "string" && versionRaw.trim()
        ? Number(versionRaw)
        : null;
  return {
    id,
    amount,
    code: asOptionalString(raw.code),
    date,
    message: asOptionalString(raw.message),
    contraAccountName: asOptionalString(raw.contra_account_name),
    contraAccountNumber: asOptionalString(raw.contra_account_number),
    state: asOptionalString(raw.state),
    settlementState: asOptionalString(raw.settlement_state),
    financialAccountId: asStringId(raw.financial_account_id),
    currency: asOptionalString(raw.currency),
    accountServicerTransactionId: asOptionalString(
      raw.account_servicer_transaction_id,
    ),
    version: version != null && Number.isFinite(version) ? version : null,
    raw,
  };
}

export function mapMoneybirdTaxRate(
  raw: Record<string, unknown>,
): MoneybirdTaxRate {
  const id = asStringId(raw.id);
  if (!id) {
    throw new Error("Moneybird tax rate missing id");
  }
  return {
    id,
    percentage: asOptionalString(raw.percentage),
    name: asOptionalString(raw.name),
  };
}

function asMoneyAmount(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function mapMoneybirdInvoiceLine(
  raw: Record<string, unknown>,
  taxPercentageByRateId?: Map<string, string | null>,
): MoneybirdInvoiceLine {
  const id = asStringId(raw.id) ?? "0";
  const taxRateId = asStringId(raw.tax_rate_id);
  return {
    id,
    description: asOptionalString(raw.description) ?? "",
    amount: asOptionalString(raw.amount),
    price: asMoneyAmount(raw.price),
    totalPriceExclTax: asMoneyAmount(
      raw.total_price_excl_tax_with_discount ?? raw.total_price_excl_tax,
    ),
    taxRateId,
    taxPercentage:
      taxRateId && taxPercentageByRateId
        ? (taxPercentageByRateId.get(taxRateId) ?? null)
        : null,
  };
}

export function mapMoneybirdInvoiceTaxTotal(
  raw: Record<string, unknown>,
  taxPercentageByRateId?: Map<string, string | null>,
): MoneybirdInvoiceTaxTotal {
  const taxRateId = asStringId(raw.tax_rate_id);
  return {
    taxRateId,
    taxableAmount: asMoneyAmount(raw.taxable_amount),
    taxAmount: asMoneyAmount(raw.tax_amount),
    taxPercentage:
      taxRateId && taxPercentageByRateId
        ? (taxPercentageByRateId.get(taxRateId) ?? null)
        : null,
  };
}

export function mapMoneybirdSalesInvoiceDetail(
  raw: Record<string, unknown>,
  taxPercentageByRateId?: Map<string, string | null>,
): MoneybirdSalesInvoiceDetail {
  const id = asStringId(raw.id);
  if (!id) {
    throw new Error("Moneybird sales invoice missing id");
  }
  const contact =
    raw.contact && typeof raw.contact === "object" && !Array.isArray(raw.contact)
      ? (raw.contact as Record<string, unknown>)
      : null;
  const details = Array.isArray(raw.details) ? raw.details : [];
  const taxTotals = Array.isArray(raw.tax_totals) ? raw.tax_totals : [];

  return {
    id,
    invoiceId: asOptionalString(raw.invoice_id),
    state: asOptionalString(raw.state) ?? "unknown",
    language: asOptionalString(raw.language),
    identityId: asStringId(raw.identity_id),
    invoiceDate: asOptionalString(raw.invoice_date),
    dueDate: asOptionalString(raw.due_date),
    reference: asOptionalString(raw.reference),
    currency: asOptionalString(raw.currency),
    pricesAreInclTax: Boolean(raw.prices_are_incl_tax),
    totalPriceInclTax: asMoneyAmount(raw.total_price_incl_tax),
    totalPriceExclTax: asMoneyAmount(raw.total_price_excl_tax),
    contactId: asStringId(raw.contact_id) ?? asStringId(contact?.id),
    recipient: mapMoneybirdInvoiceParty(contact),
    lines: details
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
      .map((row) => mapMoneybirdInvoiceLine(row, taxPercentageByRateId)),
    taxTotals: taxTotals
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
      .map((row) => mapMoneybirdInvoiceTaxTotal(row, taxPercentageByRateId)),
  };
}

export function applyTaxPercentagesToDetail(
  detail: MoneybirdSalesInvoiceDetail,
  taxPercentageByRateId: Map<string, string | null>,
): MoneybirdSalesInvoiceDetail {
  return {
    ...detail,
    lines: detail.lines.map((line) => ({
      ...line,
      taxPercentage:
        line.taxRateId != null
          ? (taxPercentageByRateId.get(line.taxRateId) ?? null)
          : null,
    })),
    taxTotals: detail.taxTotals.map((total) => ({
      ...total,
      taxPercentage:
        total.taxRateId != null
          ? (taxPercentageByRateId.get(total.taxRateId) ?? null)
          : null,
    })),
  };
}

export type MoneybirdClientOptions = {
  apiToken: string;
  administrationId?: string | null;
  fetchImpl?: typeof fetch;
};

export class MoneybirdClient {
  private readonly apiToken: string;
  private readonly administrationId: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MoneybirdClientOptions) {
    this.apiToken = options.apiToken.trim();
    this.administrationId = options.administrationId?.trim() || null;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async requestJson<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    return enqueueMoneybirdRequest(async () => {
      const url = `${MONEYBIRD_API_BASE}${path}`;
      const response = await this.fetchImpl(url, {
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiToken}`,
          ...(init?.headers ?? {}),
        },
      });
      const body = await response.text();
      if (!response.ok) {
        throw new MoneybirdApiError(
          response.status,
          body,
          `Moneybird request failed (${response.status}) for ${path}`,
        );
      }
      if (!body) {
        return undefined as T;
      }
      return JSON.parse(body) as T;
    });
  }

  async listAdministrations(): Promise<MoneybirdAdministration[]> {
    const raw = await this.requestJson<unknown[]>("/administrations.json");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
      .map(mapMoneybirdAdministration);
  }

  private requireAdministrationId(): string {
    if (!this.administrationId) {
      throw new MoneybirdApiError(
        400,
        "",
        "Moneybird administration id is required",
      );
    }
    return this.administrationId;
  }

  async listSalesInvoices(options?: {
    page?: number;
    perPage?: number;
    filter?: string;
  }): Promise<MoneybirdSalesInvoice[]> {
    const administrationId = this.requireAdministrationId();
    const params = new URLSearchParams();
    if (options?.page) params.set("page", String(options.page));
    if (options?.perPage) params.set("per_page", String(options.perPage));
    if (options?.filter) params.set("filter", options.filter);
    const query = params.toString();
    const path = `/${encodeURIComponent(administrationId)}/sales_invoices.json${
      query ? `?${query}` : ""
    }`;
    const raw = await this.requestJson<unknown[]>(path);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
      .map(mapMoneybirdSalesInvoice);
  }

  async getContact(contactId: string): Promise<{
    id: string;
    chamberOfCommerce: string | null;
    taxNumber: string | null;
    address1: string | null;
    address2: string | null;
    zipcode: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    email: string | null;
  }> {
    const administrationId = this.requireAdministrationId();
    const path = `/${encodeURIComponent(administrationId)}/contacts/${encodeURIComponent(contactId)}.json`;
    const raw = await this.requestJson<Record<string, unknown>>(path);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new MoneybirdApiError(404, "", "Moneybird contact not found");
    }
    const id = asStringId(raw.id);
    if (!id) {
      throw new MoneybirdApiError(404, "", "Moneybird contact missing id");
    }
    return {
      id,
      chamberOfCommerce: asOptionalString(raw.chamber_of_commerce),
      taxNumber: asOptionalString(raw.tax_number),
      address1: asOptionalString(raw.address1),
      address2: asOptionalString(raw.address2),
      zipcode: asOptionalString(raw.zipcode),
      city: asOptionalString(raw.city),
      country: asOptionalString(raw.country),
      phone: asOptionalString(raw.phone),
      email: asOptionalString(raw.email),
    };
  }

  async getSalesInvoice(invoiceId: string): Promise<MoneybirdSalesInvoiceDetail> {
    const administrationId = this.requireAdministrationId();
    const path = `/${encodeURIComponent(administrationId)}/sales_invoices/${encodeURIComponent(invoiceId)}.json`;
    const raw = await this.requestJson<Record<string, unknown>>(path);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new MoneybirdApiError(404, "", "Moneybird sales invoice not found");
    }
    return mapMoneybirdSalesInvoiceDetail(raw);
  }

  async getIdentity(identityId: string): Promise<MoneybirdIdentity> {
    const administrationId = this.requireAdministrationId();
    const path = `/${encodeURIComponent(administrationId)}/identities/${encodeURIComponent(identityId)}.json`;
    const raw = await this.requestJson<Record<string, unknown>>(path);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new MoneybirdApiError(404, "", "Moneybird identity not found");
    }
    return mapMoneybirdIdentity(raw);
  }

  async listTaxRates(): Promise<MoneybirdTaxRate[]> {
    const administrationId = this.requireAdministrationId();
    const path = `/${encodeURIComponent(administrationId)}/tax_rates.json`;
    const raw = await this.requestJson<unknown[]>(path);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
      .map(mapMoneybirdTaxRate);
  }

  async listFinancialAccounts(): Promise<MoneybirdFinancialAccount[]> {
    const administrationId = this.requireAdministrationId();
    const path = `/${encodeURIComponent(administrationId)}/financial_accounts.json`;
    const raw = await this.requestJson<unknown[]>(path);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
      .map(mapMoneybirdFinancialAccount);
  }

  async listFinancialMutationSyncIds(options?: {
    financialAccountId?: string;
    period?: string;
    state?: string;
  }): Promise<MoneybirdFinancialMutationSyncId[]> {
    const administrationId = this.requireAdministrationId();
    const filterParts: string[] = [];
    filterParts.push(`period:${options?.period?.trim() || "this_year"}`);
    if (options?.state?.trim()) {
      filterParts.push(`state:${options.state.trim()}`);
    } else {
      filterParts.push("state:all");
    }
    if (options?.financialAccountId?.trim()) {
      filterParts.push(
        `financial_account_id:${options.financialAccountId.trim()}`,
      );
    }
    const params = new URLSearchParams();
    params.set("filter", filterParts.join(","));
    const path = `/${encodeURIComponent(administrationId)}/financial_mutations/synchronization.json?${params.toString()}`;
    const raw = await this.requestJson<unknown[]>(path);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
      .map(mapMoneybirdFinancialMutationSyncId);
  }

  /**
   * Fetch mutation details for the given ids (max 100 per Moneybird request).
   * Callers should chunk larger sets.
   */
  async fetchFinancialMutationsByIds(
    ids: string[],
  ): Promise<MoneybirdFinancialMutation[]> {
    const administrationId = this.requireAdministrationId();
    if (ids.length === 0) return [];
    if (ids.length > 100) {
      throw new Error(
        "Moneybird fetchFinancialMutationsByIds accepts at most 100 ids",
      );
    }
    const path = `/${encodeURIComponent(administrationId)}/financial_mutations/synchronization.json`;
    const raw = await this.requestJson<unknown[]>(path, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
      .map(mapMoneybirdFinancialMutation);
  }
}

/**
 * Moneybird list endpoints never return a total count. Probe with exponential
 * growth + binary search to find the last non-empty page.
 *
 * `probe(page)` must return the number of rows on that page.
 * `knownFullPage` is the highest page already known to contain a full page
 * (`length === perPage`), so the current list response can skip a re-fetch.
 */
export async function findLastInvoicePageNumber(options: {
  perPage: number;
  knownFullPage?: number;
  maxPage?: number;
  probe: (page: number) => Promise<number>;
}): Promise<number> {
  const perPage = Math.max(1, options.perPage);
  const maxPage = Math.max(1, options.maxPage ?? 10_000);
  let low = Math.max(0, options.knownFullPage ?? 0);

  if (low < 1) {
    const firstLength = await options.probe(1);
    if (firstLength === 0) return 1;
    if (firstLength < perPage) return 1;
    low = 1;
  }

  let high = Math.min(Math.max(low * 2, low + 1), maxPage);
  for (;;) {
    const length = await options.probe(high);
    if (length === 0) break;
    if (length < perPage) return high;
    low = high;
    if (high >= maxPage) return high;
    const next = Math.min(high * 2, maxPage);
    if (next === high) return high;
    high = next;
  }

  let left = low + 1;
  let right = high - 1;
  let lastNonEmpty = low;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const length = await options.probe(mid);
    if (length === 0) {
      right = mid - 1;
      continue;
    }
    lastNonEmpty = mid;
    if (length < perPage) return mid;
    left = mid + 1;
  }
  return Math.max(1, lastNonEmpty);
}
