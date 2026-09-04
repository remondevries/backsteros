import {
  CONTACT_EMAIL_LABELS,
  contactEmailRowsForEditor,
  splitContactEmailRows,
  type ContactEmailEntry,
  type ContactEmailLabel,
} from "@backsteros/contracts";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../lib/theme";
import { TextInput } from "./app-text-input";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";

export type ContactEmailsEditorProps = {
  email: string;
  emails: ContactEmailEntry[];
  disabled?: boolean;
  onChange: (next: { email: string; emails: ContactEmailEntry[] }) => void;
  onSave: (next: { email: string | null; emails: ContactEmailEntry[] }) => void;
};

const LABEL_OPTIONS: PropertyOption<ContactEmailLabel>[] =
  CONTACT_EMAIL_LABELS.map((value) => ({
    value,
    label:
      value === "personal" ? "Personal" : value === "work" ? "Work" : "Other",
  }));

function rowsKey(rows: ContactEmailEntry[]): string {
  return JSON.stringify(rows);
}

function parentToRows(
  email: string,
  emails: ContactEmailEntry[],
): ContactEmailEntry[] {
  return contactEmailRowsForEditor({ email, emails });
}

function rowsToParent(rows: ContactEmailEntry[]): {
  email: string;
  emails: ContactEmailEntry[];
} {
  const split = splitContactEmailRows(rows);
  return {
    email: split.email ?? "",
    emails: split.emails,
  };
}

function labelDisplay(label: ContactEmailLabel): string {
  return (
    LABEL_OPTIONS.find((option) => option.value === label)?.label ?? "Other"
  );
}

/** Multi-email editor — label chip + address, blur to save (desktop parity). */
export function ContactEmailsEditor({
  email,
  emails,
  disabled = false,
  onChange,
  onSave,
}: ContactEmailsEditorProps) {
  const remoteRows = parentToRows(email, emails);
  const remoteKey = rowsKey(remoteRows);
  const [rows, setRows] = useState(remoteRows);
  const [rowsSource, setRowsSource] = useState(remoteKey);
  const [labelIndex, setLabelIndex] = useState<number | null>(null);

  if (remoteKey !== rowsSource) {
    setRowsSource(remoteKey);
    if (rowsKey(rows) === rowsSource) {
      setRows(remoteRows);
    }
  }

  function setLocalRows(next: ContactEmailEntry[]) {
    setRows(next);
    onChange(rowsToParent(next));
  }

  function commitRows(next: ContactEmailEntry[]) {
    setRows(next);
    const parent = rowsToParent(next);
    onChange(parent);
    onSave({ email: parent.email || null, emails: parent.emails });
  }

  function updateRow(index: number, patch: Partial<ContactEmailEntry>) {
    setLocalRows(
      rows.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function commitLabel(index: number, label: ContactEmailLabel) {
    const next = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, label } : row,
    );
    setLocalRows(next);
    if (next[index]?.address.trim()) {
      commitRows(next);
    }
  }

  function commitAddress(index: number, address: string) {
    commitRows(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, address } : row,
      ),
    );
  }

  function removeRow(index: number) {
    if (rows.length <= 1) {
      commitRows([{ label: rows[0]?.label ?? "personal", address: "" }]);
      return;
    }
    commitRows(rows.filter((_, entryIndex) => entryIndex !== index));
  }

  function addRow() {
    if (disabled || rows.length >= 20) return;
    setLocalRows([...rows, { label: "personal", address: "" }]);
  }

  const chips = rows
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => {
      if (entry.address.trim()) return true;
      if (rows.length === 1) return true;
      return index === rows.length - 1;
    });

  return (
    <View style={styles.wrap}>
      {chips.map(({ entry, index }) => {
        const canRemove = Boolean(entry.address.trim()) || rows.length > 1;
        return (
          <View
            key={`email-${index}`}
            style={[styles.row, !entry.address.trim() && styles.rowMuted]}
          >
            <Pressable
              disabled={disabled}
              onPress={() => setLabelIndex(index)}
              style={styles.labelChip}
              accessibilityRole="button"
              accessibilityLabel={`Email label: ${labelDisplay(entry.label)}`}
            >
              <Text style={styles.labelText}>{labelDisplay(entry.label)}</Text>
            </Pressable>
            <TextInput
              value={entry.address}
              editable={!disabled}
              onChangeText={(value) => updateRow(index, { address: value })}
              onBlur={() => commitAddress(index, entry.address)}
              placeholder="name@example.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.value}
            />
            {canRemove ? (
              <Pressable
                disabled={disabled}
                onPress={() => removeRow(index)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove email"
              >
                <Text style={styles.remove}>×</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      <Pressable
        disabled={disabled || rows.length >= 20}
        onPress={addRow}
        style={styles.add}
        accessibilityRole="button"
        accessibilityLabel="Add email address"
      >
        <Text style={styles.addLabel}>+ Email</Text>
      </Pressable>

      <PropertyOptionSheet
        visible={labelIndex != null}
        title="Email label"
        options={LABEL_OPTIONS}
        selected={
          labelIndex != null ? (rows[labelIndex]?.label ?? "personal") : "personal"
        }
        onSelect={(value) => {
          const index = labelIndex;
          setLabelIndex(null);
          if (index != null) commitLabel(index, value);
        }}
        onClose={() => setLabelIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowMuted: { opacity: 0.7 },
  labelChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  labelText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  value: {
    flex: 1,
    color: colors.foreground,
    fontSize: 15,
    paddingVertical: 2,
  },
  remove: {
    color: colors.muted,
    fontSize: 22,
    lineHeight: 24,
    paddingHorizontal: 4,
  },
  add: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  addLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
});
