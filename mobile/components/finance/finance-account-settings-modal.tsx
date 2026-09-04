import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  FinanceAccountEditor,
  type FinanceAccountEditorValues,
  type PendingAccountAvatar,
} from "./finance-account-editor";
import { uploadAvatarFromUri } from "../../lib/avatar-upload";
import {
  createBankAccountViaPowerSyncOrApi,
  updateBankAccountViaPowerSyncOrApi,
} from "../../lib/finance-mutations";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import {
  useFinanceAccountAvatarSrcMap,
  useFinanceAccounts,
} from "../../lib/use-finance-accounts";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { useMobilePowerSync } from "../../lib/powersync-context";

function keyFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

type Props = {
  visible: boolean;
  accountId?: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

/** iPad account settings dialog — same fields as the phone form page. */
export function FinanceAccountSettingsModal({
  visible,
  accountId = null,
  onClose,
  onSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const accounts = useFinanceAccounts();
  const editing = accounts.rows.find((row) => row.id === accountId) ?? null;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setPendingAvatar(null);
    if (editing) {
      setValues({
        name: editing.name,
        type: editing.type,
        ibanOrMask: editing.ibanOrMask ?? "",
        currency: editing.currency,
      });
    } else {
      setValues({
        name: "",
        type: "bank_account",
        ibanOrMask: "",
        currency: "EUR",
      });
    }
  }, [editing, visible]);

  const canSave = values.name.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
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
      onSaved?.();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.dialogWrap}
        >
          <View
            style={[
              styles.dialog,
              { marginBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>
                {editing ? "Account settings" : "New account"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={onClose}
                hitSlop={8}
              >
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.body}
            >
              <FinanceAccountEditor
                values={values}
                onChange={setValues}
                accountId={editing?.id ?? null}
                avatarSrc={
                  editing ? (avatarSrcById[editing.id] ?? null) : null
                }
                onAvatarUploaded={() => void accounts.reload()}
                pendingAvatar={pendingAvatar}
                onPendingAvatarChange={setPendingAvatar}
                autoFocusName={!editing}
              />
              {error ? <Text style={ui.error}>{error}</Text> : null}
            </ScrollView>
            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save"
                disabled={!canSave}
                onPress={() => void save()}
                style={({ pressed }) => [
                  styles.save,
                  !canSave ? styles.saveDisabled : null,
                  pressed && canSave ? { opacity: 0.7 } : null,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <Text style={styles.saveLabel}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.screenX,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  dialogWrap: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxHeight: "86%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
  cancel: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  body: {
    padding: 16,
    gap: 12,
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  save: {
    backgroundColor: colors.buttonBg,
    borderRadius: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  saveDisabled: {
    opacity: 0.4,
  },
  saveLabel: {
    color: colors.buttonText,
    fontSize: 16,
    fontWeight: "600",
  },
});
