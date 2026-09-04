import {
  CONTACT_PHONE_LABELS,
  contactPhoneRowsForEditor,
  splitContactPhoneRows,
  type ContactPhoneEntry,
  type ContactPhoneLabel,
} from "@backsteros/contracts";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../lib/theme";
import { TextInput } from "./app-text-input";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";

export type ContactPhonesEditorProps = {
  phone: string;
  phones: ContactPhoneEntry[];
  disabled?: boolean;
  onChange: (next: { phone: string; phones: ContactPhoneEntry[] }) => void;
  onSave: (next: { phone: string | null; phones: ContactPhoneEntry[] }) => void;
};

const LABEL_OPTIONS: PropertyOption<ContactPhoneLabel>[] =
  CONTACT_PHONE_LABELS.map((value) => ({
    value,
    label:
      value === "personal" ? "Personal" : value === "work" ? "Work" : "Other",
  }));

function rowsKey(rows: ContactPhoneEntry[]): string {
  return JSON.stringify(rows);
}

function parentToRows(
  phone: string,
  phones: ContactPhoneEntry[],
): ContactPhoneEntry[] {
  return contactPhoneRowsForEditor({ phone, phones });
}

function rowsToParent(rows: ContactPhoneEntry[]): {
  phone: string;
  phones: ContactPhoneEntry[];
} {
  const split = splitContactPhoneRows(rows);
  return {
    phone: split.phone ?? "",
    phones: split.phones,
  };
}

function labelDisplay(label: ContactPhoneLabel): string {
  return (
    LABEL_OPTIONS.find((option) => option.value === label)?.label ?? "Other"
  );
}

/** Multi-phone editor — label chip + number, blur to save (desktop parity). */
export function ContactPhonesEditor({
  phone,
  phones,
  disabled = false,
  onChange,
  onSave,
}: ContactPhonesEditorProps) {
  const remoteRows = parentToRows(phone, phones);
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

  function setLocalRows(next: ContactPhoneEntry[]) {
    setRows(next);
    onChange(rowsToParent(next));
  }

  function commitRows(next: ContactPhoneEntry[]) {
    setRows(next);
    const parent = rowsToParent(next);
    onChange(parent);
    onSave({ phone: parent.phone || null, phones: parent.phones });
  }

  function updateRow(index: number, patch: Partial<ContactPhoneEntry>) {
    setLocalRows(
      rows.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function commitLabel(index: number, label: ContactPhoneLabel) {
    const next = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, label } : row,
    );
    setLocalRows(next);
    if (next[index]?.number.trim()) {
      commitRows(next);
    }
  }

  function commitNumber(index: number, number: string) {
    commitRows(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, number } : row,
      ),
    );
  }

  function removeRow(index: number) {
    if (rows.length <= 1) {
      commitRows([{ label: rows[0]?.label ?? "personal", number: "" }]);
      return;
    }
    commitRows(rows.filter((_, entryIndex) => entryIndex !== index));
  }

  function addRow() {
    if (disabled || rows.length >= 20) return;
    setLocalRows([...rows, { label: "personal", number: "" }]);
  }

  const chips = rows
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => {
      if (entry.number.trim()) return true;
      if (rows.length === 1) return true;
      return index === rows.length - 1;
    });

  return (
    <View style={styles.wrap}>
      {chips.map(({ entry, index }) => {
        const canRemove = Boolean(entry.number.trim()) || rows.length > 1;
        return (
          <View
            key={`phone-${index}`}
            style={[styles.row, !entry.number.trim() && styles.rowMuted]}
          >
            <Pressable
              disabled={disabled}
              onPress={() => setLabelIndex(index)}
              style={styles.labelChip}
              accessibilityRole="button"
              accessibilityLabel={`Phone label: ${labelDisplay(entry.label)}`}
            >
              <Text style={styles.labelText}>{labelDisplay(entry.label)}</Text>
            </Pressable>
            <TextInput
              value={entry.number}
              editable={!disabled}
              onChangeText={(value) => updateRow(index, { number: value })}
              onBlur={() => commitNumber(index, entry.number)}
              placeholder="+31 …"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              style={styles.value}
            />
            {canRemove ? (
              <Pressable
                disabled={disabled}
                onPress={() => removeRow(index)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove phone"
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
        accessibilityLabel="Add phone number"
      >
        <Text style={styles.addLabel}>+ Phone</Text>
      </Pressable>

      <PropertyOptionSheet
        visible={labelIndex != null}
        title="Phone label"
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
