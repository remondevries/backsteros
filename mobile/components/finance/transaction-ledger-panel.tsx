import type { FinancialTransaction } from "@backsteros/contracts";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { formatCents } from "../../lib/finance-format";
import { colors, spacing } from "../../lib/theme";

type Props = {
  transaction: FinancialTransaction;
  /** When false, omit outer scroll (parent already scrolls). */
  scrollable?: boolean;
};

function formatNullableCents(
  cents: number | null | undefined,
  currency: string,
): string {
  if (cents == null) return "—";
  return formatCents(cents, currency);
}

function LedgerRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.dt}>{label}</Text>
      <Text style={styles.dd} selectable>
        {value}
      </Text>
    </View>
  );
}

/**
 * Read-only ledger fields + original CSV columns — desktop
 * `finance-tx-ledger-tray` body parity.
 */
export function TransactionLedgerPanel({
  transaction,
  scrollable = true,
}: Props) {
  const rawEntries = Object.entries(transaction.raw ?? {}).filter(
    ([, value]) => value.trim().length > 0,
  );

  const body = (
    <View style={styles.body}>
      <View style={styles.grid}>
        <LedgerRow label="Date" value={transaction.bookedOn} />
        <LedgerRow
          label="Amount"
          value={formatCents(transaction.amountCents, transaction.currency)}
        />
        <LedgerRow label="Payee" value={transaction.payee || "—"} />
        <LedgerRow
          label="Counterparty"
          value={transaction.counterparty || "—"}
        />
        <LedgerRow label="Memo" value={transaction.memo || "—"} />
        <LedgerRow
          label="Balance after"
          value={formatNullableCents(
            transaction.balanceAfterCents,
            transaction.currency,
          )}
        />
        <LedgerRow label="Code" value={transaction.sourceCode || "—"} />
        <LedgerRow label="Type" value={transaction.sourceType || "—"} />
        <LedgerRow
          label="External id"
          value={transaction.externalId || "—"}
        />
      </View>

      <View style={styles.rawBlock}>
        <Text style={styles.rawHeading}>Original CSV</Text>
        {rawEntries.length > 0 ? (
          <View style={styles.grid}>
            {rawEntries.map(([key, value]) => (
              <LedgerRow key={key} label={key} value={value} />
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>
            No original CSV columns stored for this row.
          </Text>
        )}
      </View>
    </View>
  );

  if (!scrollable) return body;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  body: {
    gap: 16,
    paddingHorizontal: spacing.screenX,
    paddingTop: 8,
  },
  grid: {
    gap: 10,
  },
  row: {
    gap: 2,
  },
  dt: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.02,
    textTransform: "uppercase",
  },
  dd: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  rawBlock: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  rawHeading: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 13,
    fontWeight: "600",
  },
  empty: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
