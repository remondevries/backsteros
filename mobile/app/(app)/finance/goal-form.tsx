import type {
  FinancialGoalListing,
  FinancialGoalSavingMode,
} from "@backsteros/contracts";
import { useNavigation } from "expo-router/react-navigation";
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
  createFinancialGoalViaPowerSyncOrApi,
  deleteFinancialGoalViaPowerSyncOrApi,
  updateFinancialGoalViaPowerSyncOrApi,
} from "../../../lib/finance-mutations";
import { GOAL_LISTING_LABELS } from "../../../lib/finance-goals";
import { TabStackHeaderTextButton } from "../../../lib/tab-stack-options";
import { colors, spacing } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useFinanceGoals } from "../../../lib/use-finance-goals";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";
import { useMobilePowerSync } from "../../../lib/powersync-context";

const LISTING_OPTIONS: FinancialGoalListing[] = [
  "active",
  "ready_to_spend",
  "archive",
];
const MODE_OPTIONS: FinancialGoalSavingMode[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

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

export default function FinanceGoalFormScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goals = useFinanceGoals();
  const editing = goals.rows.find((row) => row.id === id) ?? null;

  const [name, setName] = useState("");
  const [listing, setListing] = useState<FinancialGoalListing>("active");
  const [goalAmount, setGoalAmount] = useState("");
  const [contribution, setContribution] = useState("");
  const [savingMode, setSavingMode] =
    useState<FinancialGoalSavingMode>("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !editing) return;
    setName(editing.name);
    setListing(editing.listing);
    setGoalAmount(centsToEuros(editing.goalAmountCents));
    setContribution(centsToEuros(editing.contributionCents));
    setSavingMode(editing.savingMode);
    setStartDate(editing.startDate ?? "");
    setEndDate(editing.endDate ?? "");
    setHydrated(true);
  }, [editing, hydrated]);

  const canSave = name.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        listing,
        goalAmountCents: eurosToCents(goalAmount),
        contributionCents: eurosToCents(contribution),
        savingMode,
        startDate: startDate.trim() || null,
        endDate: endDate.trim() || null,
      };
      if (editing) {
        await updateFinancialGoalViaPowerSyncOrApi(
          client,
          powerSync,
          editing.id,
          input,
        );
      } else {
        await createFinancialGoalViaPowerSyncOrApi(client, powerSync, input);
      }
      await goals.reload();
      router.back();
    } catch (reason) {
      Alert.alert(
        "Could not save goal",
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!editing) return;
    Alert.alert("Delete goal?", editing.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteFinancialGoalViaPowerSyncOrApi(
                client,
                powerSync,
                editing.id,
              );
              await goals.reload();
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
      title: editing ? "Edit goal" : "New goal",
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
  }, [canSave, editing, saving, navigation, name, listing, goalAmount]);

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
          placeholder="Goal name"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Listing</Text>
        <View style={styles.chips}>
          {LISTING_OPTIONS.map((option) => (
            <Pressable
              key={option}
              onPress={() => setListing(option)}
              style={[
                styles.chip,
                listing === option ? styles.chipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  listing === option ? styles.chipLabelActive : null,
                ]}
              >
                {GOAL_LISTING_LABELS[option]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Target (€)</Text>
        <TextInput
          value={goalAmount}
          onChangeText={setGoalAmount}
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Contribution (€)</Text>
        <TextInput
          value={contribution}
          onChangeText={setContribution}
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Saving mode</Text>
        <View style={styles.chips}>
          {MODE_OPTIONS.map((option) => (
            <Pressable
              key={option}
              onPress={() => setSavingMode(option)}
              style={[
                styles.chip,
                savingMode === option ? styles.chipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  savingMode === option ? styles.chipLabelActive : null,
                ]}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
        <TextInput
          value={startDate}
          onChangeText={setStartDate}
          style={styles.input}
          autoCapitalize="none"
          placeholder="Optional"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>End date (YYYY-MM-DD)</Text>
        <TextInput
          value={endDate}
          onChangeText={setEndDate}
          style={styles.input}
          autoCapitalize="none"
          placeholder="Optional"
          placeholderTextColor={colors.muted}
        />

        {editing ? (
          <Pressable onPress={onDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteLabel}>Delete goal</Text>
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
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(238, 122, 71, 0.12)",
  },
  chipLabel: {
    color: colors.muted,
    fontSize: 13,
    textTransform: "capitalize",
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
