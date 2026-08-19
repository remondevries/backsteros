import type {
  MoneybirdInvoiceParty,
  MoneybirdSalesInvoiceDetail,
  MoneybirdSalesInvoiceSummary,
} from "@backsteros/contracts";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { colors } from "../../lib/theme";

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

function loadingLabel(): string {
  try {
    const locale =
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().locale
        : "";
    if (locale.toLowerCase().startsWith("nl")) return COPY_NL.loading;
  } catch {
    /* ignore */
  }
  return COPY_EN.loading;
}

function formatMoney(
  amount: string | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null || amount === "") return "—";
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return String(amount);
  const code = currency && currency.length === 3 ? currency : "EUR";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(numeric);
  } catch {
    return `${amount} ${code}`.trim();
  }
}

function formatTaxPercentage(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Number.isInteger(numeric) ? String(numeric) : String(numeric);
}

function partyDisplayName(
  party: MoneybirdInvoiceParty | null | undefined,
): string {
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
    <View style={styles.recipient}>
      {lines.map((line) => (
        <Text key={line} style={styles.partyLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function InvoiceSenderLogo() {
  return (
    <Svg
      width={44}
      height={64}
      viewBox="0 0 392 567"
      accessibilityLabel="Logo"
      style={styles.logo}
    >
      <Path
        d="M65.3691 255.859C178.684 377.557 242.205 441.311 255.934 447.122C269.675 452.933 295.598 426.914 333.706 369.066L388.409 423.969C310.251 523.318 262.956 570.787 246.511 566.387C221.853 559.778 11.5114 337.821 1.24264 320.22C-5.59386 308.492 15.7779 287.042 65.3691 255.859ZM2.36121 144.507L97.3779 49.1423C114.175 32.2835 133.29 19.8417 154.735 11.8169C176.18 3.78091 197.994 -0.15281 220.177 0.00453882C242.361 0.161887 264.041 4.51146 285.216 13.0757C306.274 21.5535 325.387 34.2543 341.387 50.4011C357.333 66.3526 369.926 85.3552 378.419 106.282C386.967 126.991 391.497 149.146 391.767 171.56C392.025 193.937 388.161 215.887 380.16 237.404C372.159 258.933 359.651 278.231 342.641 295.303L247.624 390.668L2.36121 144.507ZM257.59 272.139L272.316 257.359C283.436 246.199 291.627 234.493 296.879 222.254C302.131 210.014 304.729 197.842 304.651 185.727C304.578 173.616 301.952 161.776 296.762 150.228C291.577 138.674 283.99 127.89 274.013 117.876C264.259 108.086 253.514 100.584 241.784 95.3747C230.06 90.1709 218.162 87.5354 206.09 87.4567C194.018 87.3892 181.891 89.9855 169.69 95.2623C157.495 100.533 145.95 108.637 135.043 119.584L120.317 134.363C112.691 156.269 241.09 278.394 257.59 272.139Z"
        fill="#D4D4D4"
      />
    </Svg>
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
    <View style={styles.letterhead}>
      <InvoiceSenderLogo />
      {name ? <Text style={styles.letterheadName}>{name}</Text> : null}
      {addressLines.length > 0 ? (
        <View style={styles.letterheadBlock}>
          {addressLines.map((line) => (
            <Text key={line} style={styles.letterheadLine}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {hasContact ? (
        <View style={styles.letterheadBlock}>
          {phone ? (
            <Text style={styles.letterheadLine}>
              <Text style={styles.letterheadLabel}>{copy.phone}: </Text>
              {phone}
            </Text>
          ) : null}
          {email ? (
            <Text style={styles.letterheadLine}>
              <Text style={styles.letterheadLabel}>{copy.email}: </Text>
              {email}
            </Text>
          ) : null}
        </View>
      ) : null}
      {hasLegal ? (
        <View style={styles.letterheadBlock}>
          {kvk ? (
            <Text style={styles.letterheadLine}>
              <Text style={styles.letterheadLabel}>{copy.kvk}: </Text>
              {kvk}
            </Text>
          ) : null}
          {tax ? (
            <Text style={styles.letterheadLine}>
              <Text style={styles.letterheadLabel}>{copy.vatNumber}: </Text>
              {tax}
            </Text>
          ) : null}
          {bank ? (
            <Text style={styles.letterheadLine}>
              <Text style={styles.letterheadLabel}>{copy.bank}: </Text>
              {bank}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

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
    <View style={styles.sheet}>
      <View style={styles.header}>
        <RecipientAddress party={recipient} />
        <SenderLetterhead party={sender} copy={copy} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>
          {copy.title} {invoiceNumber}
        </Text>
        <View style={styles.meta}>
          <MetaRow
            label={`${copy.clientNumber}:`}
            value={recipient?.customerId?.trim() || "—"}
          />
          <MetaRow
            label={`${copy.invoiceDate}:`}
            value={detail.invoiceDate ?? summary?.invoiceDate ?? "—"}
          />
          <MetaRow
            label={`${copy.dueDate}:`}
            value={detail.dueDate ?? summary?.dueDate ?? "—"}
          />
          <MetaRow
            label={`${copy.reference}:`}
            value={detail.reference ?? summary?.reference ?? "—"}
          />
        </View>
      </View>

      <View style={styles.lines}>
        <View style={styles.linesHeader}>
          <Text style={[styles.linesTh, styles.linesDescCol]}>
            {copy.description}
          </Text>
          <Text style={[styles.linesTh, styles.linesNumCol]}>{copy.amount}</Text>
          {dutch ? (
            <Text style={[styles.linesTh, styles.linesNumCol]}>{copy.vat}</Text>
          ) : null}
          <Text style={[styles.linesTh, styles.linesNumCol]}>
            {copy.lineTotal}
          </Text>
        </View>
        {detail.lines.map((line) => {
          const pct = formatTaxPercentage(line.taxPercentage);
          return (
            <View key={line.id} style={styles.linesRow}>
              <Text style={[styles.linesTd, styles.linesDescCol]}>
                {line.description || "—"}
              </Text>
              <Text style={[styles.linesTd, styles.linesNumCol]}>
                {line.amount?.trim() || "—"}
              </Text>
              {dutch ? (
                <Text style={[styles.linesTd, styles.linesNumCol]}>
                  {pct != null ? `${pct}%` : "—"}
                </Text>
              ) : null}
              <Text style={[styles.linesTd, styles.linesNumCol]}>
                {formatMoney(line.totalPriceExclTax ?? line.price, currency)}
              </Text>
            </View>
          );
        })}
        {detail.lines.length === 0 ? (
          <Text style={styles.emptyLines}>—</Text>
        ) : null}
      </View>

      <View style={styles.totals}>
        <View style={styles.totalsRow}>
          <Text style={[styles.totalsLabel, styles.totalsLabelSubtotal]}>
            {copy.subtotal}
          </Text>
          <Text style={styles.totalsValue}>
            {formatMoney(
              detail.totalPriceExclTax ?? summary?.totalPriceExclTax,
              currency,
            )}
          </Text>
        </View>
        {detail.taxTotals.map((tax, index) => {
          const pct = formatTaxPercentage(tax.taxPercentage) ?? "?";
          return (
            <View
              key={`${tax.taxRateId ?? "tax"}-${index}`}
              style={styles.totalsRow}
            >
              <Text style={styles.totalsLabel}>{copy.taxLine(pct)}</Text>
              <Text style={styles.totalsValue}>
                {formatMoney(tax.taxAmount, currency)}
              </Text>
            </View>
          );
        })}
        <View style={[styles.totalsRow, styles.totalsRowGrand]}>
          <Text style={styles.totalsLabelGrand}>{copy.total}</Text>
          <Text style={styles.totalsValueGrand}>
            {formatMoney(
              detail.totalPriceInclTax ?? summary?.totalPriceInclTax,
              currency,
            )}
          </Text>
        </View>
      </View>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export type InvoiceDetailDocumentProps = {
  summary?: MoneybirdSalesInvoiceSummary | null;
  detail: MoneybirdSalesInvoiceDetail | null;
  loading?: boolean;
  error?: string | null;
};

/**
 * Mobile-owned invoice document layout mirroring desktop
 * `FinanceInvoiceDetailDocument` (letterhead, meta, lines, tax totals).
 */
export function InvoiceDetailDocument({
  summary = null,
  detail,
  loading = false,
  error = null,
}: InvoiceDetailDocumentProps) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  const [showLoader, setShowLoader] = useState(loading || !detail);

  useEffect(() => {
    if (loading || !detail) {
      setShowLoader(true);
      return;
    }
    setShowLoader(false);
  }, [loading, detail]);

  useEffect(() => {
    if (!showLoader) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, showLoader]);

  if (!summary && !detail && !loading && !error) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Select an invoice to view its details.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, showLoader ? styles.rootLoading : null]}>
      {error && !detail ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {showLoader ? (
        <View style={styles.loadingStage} accessibilityState={{ busy: true }}>
          <Animated.Text style={[styles.loadingPulse, { opacity: pulse }]}>
            {loadingLabel()}
          </Animated.Text>
        </View>
      ) : null}

      {!showLoader && detail ? (
        <InvoiceDetailSheet summary={summary} detail={detail} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 12,
  },
  rootLoading: {
    overflow: "hidden",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
  },
  error: {
    color: "#b42318",
    fontSize: 13,
  },
  loadingStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  loadingPulse: {
    color: colors.muted,
    fontSize: 14,
    letterSpacing: 0.01,
  },
  sheet: {
    gap: 28,
    width: "100%",
    paddingVertical: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    width: "100%",
  },
  recipient: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  partyLine: {
    color: colors.foreground,
    fontSize: 13,
    lineHeight: 20,
  },
  letterhead: {
    maxWidth: 220,
    alignItems: "flex-end",
    gap: 10,
  },
  logo: {
    marginBottom: 4,
  },
  letterheadName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "right",
  },
  letterheadBlock: {
    gap: 1,
    alignItems: "flex-end",
  },
  letterheadLine: {
    color: colors.foreground,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "right",
  },
  letterheadLabel: {
    fontWeight: "600",
  },
  titleBlock: {
    gap: 10,
    width: "100%",
  },
  title: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  meta: {
    gap: 3,
    alignSelf: "flex-start",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 20,
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 18,
    minWidth: 110,
  },
  metaValue: {
    color: colors.foreground,
    fontSize: 12.5,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
  },
  lines: {
    width: "100%",
    gap: 0,
  },
  linesHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  linesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  linesTh: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  linesTd: {
    color: colors.foreground,
    fontSize: 13,
    lineHeight: 18,
  },
  linesDescCol: {
    flex: 1,
    minWidth: 0,
    textAlign: "left",
  },
  linesNumCol: {
    width: 72,
    flexShrink: 0,
    textAlign: "right",
  },
  emptyLines: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 12,
  },
  totals: {
    alignSelf: "flex-end",
    width: "100%",
    maxWidth: 256,
    gap: 6,
    marginTop: 4,
  },
  totalsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 14,
  },
  totalsRowGrand: {
    alignItems: "center",
    marginTop: 2,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: "#f97316",
  },
  totalsLabel: {
    color: colors.foreground,
    fontSize: 13,
    lineHeight: 18,
  },
  totalsLabelSubtotal: {
    fontWeight: "700",
  },
  totalsValue: {
    color: colors.foreground,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  totalsLabelGrand: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  totalsValueGrand: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
});
