import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
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

import { TabStackHeaderTextButton } from "../../../lib/tab-stack-options";
import {
  createFinancialCategoryViaPowerSyncOrApi,
  updateFinancialCategoryViaPowerSyncOrApi,
} from "../../../lib/finance-mutations";
import { colors, spacing } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useFinanceCategories } from "../../../lib/use-finance-categories";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";
import { useMobilePowerSync } from "../../../lib/powersync-context";

export default function FinanceCategoryFormScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const categories = useFinanceCategories();
  const editing = categories.rows.find((row) => row.id === id) ?? null;

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !editing) return;
    setName(editing.name);
    setParentId(editing.parentId);
    setHydrated(true);
  }, [editing, hydrated]);

  // Parents are roots only (two-level tree); a category cannot parent itself.
  const parentOptions = useMemo(
    () =>
      categories.rows.filter(
        (row) => row.parentId == null && row.id !== editing?.id,
      ),
    [categories.rows, editing?.id],
  );

  const canSave = name.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const trimmedName = name.trim();
      if (editing) {
        await updateFinancialCategoryViaPowerSyncOrApi(
          client,
          powerSync,
          editing.id,
          {
            name: trimmedName,
            parentId,
          },
        );
      } else {
        await createFinancialCategoryViaPowerSyncOrApi(client, powerSync, {
          name: trimmedName,
          parentId,
        });
      }
      await categories.reload();
      router.back();
    } catch (reason) {
      Alert.alert(
        "Could not save category",
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setSaving(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: editing ? "Edit category" : "New category",
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
  }, [canSave, editing, name, parentId, saving, navigation]);

  return (
    <KeyboardAvoidingView
      style={ui.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={ui.screen}
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={ui.input}
            value={name}
            onChangeText={setName}
            placeholder="Category name"
            placeholderTextColor={colors.muted}
            autoFocus={!editing}
            returnKeyType="done"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Parent</Text>
          <View style={styles.parentList}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={parentId == null ? { selected: true } : {}}
              accessibilityLabel="No parent (top level)"
              onPress={() => setParentId(null)}
              style={[
                styles.parentPill,
                parentId == null ? styles.parentPillSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.parentLabel,
                  parentId == null ? styles.parentLabelSelected : null,
                ]}
              >
                Top level
              </Text>
            </Pressable>
            {parentOptions.map((option) => {
              const selected = parentId === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={selected ? { selected: true } : {}}
                  accessibilityLabel={option.name}
                  onPress={() => setParentId(option.id)}
                  style={[
                    styles.parentPill,
                    selected ? styles.parentPillSelected : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.parentLabel,
                      selected ? styles.parentLabelSelected : null,
                    ]}
                    numberOfLines={1}
                  >
                    {option.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  form: {
    padding: spacing.screenX,
    gap: 18,
  },
  field: {
    gap: 7,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  parentList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  parentPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    maxWidth: "100%",
  },
  parentPillSelected: {
    backgroundColor: colors.buttonBg,
    borderColor: colors.buttonBg,
  },
  parentLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  parentLabelSelected: {
    color: colors.buttonText,
  },
});
