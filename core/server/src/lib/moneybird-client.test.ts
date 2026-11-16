import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyTaxPercentagesToDetail,
  findLastInvoicePageNumber,
  mapMoneybirdAdministration,
  mapMoneybirdFinancialAccount,
  mapMoneybirdFinancialMutation,
  mapMoneybirdIdentity,
  mapMoneybirdPurchaseInvoice,
  mapMoneybirdSalesInvoice,
  mapMoneybirdSalesInvoiceDetail,
  MoneybirdClient,
} from "./moneybird-client.js";

describe("moneybird-client mappers", () => {
  it("maps administration ids as strings", () => {
    const mapped = mapMoneybirdAdministration({
      id: "107693607045039116",
      name: "BacksterOS BV",
      language: "nl",
      currency: "EUR",
    });
    assert.equal(mapped.id, "107693607045039116");
    assert.equal(mapped.name, "BacksterOS BV");
  });

  it("stringifies numeric administration ids without assuming precision", () => {
    const mapped = mapMoneybirdAdministration({
      id: 42,
      name: "Small id",
      language: null,
      currency: null,
    });
    assert.equal(mapped.id, "42");
  });

  it("maps sales invoices with contact company name", () => {
    const mapped = mapMoneybirdSalesInvoice({
      id: "1",
      invoice_id: "2026-001",
      state: "open",
      invoice_date: "2026-08-01",
      due_date: "2026-08-15",
      reference: "Project Alpha",
      currency: "EUR",
      total_price_incl_tax: "121.0",
      total_price_excl_tax: "100.0",
      contact_id: "99",
      contact: { company_name: "Acme BV" },
    });
    assert.equal(mapped.invoiceId, "2026-001");
    assert.equal(mapped.contactName, "Acme BV");
    assert.equal(mapped.totalPriceInclTax, "121.0");
  });

  it("maps EUR base totals, unpaid amounts, and payments on USD invoices", () => {
    const raw = {
      id: "11",
      state: "late",
      currency: "USD",
      total_price_incl_tax: "1210.00",
      total_price_excl_tax: "1000.00",
      total_price_incl_tax_base: "1089.00",
      total_price_excl_tax_base: "900.00",
      total_unpaid: "600.00",
      total_unpaid_base: "540.00",
      payments: [
        {
          id: 5,
          payment_date: "2026-05-02",
          price: "610.00",
          price_base: "549.00",
        },
        { price: "1.00" },
      ],
    };
    const list = mapMoneybirdSalesInvoice(raw);
    assert.equal(list.totalPriceExclTax, "1000.00");
    assert.equal(list.totalPriceExclTaxBase, "900.00");
    assert.equal(list.totalPriceInclTaxBase, "1089.00");
    assert.equal(list.totalUnpaid, "600.00");
    assert.equal(list.totalUnpaidBase, "540.00");
    assert.deepEqual(list.payments, [
      { id: "5", paymentDate: "2026-05-02", price: "610.00", priceBase: "549.00" },
    ]);

    const detail = mapMoneybirdSalesInvoiceDetail(raw);
    assert.equal(detail.totalPriceExclTaxBase, "900.00");
    assert.equal(detail.totalPriceInclTaxBase, "1089.00");
    assert.equal(detail.totalUnpaidBase, "540.00");
    assert.equal(detail.payments.length, 1);
  });

  it("leaves base fields null when Moneybird omits them", () => {
    const mapped = mapMoneybirdSalesInvoice({ id: "12", state: "open" });
    assert.equal(mapped.totalPriceExclTaxBase, null);
    assert.equal(mapped.totalUnpaidBase, null);
    assert.deepEqual(mapped.payments, []);
  });

  it("maps purchase invoices with unpaid base amounts", () => {
    const mapped = mapMoneybirdPurchaseInvoice({
      id: 77,
      state: "open",
      reference: "INV-9",
      date: "2026-04-01",
      due_date: "2026-04-30",
      currency: "USD",
      total_price_excl_tax_base: "90.5",
      total_unpaid: 110,
      total_unpaid_base: 99.25,
      payments: [{ id: 5, payment_date: "2026-04-10", price: 10, price_base: 9.5 }],
      contact: { id: "3", company_name: "Hosting Inc" },
    });
    assert.deepEqual(mapped.payments, [
      { id: "5", paymentDate: "2026-04-10", price: "10", priceBase: "9.5" },
    ]);
    assert.equal(mapped.id, "77");
    assert.equal(mapped.contactName, "Hosting Inc");
    assert.equal(mapped.contactId, "3");
    assert.equal(mapped.totalUnpaid, "110");
    assert.equal(mapped.totalUnpaidBase, "99.25");
    assert.equal(mapped.totalPriceExclTaxBase, "90.5");
  });

  it("maps sales invoice detail with contact, lines, and tax totals", () => {
    const mapped = mapMoneybirdSalesInvoiceDetail({
      id: "7",
      invoice_id: "2026-010",
      state: "open",
      language: "nl",
      identity_id: "55",
      invoice_date: "2026-03-01",
      due_date: "2026-03-31",
      reference: "Retainer",
      currency: "EUR",
      prices_are_incl_tax: false,
      total_price_incl_tax: 121,
      total_price_excl_tax: 100,
      contact_id: "99",
      contact: {
        company_name: "Acme BV",
        address1: "Main 1",
        zipcode: "1000 AA",
        city: "Amsterdam",
        country: "NL",
        customer_id: "C-12",
      },
      details: [
        {
          id: "1",
          description: "Consulting",
          amount: "2 x",
          price: "50.00",
          total_price_excl_tax_with_discount: 100,
          tax_rate_id: "tr21",
        },
      ],
      tax_totals: [
        {
          tax_rate_id: "tr21",
          taxable_amount: 100,
          tax_amount: 21,
        },
      ],
    });
    assert.equal(mapped.language, "nl");
    assert.equal(mapped.identityId, "55");
    assert.equal(mapped.recipient.companyName, "Acme BV");
    assert.equal(mapped.recipient.customerId, "C-12");
    assert.equal(mapped.lines.length, 1);
    assert.equal(mapped.lines[0]?.description, "Consulting");
    assert.equal(mapped.lines[0]?.totalPriceExclTax, "100");
    assert.equal(mapped.taxTotals[0]?.taxAmount, "21");

    const withTax = applyTaxPercentagesToDetail(
      mapped,
      new Map([["tr21", "21.0"]]),
    );
    assert.equal(withTax.lines[0]?.taxPercentage, "21.0");
    assert.equal(withTax.taxTotals[0]?.taxPercentage, "21.0");
  });

  it("maps identity sender fields", () => {
    const mapped = mapMoneybirdIdentity({
      id: "55",
      company_name: "BacksterOS BV",
      address1: "Office 2",
      zipcode: "2000 BB",
      city: "Rotterdam",
      country: "NL",
      chamber_of_commerce: "12345678",
      tax_number: "NL123456789B01",
      bank_account_number: "NL91ABNA0417164300",
    });
    assert.equal(mapped.companyName, "BacksterOS BV");
    assert.equal(mapped.chamberOfCommerce, "12345678");
    assert.equal(mapped.bankAccountNumber, "NL91ABNA0417164300");
  });
});

describe("MoneybirdClient", () => {
  it("lists administrations via bearer token", async () => {
    const calls: string[] = [];
    const client = new MoneybirdClient({
      apiToken: "test-token",
      fetchImpl: async (input, init) => {
        calls.push(String(input));
        assert.equal(
          (init?.headers as Record<string, string>).Authorization,
          "Bearer test-token",
        );
        return new Response(
          JSON.stringify([{ id: "42", name: "Demo", language: "en", currency: "EUR" }]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    const rows = await client.listAdministrations();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, "42");
    assert.match(calls[0] ?? "", /\/administrations\.json$/);
  });

  it("lists sales invoices for an administration", async () => {
    const client = new MoneybirdClient({
      apiToken: "test-token",
      administrationId: "42",
      fetchImpl: async (input) => {
        assert.match(String(input), /\/42\/sales_invoices\.json\?page=1&per_page=10$/);
        return new Response(
          JSON.stringify([
            {
              id: "7",
              invoice_id: "2026-002",
              state: "paid",
              total_price_incl_tax: "50.0",
              currency: "EUR",
              contact: { company_name: "Beta" },
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    const rows = await client.listSalesInvoices({ page: 1, perPage: 10 });
    assert.equal(rows[0]?.invoiceId, "2026-002");
    assert.equal(rows[0]?.contactName, "Beta");
  });

  it("lists purchase invoices from documents/purchase_invoices", async () => {
    const client = new MoneybirdClient({
      apiToken: "test-token",
      administrationId: "42",
      fetchImpl: async (input) => {
        assert.equal(
          String(input),
          "https://moneybird.com/api/v2/42/documents/purchase_invoices.json?page=2&per_page=100&filter=state%3Aopen%7Clate",
        );
        return new Response(
          JSON.stringify([
            { id: "1", state: "late", total_unpaid_base: "12.00" },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    const rows = await client.listPurchaseInvoices({
      page: 2,
      perPage: 100,
      filter: "state:open|late",
    });
    assert.equal(rows[0]?.totalUnpaidBase, "12.00");
  });

  it("fetches a sales invoice and identity", async () => {
    const client = new MoneybirdClient({
      apiToken: "test-token",
      administrationId: "42",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/sales_invoices/7.json")) {
          return new Response(
            JSON.stringify({
              id: "7",
              invoice_id: "2026-002",
              state: "open",
              language: "en",
              identity_id: "55",
              details: [],
              tax_totals: [],
              contact: { company_name: "Beta" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/identities/55.json")) {
          return new Response(
            JSON.stringify({
              id: "55",
              company_name: "Sender Co",
              bank_account_number: "NL00TEST",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/tax_rates.json")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      },
    });
    const invoice = await client.getSalesInvoice("7");
    assert.equal(invoice.invoiceId, "2026-002");
    assert.equal(invoice.language, "en");
    const identity = await client.getIdentity("55");
    assert.equal(identity.companyName, "Sender Co");
  });
});

describe("findLastInvoicePageNumber", () => {
  it("returns 1 for an empty first page", async () => {
    const total = await findLastInvoicePageNumber({
      perPage: 50,
      probe: async () => 0,
    });
    assert.equal(total, 1);
  });

  it("returns 1 when the first page is partial", async () => {
    const total = await findLastInvoicePageNumber({
      perPage: 50,
      probe: async (page) => (page === 1 ? 12 : 0),
    });
    assert.equal(total, 1);
  });

  it("discovers the last page via exponential + binary search", async () => {
    const probed: number[] = [];
    const total = await findLastInvoicePageNumber({
      perPage: 50,
      knownFullPage: 1,
      probe: async (page) => {
        probed.push(page);
        if (page < 24) return 50;
        if (page === 24) return 7;
        return 0;
      },
    });
    assert.equal(total, 24);
    assert.ok(probed.length < 24, "should not linearly scan every page");
  });

  it("maps financial accounts and mutations", () => {
    const account = mapMoneybirdFinancialAccount({
      id: "111",
      type: "bank_account",
      name: "Moneybird Betaalrekening",
      identifier: "NL00BUNQ123",
      currency: "EUR",
      provider: "moneybird",
      moneybird_account: true,
      active: true,
    });
    assert.equal(account.id, "111");
    assert.equal(account.identifier, "NL00BUNQ123");
    assert.equal(account.moneybirdAccount, true);

    const mutation = mapMoneybirdFinancialMutation({
      id: "222",
      amount: "-10.25",
      date: "2026-09-01",
      message: "Coffee",
      contra_account_name: "Cafe",
      contra_account_number: "NL11",
      state: "processed",
      financial_account_id: "111",
      currency: "EUR",
      version: 9,
    });
    assert.equal(mutation.id, "222");
    assert.equal(mutation.amount, "-10.25");
    assert.equal(mutation.contraAccountName, "Cafe");
    assert.equal(mutation.financialAccountId, "111");
  });
});
