"use client";

import { useEffect, useRef, useState } from "react";
import type {
  MoneybirdInvoiceParty,
  MoneybirdSalesInvoiceDetail,
  MoneybirdSalesInvoiceSummary,
} from "@backsteros/contracts";

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
  email: "Email",
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
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

function InvoiceSenderLogo() {
  return (
    <svg
      className="finance-invoice-doc__logo"
      width="392"
      height="567"
      viewBox="0 0 392 567"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Logo"
    >
      <path
        d="M65.3691 255.859C178.684 377.557 242.205 441.311 255.934 447.122C269.675 452.933 295.598 426.914 333.706 369.066L388.409 423.969C310.251 523.318 262.956 570.787 246.511 566.387C221.853 559.778 11.5114 337.821 1.24264 320.22C-5.59386 308.492 15.7779 287.042 65.3691 255.859ZM2.36121 144.507L97.3779 49.1423C114.175 32.2835 133.29 19.8417 154.735 11.8169C176.18 3.78091 197.994 -0.15281 220.177 0.00453882C242.361 0.161887 264.041 4.51146 285.216 13.0757C306.274 21.5535 325.387 34.2543 341.387 50.4011C357.333 66.3526 369.926 85.3552 378.419 106.282C386.967 126.991 391.497 149.146 391.767 171.56C392.025 193.937 388.161 215.887 380.16 237.404C372.159 258.933 359.651 278.231 342.641 295.303L247.624 390.668L2.36121 144.507ZM257.59 272.139L272.316 257.359C283.436 246.199 291.627 234.493 296.879 222.254C302.131 210.014 304.729 197.842 304.651 185.727C304.578 173.616 301.952 161.776 296.762 150.228C291.577 138.674 283.99 127.89 274.013 117.876C264.259 108.086 253.514 100.584 241.784 95.3747C230.06 90.1709 218.162 87.5354 206.09 87.4567C194.018 87.3892 181.891 89.9855 169.69 95.2623C157.495 100.533 145.95 108.637 135.043 119.584L120.317 134.363C112.691 156.269 241.09 278.394 257.59 272.139Z"
        fill="#D4D4D4"
      />
    </svg>
  );
}

function SenderLetterhead({
  party,
  copy,
}: {
  party: MoneybirdInvoiceParty | null | undefined;
  copy: InvoiceCopy;
}) {
  const name = partyDisplayName(party);
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
  const email = party?.email?.trim() || null;
  const kvk = party?.chamberOfCommerce?.trim() || null;
  const tax = party?.taxNumber?.trim() || null;
  const bank = party?.bankAccountNumber?.trim() || null;
  const hasContact = Boolean(phone || email);
  const hasLegal = Boolean(kvk || tax || bank);

  return (
    <div className="finance-invoice-doc__letterhead">
      <InvoiceSenderLogo />
      {name ? (
        <div className="finance-invoice-doc__letterhead-name">{name}</div>
      ) : null}
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
        <SenderLetterhead party={sender} copy={copy} />
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
            <th scope="col">{copy.description}</th>
            <th scope="col" className="finance-invoice-doc__col--num">
              {copy.amount}
            </th>
            {dutch ? (
              <th scope="col" className="finance-invoice-doc__col--num">
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
            return (
              <tr key={line.id}>
                <td>{line.description || "—"}</td>
                <td className="finance-invoice-doc__col--num">
                  {line.amount?.trim() || "—"}
                </td>
                {dutch ? (
                  <td className="finance-invoice-doc__col--num">
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
