import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";

import {
  FinanceAccountEditor,
  type FinanceAccountEditorValues,
  type PendingAccountAvatar,
} from "../../../components/finance/finance-account-editor";
import { uploadAvatarFromUri } from "../../../lib/avatar-upload";
import {
  createBankAccountViaPowerSyncOrApi,
  updateBankAccountViaPowerSyncOrApi,
} from "../../../lib/finance-mutations";
import { TabStackHeaderTextButton } from "../../../lib/tab-stack-options";
import { spacing } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import {
  useFinanceAccountAvatarSrcMap,
  useFinanceAccounts,
} from "../../../lib/use-finance-accounts";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";
import { useMobilePowerSync } from "../../../lib/powersync-context";

/** Slug for new accounts, mirroring the desktop key format (max 64). */
function keyFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export default function FinanceAccountFormScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const accounts = useFinanceAccounts();
  const editing = accounts.rows.find((row) => row.id === id) ?? null;
  const avatarSrcById = useFinanceAccountAvatarSrcMap(
    editing ? [editing] : [],
  );

  const [values, setValues] = useState<FinanceAccountEditorValues>({
    name: "",
    type: "bank_account",
    ibanOrMask: "",
    currency: "EUR",
  });
  const [pendingAvatar, setPendingAvatar] =
    useState<PendingAccountAvatar | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !editing) return;
    setValues({
      name: editing.name,
      type: editing.type,
      ibanOrMask: editing.ibanOrMask ?? "",
      currency: editing.currency,
    });
    setHydrated(true);
  }, [editing, hydrated]);

  const canSave = values.name.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const trimmedName = values.name.trim();
      if (editing) {
        await updateBankAccountViaPowerSyncOrApi(client, powerSync, editing.id, {
          name: trimmedName,
          type: values.type as never,
          ibanOrMask: values.ibanOrMask.trim() || null,
          currency: values.currency.trim().toUpperCase() || "EUR",
        });
      } else {
        const created = await createBankAccountViaPowerSyncOrApi(
          client,
          powerSync,
          {
            key: keyFromName(trimmedName) || `account-${Date.now()}`,
            name: trimmedName,
            type: values.type as never,
            ibanOrMask: values.ibanOrMask.trim() || null,
            currency: values.currency.trim().toUpperCase() || "EUR",
          },
        );
        if (pendingAvatar) {
          await uploadAvatarFromUri(
            client,
            "bank_account",
            created.id,
            pendingAvatar.uri,
            pendingAvatar.mimeType,
          );
        }
      }
      await accounts.reload();
      router.back();
    } catch (reason) {
      Alert.alert(
        "Could not save account",
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setSaving(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: editing ? "Account settings" : "New account",
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
  }, [canSave, editing, values, saving, navigation]);

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
        <FinanceAccountEditor
          values={values}
          onChange={setValues}
          accountId={editing?.id ?? null}
          avatarSrc={editing ? (avatarSrcById[editing.id] ?? null) : null}
          onAvatarUploaded={() => void accounts.reload()}
          pendingAvatar={pendingAvatar}
          onPendingAvatarChange={setPendingAvatar}
          autoFocusName={!editing}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  form: {
    padding: spacing.screenX,
    gap: 18,
  },
});
