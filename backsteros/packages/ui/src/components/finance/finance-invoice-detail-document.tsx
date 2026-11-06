"use client";

import { useEffect, useRef, useState } from "react";
import {
  getLemoFinanceEmail,
  LEMO_BANK_ACCOUNT,
  LEMO_COMPANY_NAME,
  type MoneybirdInvoiceParty,
  type MoneybirdSalesInvoiceDetail,
  type MoneybirdSalesInvoiceSummary,
} from "@backsteros/contracts";

import { LemoDesignMarkIcon } from "../icons/lemo-design-mark-icon.js";

const LOADER_FADE_OUT_MS = 200;

function loadingLabel(): string {
  if (
    typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("nl")
  ) {
    return COPY_NL.loading;
  }
  return COPY_EN.loading;
}

type InvoiceCopy = {
  title: string;
  clientNumber: string;
  invoiceDate: string;
  dueDate: string;
  reference: string;
  description: string;
  amount: string;
  vat: string;
  lineTotal: string;
  subtotal: string;
  total: string;
  phone: string;
  email: string;
  kvk: string;
  vatNumber: string;
  bank: string;
  taxLine: (pct: string) => string;
  loading: string;
};

const COPY_EN: InvoiceCopy = {
  title: "Invoice",
  clientNumber: "Client number",
  invoiceDate: "Invoice date",
  dueDate: "Due date",
  reference: "Reference",
  description: "Description",
  amount: "Amount",
  vat: "VAT",
  lineTotal: "Total",
  subtotal: "Subtotal",
  total: "Total",
  phone: "Phone",
  email: "E-mail",
  kvk: "CoC",
  vatNumber: "VAT",
  bank: "Bank",
  taxLine: (pct) => `${pct}% VAT`,
  loading: "Loading invoice…",
};

const COPY_NL: InvoiceCopy = {
  title: "Factuur",
  clientNumber: "Klantnummer",
  invoiceDate: "Factuurdatum",
  dueDate: "Vervaldatum",
  reference: "Kenmerk",
  description: "Omschrijving",
  amount: "Aantal",
  vat: "BTW",
  lineTotal: "Bedrag",
  subtotal: "Subtotaal",
  total: "Totaal",
  phone: "Telefoon",
  email: "E-mail",
  kvk: "KVK",
  vatNumber: "Btw",
  bank: "Bank",
  taxLine: (pct) => `${pct}% btw`,
  loading: "Factuur laden…",
};

function invoiceCopy(language: string | null | undefined): InvoiceCopy {
  return language?.trim().toLowerCase() === "nl" ? COPY_NL : COPY_EN;
}

function isDutch(language: string | null | undefined): boolean {
  return language?.trim().toLowerCase() === "nl";
}

function formatMoney(
  amount: string | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null || amount === "") return "—";
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return String(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency && currency.length === 3 ? currency : "EUR",
    }).format(numeric);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

function formatTaxPercentage(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Number.isInteger(numeric) ? String(numeric) : String(numeric);
}

function partyDisplayName(party: MoneybirdInvoiceParty | null | undefined): string {
  if (!party) return "";
  const company = party.companyName?.trim();
  if (company) return company;
  return [party.firstName, party.lastName].filter(Boolean).join(" ").trim();
}

function RecipientAddress({
  party,
}: {
  party: MoneybirdInvoiceParty | null | undefined;
}) {
  if (!party) return null;
  const name = partyDisplayName(party);
  const cityLine = [party.zipcode, party.city].filter(Boolean).join(" ").trim();
  const lines = [
    name,
    party.address1,
    party.address2,
    cityLine || null,
    party.country,
  ].filter((line): line is string => Boolean(line?.trim()));

  if (lines.length === 0) return null;

  return (
    <div className="finance-invoice-doc__party finance-invoice-doc__recipient">
      {lines.map((line, index) => (
        <div
          key={`${index}-${line}`}
          className={
            index === 0 && name
              ? "finance-invoice-doc__party-name"
              : undefined
          }
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function SenderLetterhead({
  party,
  copy,
  language,
}: {
  party: MoneybirdInvoiceParty | null | undefined;
  copy: InvoiceCopy;
  language: string | null | undefined;
}) {
  // Portal parity: mark above company name; force finance inbox + Adyen IBAN.
  const name = partyDisplayName(party) || LEMO_COMPANY_NAME;
  const cityLine = [party?.zipcode, party?.city]
    .filter(Boolean)
    .join(" ")
    .trim();
  const addressLines = [
    party?.address1,
    party?.address2,
    cityLine || null,
  ].filter((line): line is string => Boolean(line?.trim()));

  const phone = party?.phone?.trim() || null;
  const email = getLemoFinanceEmail(language);
  const kvk = party?.chamberOfCommerce?.trim() || null;
  const tax = party?.taxNumber?.trim() || null;
  const bank = LEMO_BANK_ACCOUNT;
  const hasContact = Boolean(phone || email);
  const hasLegal = Boolean(kvk || tax || bank);

  return (
    <div className="finance-invoice-doc__letterhead">
      <div
        className="finance-invoice-doc__brand"
        role="img"
        aria-label={name}
      >
        <LemoDesignMarkIcon
          className="finance-invoice-doc__logo"
          aria-hidden="true"
        />
      </div>
      <div className="finance-invoice-doc__letterhead-name">{name}</div>
      {addressLines.length > 0 ? (
        <div className="finance-invoice-doc__letterhead-block">
          {addressLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}
      {hasContact ? (
        <div className="finance-invoice-doc__letterhead-block">
          {phone ? (
            <div>
              <span className="finance-invoice-doc__letterhead-label">
                {copy.phone}:
              </span>{" "}
              {phone}
            </div>
          ) : null}
          {email ? (
            <div>
              <span className="finance-invoice-doc__letterhead-label">
                {copy.email}:
              </span>{" "}
              {email}
            </div>
          ) : null}
        </div>
      ) : null}
      {hasLegal ? (
        <div className="finance-invoice-doc__letterhead-block">
          {kvk ? (
            <div>
              <span className="finance-invoice-doc__letterhead-label">
                {copy.kvk}:
              </span>{" "}
              {kvk}
            </div>
          ) : null}
          {tax ? (
            <div>
              <span className="finance-invoice-doc__letterhead-label">
                {copy.vatNumber}:
              </span>{" "}
              {tax}
            </div>
          ) : null}
          {bank ? (
            <div>
              <span className="finance-invoice-doc__letterhead-label">
                {copy.bank}:
              </span>{" "}
              {bank}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type FinanceInvoiceDetailDocumentProps = {
  summary: MoneybirdSalesInvoiceSummary | null;
  detail: MoneybirdSalesInvoiceDetail | null;
  loading?: boolean;
  error?: string | null;
};

type DetailView =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "loader-exit" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      detail: MoneybirdSalesInvoiceDetail;
      summary: MoneybirdSalesInvoiceSummary | null;
    };

function InvoiceDetailSheet({
  summary,
  detail,
}: {
  summary: MoneybirdSalesInvoiceSummary | null;
  detail: MoneybirdSalesInvoiceDetail;
}) {
  const language = detail.language ?? null;
  const copy = invoiceCopy(language);
  const dutch = isDutch(language);
  const currency = detail.currency ?? summary?.currency ?? "EUR";
  const invoiceNumber =
    detail.invoiceId ?? summary?.invoiceId ?? (dutch ? "Concept" : "Draft");
  const recipient = detail.recipient ?? null;
  const sender = detail.sender ?? null;

  return (
    <div
      className="finance-invoice-doc__sheet finance-invoice-doc__sheet--fade-in"
      key={detail.id}
    >
      <header className="finance-invoice-doc__header">
        <RecipientAddress party={recipient} />
        <SenderLetterhead party={sender} copy={copy} language={language} />
      </header>

      <div className="finance-invoice-doc__title-block">
        <h2 className="finance-invoice-doc__title">
          {copy.title} {invoiceNumber}
        </h2>
        <dl className="finance-invoice-doc__meta">
          <div className="finance-invoice-doc__meta-row">
            <dt>{copy.clientNumber}:</dt>
            <dd>{recipient?.customerId?.trim() || "—"}</dd>
          </div>
          <div className="finance-invoice-doc__meta-row">
            <dt>{copy.invoiceDate}:</dt>
            <dd>{detail.invoiceDate ?? summary?.invoiceDate ?? "—"}</dd>
          </div>
          <div className="finance-invoice-doc__meta-row">
            <dt>{copy.dueDate}:</dt>
            <dd>{detail.dueDate ?? summary?.dueDate ?? "—"}</dd>
          </div>
          <div className="finance-invoice-doc__meta-row">
            <dt>{copy.reference}:</dt>
            <dd>{detail.reference ?? summary?.reference ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <table className="finance-invoice-doc__lines">
        <thead>
          <tr>
            <th scope="col" className="finance-invoice-doc__col--qty">
              {copy.amount}
            </th>
            <th scope="col" className="finance-invoice-doc__col--desc">
              {copy.description}
            </th>
            {dutch ? (
              <th
                scope="col"
                className="finance-invoice-doc__col--num finance-invoice-doc__col--vat"
              >
                {copy.vat}
              </th>
            ) : null}
            <th scope="col" className="finance-invoice-doc__col--num">
              {copy.lineTotal}
            </th>
          </tr>
        </thead>
        <tbody>
          {detail.lines.map((line) => {
            const pct = formatTaxPercentage(line.taxPercentage);
            const qty = line.amount?.trim() || "—";
            return (
              <tr key={line.id}>
                <td className="finance-invoice-doc__col--qty">{qty}</td>
                <td className="finance-invoice-doc__desc">
                  <span className="finance-invoice-doc__line-qty">{qty}</span>{" "}
                  <span className="finance-invoice-doc__line-desc">
                    {line.description.length > 0 ? line.description : "\u00a0"}
                  </span>
                </td>
                {dutch ? (
                  <td className="finance-invoice-doc__col--num finance-invoice-doc__col--vat">
                    {pct != null ? `${pct}%` : "—"}
                  </td>
                ) : null}
                <td className="finance-invoice-doc__col--num">
                  {formatMoney(line.totalPriceExclTax ?? line.price, currency)}
                </td>
              </tr>
            );
          })}
          {detail.lines.length === 0 ? (
            <tr>
              <td
                colSpan={dutch ? 4 : 3}
                className="finance-invoice-doc__empty-lines"
              >
                —
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="finance-invoice-doc__totals">
        <div className="finance-invoice-doc__totals-row">
          <span className="finance-invoice-doc__totals-label finance-invoice-doc__totals-label--subtotal">
            {copy.subtotal}
          </span>
          <span className="finance-invoice-doc__totals-value">
            {formatMoney(
              detail.totalPriceExclTax ?? summary?.totalPriceExclTax,
              currency,
            )}
          </span>
        </div>
        {detail.taxTotals.map((tax, index) => {
          const pct = formatTaxPercentage(tax.taxPercentage) ?? "?";
          return (
            <div
              key={`${tax.taxRateId ?? "tax"}-${index}`}
              className="finance-invoice-doc__totals-row"
            >
              <span className="finance-invoice-doc__totals-label">
                {copy.taxLine(pct)}
              </span>
              <span className="finance-invoice-doc__totals-value">
                {formatMoney(tax.taxAmount, currency)}
              </span>
            </div>
          );
        })}
        <div className="finance-invoice-doc__totals-row finance-invoice-doc__totals-row--grand">
          <span className="finance-invoice-doc__totals-label">{copy.total}</span>
          <span className="finance-invoice-doc__totals-value">
            {formatMoney(
              detail.totalPriceInclTax ?? summary?.totalPriceInclTax,
              currency,
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export function FinanceInvoiceDetailDocument({
  summary,
  detail,
  loading = false,
  error = null,
}: FinanceInvoiceDetailDocumentProps) {
  const [view, setView] = useState<DetailView>({ kind: "empty" });
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    if (!summary && !detail) {
      wasLoadingRef.current = false;
      setView({ kind: "empty" });
      return;
    }

    if (error && !detail) {
      wasLoadingRef.current = false;
      setView({ kind: "error", message: error });
      return;
    }

    if (loading || !detail) {
      wasLoadingRef.current = true;
      setView({ kind: "loading" });
      return;
    }

    if (wasLoadingRef.current) {
      wasLoadingRef.current = false;
      setView({ kind: "loader-exit" });
      const timer = window.setTimeout(() => {
        setView({ kind: "ready", detail, summary });
      }, LOADER_FADE_OUT_MS);
      return () => window.clearTimeout(timer);
    }

    setView({ kind: "ready", detail, summary });
  }, [summary, detail, loading, error]);

  if (view.kind === "empty") {
    return (
      <div className="finance-categories-view__detail-empty">
        Select an invoice to view its details.
      </div>
    );
  }

  const showLoader = view.kind === "loading" || view.kind === "loader-exit";

  return (
    <div
      className={
        showLoader
          ? "finance-invoice-doc finance-invoice-doc--loading"
          : "finance-invoice-doc"
      }
    >
      {view.kind === "error" ? (
        <p className="finance-invoice-doc__error" role="alert">
          {view.message}
        </p>
      ) : null}

      {showLoader ? (
        <div
          className={
            view.kind === "loader-exit"
              ? "finance-invoice-doc__loading-stage finance-invoice-doc__loading-stage--exit"
              : "finance-invoice-doc__loading-stage"
          }
          aria-busy="true"
          aria-live="polite"
        >
          <p className="finance-invoice-doc__loading-pulse">{loadingLabel()}</p>
        </div>
      ) : null}

      {view.kind === "ready" ? (
        <InvoiceDetailSheet summary={view.summary} detail={view.detail} />
      ) : null}
    </div>
  );
}
