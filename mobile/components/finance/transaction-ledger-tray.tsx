import type { FinancialTransaction } from "@backsteros/contracts";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChevronRightIcon } from "../chevron-right-icon";
import { TransactionLedgerPanel } from "./transaction-ledger-panel";

/** Remember open/closed across detail navigations in this session. */
let rememberedLedgerOpen = false;

type Props = {
  transaction: FinancialTransaction;
};

/**
 * iPad bottom ledger tray — desktop `finance-tx-ledger-tray` parity.
 * Collapsed chrome always visible; expands to show ledger fields + CSV.
 */
export function TransactionLedgerTray({ transaction }: Props) {
  const [open, setOpen] = useState(rememberedLedgerOpen);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      rememberedLedgerOpen = next;
      return next;
    });
  };

  return (
    <View
      style={[styles.tray, open ? styles.trayOpen : styles.trayCollapsed]}
      accessibilityLabel="Ledger"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? "Hide ledger" : "Show ledger"}
        onPress={toggle}
        style={({ pressed }) => [
          styles.chrome,
          pressed ? styles.chromePressed : null,
        ]}
      >
        <Text style={styles.title}>Ledger</Text>
        <View
          style={[
            styles.chevron,
            { transform: [{ rotate: open ? "90deg" : "-90deg" }] },
          ]}
        >
          <ChevronRightIcon size={14} color="rgba(255, 255, 255, 0.45)" />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <TransactionLedgerPanel transaction={transaction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.14)",
    // Deeper than the detail card — technical layer (desktop parity).
    backgroundColor: "rgba(0, 0, 0, 0.28)",
  },
  trayCollapsed: {
    flexGrow: 0,
    flexShrink: 0,
  },
  trayOpen: {
    flex: 1,
    minHeight: 160,
    maxHeight: "46%",
  },
  chrome: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  chromePressed: {
    opacity: 0.7,
  },
  title: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 13,
    fontWeight: "600",
  },
  chevron: {
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
});
