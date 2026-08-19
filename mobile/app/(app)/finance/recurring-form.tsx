import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  createFinancialRecurring,
  deleteFinancialRecurring,
  updateFinancialRecurring,
} from "../../../lib/finance-api";
import { TabStackHeaderTextButton } from "../../../lib/tab-stack-options";
import { colors, spacing } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useFinanceCategories } from "../../../lib/use-finance-categories";
import { useFinanceRecurrings } from "../../../lib/use-finance-recurrings";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";

function eurosToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function centsToEuros(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

export default function FinanceRecurringFormScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const client = useMobileApiClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const recurrings = useFinanceRecurrings();
  const categories = useFinanceCategories();
  const editing = recurrings.rows.find((row) => row.id === id) ?? null;

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !editing) return;
    setName(editing.name);
    setAmount(centsToEuros(editing.amountCents));
    setNextDate(editing.nextDate ?? "");
    setCategoryId(editing.categoryId);
    setArchived(editing.archived);
    setHydrated(true);
  }, [editing, hydrated]);

  const canSave = name.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        amountCents: eurosToCents(amount),
        nextDate: nextDate.trim() || null,
        categoryId,
        archived,
      };
      if (editing) {
        await updateFinancialRecurring(client, editing.id, input);
      } else {
        await createFinancialRecurring(client, input);
      }
      await recurrings.reload();
      router.back();
    } catch (reason) {
      Alert.alert(
        "Could not save recurring",
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!editing) return;
    Alert.alert("Delete recurring?", editing.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteFinancialRecurring(client, editing.id);
              await recurrings.reload();
              router.back();
            } catch (reason) {
              Alert.alert(
                "Could not delete",
                reason instanceof Error ? reason.message : String(reason),
              );
            }
          })();
        },
      },
    ]);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: editing ? "Edit recurring" : "New recurring",
      headerRight: () => (
        <TabStackHeaderTextButton
          label="Save"
          onPress={() => void save()}
          disabled={!canSave}
          loading={saving}
        />
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSave, editing, saving, navigation, name]);

  return (
    <KeyboardAvoidingView
      style={ui.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={ui.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholder="Recurring name"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Amount (€)</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Next date (YYYY-MM-DD)</Text>
        <TextInput
          value={nextDate}
          onChangeText={setNextDate}
          style={styles.input}
          autoCapitalize="none"
          placeholder="Optional"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          <Pressable
            onPress={() => setCategoryId(null)}
            style={[styles.chip, categoryId == null ? styles.chipActive : null]}
          >
            <Text
              style={[
                styles.chipLabel,
                categoryId == null ? styles.chipLabelActive : null,
              ]}
            >
              None
            </Text>
          </Pressable>
          {categories.rows
            .filter((row) => row.parentId == null)
            .map((row) => (
              <Pressable
                key={row.id}
                onPress={() => setCategoryId(row.id)}
                style={[
                  styles.chip,
                  categoryId === row.id ? styles.chipActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    categoryId === row.id ? styles.chipLabelActive : null,
                  ]}
                  numberOfLines={1}
                >
                  {row.name}
                </Text>
              </Pressable>
            ))}
        </View>

        <Pressable
          onPress={() => setArchived((prev) => !prev)}
          style={[styles.chip, archived ? styles.chipActive : null]}
        >
          <Text
            style={[
              styles.chipLabel,
              archived ? styles.chipLabelActive : null,
            ]}
          >
            {archived ? "Archived" : "Active"}
          </Text>
        </Pressable>

        {editing ? (
          <Pressable onPress={onDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteLabel}>Delete recurring</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.screenX,
    gap: 8,
    paddingBottom: 40,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    fontSize: 15,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxWidth: "100%",
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(238, 122, 71, 0.12)",
  },
  chipLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  chipLabelActive: {
    color: colors.accent,
    fontWeight: "600",
  },
  deleteBtn: {
    marginTop: 24,
    alignItems: "center",
    padding: 12,
  },
  deleteLabel: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "600",
  },
});
