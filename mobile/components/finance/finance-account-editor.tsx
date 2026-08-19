import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { FinanceAccountAvatar } from "./finance-account-avatar";
import {
  pickAvatarImage,
  uploadAvatarFromUri,
} from "../../lib/avatar-upload";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";

export const BANK_ACCOUNT_TYPE_OPTIONS = [
  { value: "bank_account", label: "Bank account" },
  { value: "credit_card", label: "Credit card" },
  { value: "savings", label: "Savings" },
  { value: "investment", label: "Investment" },
] as const;

export type FinanceAccountEditorValues = {
  name: string;
  type: string;
  ibanOrMask: string;
  currency: string;
};

export type PendingAccountAvatar = {
  uri: string;
  mimeType: string;
};

type Props = {
  values: FinanceAccountEditorValues;
  onChange: (next: FinanceAccountEditorValues) => void;
  /** Existing account id — enables immediate avatar upload. */
  accountId?: string | null;
  avatarSrc?: string | null;
  /** Called after a successful avatar upload so lists can refresh. */
  onAvatarUploaded?: () => void;
  /** Create mode: buffer a local preview until the account exists. */
  pendingAvatar?: PendingAccountAvatar | null;
  onPendingAvatarChange?: (avatar: PendingAccountAvatar | null) => void;
  autoFocusName?: boolean;
};

/**
 * Shared bank-account fields + logo picker for the full-page form and iPad modal.
 */
export function FinanceAccountEditor({
  values,
  onChange,
  accountId = null,
  avatarSrc = null,
  onAvatarUploaded,
  pendingAvatar = null,
  onPendingAvatarChange,
  autoFocusName = false,
}: Props) {
  const client = useMobileApiClient();
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [localOverride, setLocalOverride] = useState<string | null>(null);

  useEffect(() => {
    setLocalOverride(null);
    setAvatarError(null);
  }, [accountId]);

  const displaySrc = localOverride ?? pendingAvatar?.uri ?? avatarSrc;

  const onChangeAvatar = async () => {
    if (picking || uploading) return;
    setPicking(true);
    setAvatarError(null);
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      const picked = await pickAvatarImage();
      if (!picked) return;

      if (accountId) {
        setUploading(true);
        const result = await uploadAvatarFromUri(
          client,
          "bank_account",
          accountId,
          picked.uri,
          picked.mimeType,
        );
        if (!result.ok) {
          setAvatarError(result.error);
          return;
        }
        setLocalOverride(picked.uri);
        onAvatarUploaded?.();
      } else {
        setLocalOverride(picked.uri);
        onPendingAvatarChange?.({
          uri: picked.uri,
          mimeType: picked.mimeType,
        });
      }
    } catch (reason) {
      setAvatarError(
        reason instanceof Error ? reason.message : "Could not update logo.",
      );
    } finally {
      setPicking(false);
      setUploading(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.avatarRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change account logo"
          onPress={() => void onChangeAvatar()}
          disabled={picking || uploading}
          style={({ pressed }) => [
            styles.avatarButton,
            pressed ? { opacity: 0.7 } : null,
          ]}
        >
          <FinanceAccountAvatar
            src={displaySrc}
            name={values.name.trim() || "Account"}
            size={64}
          />
          {uploading || picking ? (
            <View style={styles.avatarBusy}>
              <ActivityIndicator color={colors.foreground} />
            </View>
          ) : (
            <View style={styles.avatarHint}>
              <Text style={styles.avatarHintText}>
                {displaySrc ? "Change" : "Add logo"}
              </Text>
            </View>
          )}
        </Pressable>
        {avatarError ? <Text style={ui.error}>{avatarError}</Text> : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={ui.input}
          value={values.name}
          onChangeText={(name) => onChange({ ...values, name })}
          placeholder="Account name"
          placeholderTextColor={colors.muted}
          autoFocus={autoFocusName}
          returnKeyType="done"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Type</Text>
        <View style={styles.typeRow}>
          {BANK_ACCOUNT_TYPE_OPTIONS.map((option) => {
            const selected = values.type === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={selected ? { selected: true } : {}}
                accessibilityLabel={option.label}
                onPress={() => onChange({ ...values, type: option.value })}
                style={[
                  styles.typePill,
                  selected ? styles.typePillSelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.typeLabel,
                    selected ? styles.typeLabelSelected : null,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>IBAN or card mask</Text>
        <TextInput
          style={ui.input}
          value={values.ibanOrMask}
          onChangeText={(ibanOrMask) => onChange({ ...values, ibanOrMask })}
          placeholder="NL00 BANK 0000 0000 00"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Currency</Text>
        <TextInput
          style={ui.input}
          value={values.currency}
          onChangeText={(currency) => onChange({ ...values, currency })}
          placeholder="EUR"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 18,
  },
  avatarRow: {
    alignItems: "flex-start",
    gap: 8,
  },
  avatarButton: {
    position: "relative",
  },
  avatarBusy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 14,
  },
  avatarHint: {
    marginTop: 6,
  },
  avatarHintText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  field: {
    gap: 7,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  typePillSelected: {
    backgroundColor: colors.buttonBg,
    borderColor: colors.buttonBg,
  },
  typeLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  typeLabelSelected: {
    color: colors.buttonText,
  },
});
