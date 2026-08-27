import type {
  MoneybirdAdministrationSummary,
  MoneybirdSettings,
  MoneybirdTestConnectionResult,
} from "@backsteros/contracts";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { colors } from "../../lib/theme";
import { PropertyOptionSheet } from "../property-option-sheet";
import { TextInput } from "../app-text-input";
import {
  SettingsCard,
  SettingsFieldRow,
} from "./settings-primitives";

export function SettingsMoneybirdTab() {
  const client = useMobileApiClient();
  const [settings, setSettings] = useState<MoneybirdSettings | null>(null);
  const [administrations, setAdministrations] = useState<
    MoneybirdAdministrationSummary[]
  >([]);
  const [apiTokenDraft, setApiTokenDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [adminPickerOpen, setAdminPickerOpen] = useState(false);

  const loadAdministrations = useCallback(
    async (configured: boolean) => {
      if (!configured) {
        setAdministrations([]);
        return;
      }
      try {
        const body = await client.requestJson<{
          administrations: MoneybirdAdministrationSummary[];
        }>("/api/v1/settings/moneybird/administrations");
        setAdministrations(body.administrations);
      } catch {
        setAdministrations([]);
      }
    },
    [client],
  );

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<MoneybirdSettings>(
        "/api/v1/settings/moneybird",
      );
      setSettings(body);
      setSettingsError(null);
      await loadAdministrations(body.apiTokenConfigured);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load Moneybird settings.",
      );
      return null;
    }
  }, [client, loadAdministrations]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettings = async (patch: {
    apiToken?: string;
    administrationId?: string | null;
  }): Promise<MoneybirdSettings | null> => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<MoneybirdSettings>(
        "/api/v1/settings/moneybird",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setSettings(body);
      await loadAdministrations(body.apiTokenConfigured);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not save Moneybird settings.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const connected = settings?.connected ?? false;

  if (settings === null && !settingsError) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <>
      <SettingsCard
        title="Connection"
        description="Connect a personal Moneybird API token with the sales_invoices scope. Tokens are stored in core (not synced via PowerSync)."
      >
        <SettingsFieldRow
          label="Status"
          value={
            connected
              ? "Connected"
              : settings?.apiTokenConfigured
                ? "Token saved — pick an administration"
                : "Not connected"
          }
          muted={!connected}
        />
        <SettingsFieldRow
          label="Administration"
          value={
            settings?.administrationName ?? settings?.administrationId ?? "—"
          }
          muted={!settings?.administrationId}
        />
        {!connected && settings?.apiTokenConfigured ? (
          <Text style={styles.hint}>
            Select an administration below, then test the connection.
          </Text>
        ) : null}
        {connected ? (
          <Text style={styles.hint}>
            Open Finance → Invoices to browse sales invoices.
          </Text>
        ) : null}
        {testMessage ? (
          <Text style={testOk ? styles.okText : styles.errorText}>
            {testMessage}
          </Text>
        ) : null}
        <Pressable
          onPress={() => {
            void (async () => {
              setTesting(true);
              setTestMessage(null);
              setTestOk(null);
              try {
                const result =
                  await client.requestJson<MoneybirdTestConnectionResult>(
                    "/api/v1/settings/moneybird/test",
                  );
                await loadSettings();
                setTestOk(result.ok);
                if (result.ok) {
                  const admin = result.administrationName
                    ? ` (${result.administrationName})`
                    : "";
                  const sample =
                    result.invoiceSampleCount != null
                      ? ` Sample invoices: ${result.invoiceSampleCount}.`
                      : "";
                  setTestMessage(`Connected to Moneybird${admin}.${sample}`);
                } else {
                  setTestMessage(
                    result.error ?? "Moneybird connection test failed.",
                  );
                }
              } catch (error) {
                setTestOk(false);
                setTestMessage(
                  error instanceof Error
                    ? error.message
                    : "Moneybird connection test failed.",
                );
              } finally {
                setTesting(false);
              }
            })();
          }}
          disabled={testing || !settings?.apiTokenConfigured}
          style={({ pressed }) => [
            styles.primaryButton,
            testing || !settings?.apiTokenConfigured ? { opacity: 0.5 } : null,
            pressed ? { opacity: 0.9 } : null,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonLabel}>
            {testing ? "Testing…" : "Test connection"}
          </Text>
        </Pressable>
      </SettingsCard>

      <SettingsCard
        title="API token"
        description="Create a personal API token in Moneybird and store it here."
      >
        <Text style={styles.fieldLabel}>Moneybird API token</Text>
        <TextInput
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={
            settings?.apiTokenConfigured
              ? `Configured (${settings.apiTokenPreview ?? "••••"})`
              : "Paste personal API token…"
          }
          value={apiTokenDraft}
          onChangeText={setApiTokenDraft}
        />
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              const value = apiTokenDraft.trim();
              if (!value) return;
              void patchSettings({ apiToken: value }).then((body) => {
                if (body) setApiTokenDraft("");
              });
            }}
            disabled={saving || !apiTokenDraft.trim()}
            style={({ pressed }) => [
              styles.primaryButtonCompact,
              saving || !apiTokenDraft.trim() ? { opacity: 0.5 } : null,
              pressed ? { opacity: 0.9 } : null,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonLabel}>
              {saving ? "Saving…" : "Save token"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void patchSettings({ apiToken: "", administrationId: null });
              setApiTokenDraft("");
            }}
            disabled={saving || !settings?.apiTokenConfigured}
            style={({ pressed }) => [
              styles.secondaryButtonInline,
              saving || !settings?.apiTokenConfigured ? { opacity: 0.5 } : null,
              pressed ? { opacity: 0.9 } : null,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonLabel}>Clear token</Text>
          </Pressable>
        </View>
        {settings?.apiTokenConfigured ? (
          <Text style={styles.hint}>
            Token on file: {settings.apiTokenPreview}
          </Text>
        ) : (
          <Text style={styles.hint}>
            No token stored. Finance invoices stay unavailable until you save
            one.
          </Text>
        )}
        {settingsError ? (
          <Text style={styles.errorText}>{settingsError}</Text>
        ) : null}
      </SettingsCard>

      {settings?.apiTokenConfigured ? (
        <SettingsCard
          title="Administration"
          description="Every Moneybird API call needs an administration id."
        >
          <SettingsFieldRow
            label="Selected"
            value={
              settings.administrationName ??
              settings.administrationId ??
              (administrations.length === 0
                ? "Could not load administrations"
                : "Select administration…")
            }
            onPress={() => setAdminPickerOpen(true)}
          />
          {settings.administrationId ? (
            <Text style={styles.hint}>
              Administration id: {settings.administrationId}
            </Text>
          ) : null}
        </SettingsCard>
      ) : null}

      <PropertyOptionSheet
        visible={adminPickerOpen}
        title="Administration"
        options={administrations.map((admin) => ({
          value: admin.id,
          label: `${admin.name}${admin.currency ? ` (${admin.currency})` : ""}`,
        }))}
        selected={settings?.administrationId ?? ""}
        onSelect={(value) => {
          void patchSettings({
            administrationId: value || null,
          });
        }}
        onClose={() => setAdminPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    paddingVertical: 16,
    alignItems: "center",
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  okText: {
    color: colors.foreground,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  primaryButton: {
    marginTop: 6,
    backgroundColor: colors.buttonBg,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonCompact: {
    backgroundColor: colors.buttonBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonLabel: {
    color: colors.buttonText,
    fontWeight: "600",
    fontSize: 15,
  },
  secondaryButtonInline: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  secondaryButtonLabel: {
    color: colors.foreground,
    fontWeight: "600",
    fontSize: 15,
  },
});
