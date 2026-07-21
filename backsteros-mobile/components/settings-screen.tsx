import type {
  ApiKey,
  Contact,
  CreateApiKeyResponse,
} from "@backsteros/contracts";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  APP_TIMEZONE_OPTIONS,
  appTimezoneLabel,
  normalizeAppTimezone,
} from "../lib/app-timezone";
import {
  DEFAULT_ASSIGNEE_SETTINGS_KEY,
  getDefaultAssigneeId,
  parseDefaultAssigneeIdFromSettings,
  setDefaultAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "../lib/default-assignee";
import { getMobileEnvironment } from "../lib/env";
import { formatLastSyncedAt } from "../lib/format-last-synced";
import { useMobilePowerSync } from "../lib/powersync-context";
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_NAV_TABS,
  getSettingsTabMeta,
  type SettingsTabId,
} from "../lib/settings-tabs";
import { colors, spacing } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { PillNav } from "./pill-nav";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { PropertyOptionSheet } from "./property-option-sheet";

const CONTACTS_SQL = `SELECT id, name FROM contacts
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const STORAGE_NOT_CONFIGURED_REASON =
  "Object storage is not configured. Set Spaces credentials on the API deployment.";

type ContactRow = { id: string; name: string | null };

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {description ? (
        <Text style={styles.cardDescription}>{description}</Text>
      ) : null}
      {children}
    </View>
  );
}

function SettingsFieldRow({
  label,
  value,
  onPress,
  muted,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  muted?: boolean;
}) {
  const content = (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        style={[styles.fieldValue, muted ? styles.fieldValueMuted : null]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        pressed ? { backgroundColor: colors.rowPressed } : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

function GeneralTab({
  timezone,
  saving,
  onTimezoneChange,
}: {
  timezone: string;
  saving: boolean;
  onTimezoneChange: (next: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <SettingsCard
        title="Timezone"
        description="Due dates, Today/Tomorrow task tabs, and journal due-task panels use this timezone — not your device clock."
      >
        <SettingsFieldRow
          label="Timezone"
          value={appTimezoneLabel(timezone)}
          onPress={saving ? undefined : () => setPickerOpen(true)}
        />
        {saving ? (
          <Text style={styles.hint}>Saving…</Text>
        ) : null}
      </SettingsCard>
      <PropertyOptionSheet
        visible={pickerOpen}
        title="Timezone"
        options={APP_TIMEZONE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        selected={timezone}
        onSelect={(value) => {
          if (value) onTimezoneChange(value);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

function AccountTab({
  settings,
  onSettingsSaved,
}: {
  settings: Record<string, unknown> | undefined;
  onSettingsSaved?: () => void;
}) {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const powerSync = useMobilePowerSync();
  const { clerkPublishableKey } = getMobileEnvironment();
  const client = useMobileApiClient();

  const { data: syncedContacts } = useLocalQuery<ContactRow>(CONTACTS_SQL);
  const [restContacts, setRestContacts] = useState<ContactRow[]>([]);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    void getDefaultAssigneeId().then(setAssigneeId);
  }, []);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    void (async () => {
      const synced = await syncDefaultAssigneeIdFromSettings(settings);
      if (cancelled) return;
      setAssigneeId(synced);

      const fromServer = parseDefaultAssigneeIdFromSettings(settings);
      if (fromServer !== undefined || !synced || !clerkPublishableKey) return;
      try {
        await client.requestJson("/api/v1/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [DEFAULT_ASSIGNEE_SETTINGS_KEY]: synced }),
        });
        onSettingsSaved?.();
      } catch {
        // keep local value if migrate fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clerkPublishableKey, client, onSettingsSaved, settings]);

  useEffect(() => {
    if (powerSync.ready) return;
    void client
      .requestJson<{ contacts: Contact[] }>("/api/v1/contacts")
      .then((body) => {
        setRestContacts(
          (body.contacts ?? []).map((contact) => ({
            id: contact.id,
            name: contact.name,
          })),
        );
      })
      .catch(() => setRestContacts([]));
  }, [client, powerSync.ready]);

  const contacts = powerSync.ready ? (syncedContacts ?? []) : restContacts;
  const selected = contacts.find((entry) => entry.id === assigneeId);
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "—";

  return (
    <>
      {clerkPublishableKey ? (
        <SettingsCard
          title="Email"
          description="The email address associated with your account."
        >
          <Text style={styles.staticValue}>{email}</Text>
        </SettingsCard>
      ) : null}

      <SettingsCard
        title="Default assignee"
        description="This contact is the default assignee for newly created tasks. You can still change the assignee on individual tasks."
      >
        {contacts.length === 0 ? (
          <Text style={styles.hint}>Add a contact to set a default assignee.</Text>
        ) : (
          <SettingsFieldRow
            label="Assignee"
            value={selected?.name?.trim() || "None"}
            muted={!selected}
            onPress={() => setPickerOpen(true)}
          />
        )}
      </SettingsCard>

      <SettingsCard title="Session">
        <Pressable
          onPress={() => {
            void signOut().then(() => {
              if (router.canGoBack()) router.back();
            });
          }}
          style={({ pressed }) => [
            styles.dangerButton,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.dangerButtonLabel}>Sign out</Text>
        </Pressable>
      </SettingsCard>

      <PropertyOptionSheet
        visible={pickerOpen}
        title="Default assignee"
        options={[
          { value: null, label: "None" },
          ...contacts.map((contact) => ({
            value: contact.id,
            label: contact.name?.trim() || "Untitled",
          })),
        ]}
        selected={assigneeId}
        onSelect={(value) => {
          setAssigneeId(value);
          void setDefaultAssigneeId(value);
          if (!clerkPublishableKey) return;
          void client
            .requestJson("/api/v1/settings", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                [DEFAULT_ASSIGNEE_SETTINGS_KEY]: value,
              }),
            })
            .then(() => onSettingsSaved?.())
            .catch(() => {
              // keep optimistic local value offline
            });
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

function SyncTab() {
  const sync = useMobilePowerSync();
  const { apiUrl } = getMobileEnvironment();

  const statusLabel =
    sync.status === "unauthenticated"
      ? "Not signed in"
      : sync.connecting
        ? "Connecting…"
        : sync.connected
          ? "Connected"
          : sync.status === "rest-only"
            ? "REST only"
            : sync.status === "ready"
              ? "Local (offline)"
              : sync.status === "error"
                ? "Sync error"
                : "Not connected";

  const lastSyncLabel = sync.lastSyncedAt
    ? formatLastSyncedAt(sync.lastSyncedAt)
    : "Never";

  const errorMessage =
    sync.status === "rest-only" || sync.status === "error"
      ? sync.message
      : null;

  return (
    <SettingsCard
      title="Sync status"
      description="Cloud sync connection and last successful sync time."
    >
      <SettingsFieldRow label="Status" value={statusLabel} />
      <SettingsFieldRow label="Last sync" value={lastSyncLabel} />
      <SettingsFieldRow label="URL" value={apiUrl} muted />
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      <Pressable
        onPress={() => {
          void sync.retry();
        }}
        disabled={sync.connecting}
        style={({ pressed }) => [
          styles.primaryButton,
          sync.connecting ? { opacity: 0.5 } : null,
          pressed && !sync.connecting ? { opacity: 0.9 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Sync now"
      >
        <Text style={styles.primaryButtonLabel}>
          {sync.connecting ? "Syncing…" : "Sync now"}
        </Text>
      </Pressable>
    </SettingsCard>
  );
}

function ApiTab() {
  const { apiUrl, clerkPublishableKey } = getMobileEnvironment();
  const client = useMobileApiClient();

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(Boolean(clerkPublishableKey));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    if (!clerkPublishableKey) {
      setLoading(false);
      setApiKeys([]);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const body = await client.requestJson<{ apiKeys: ApiKey[] }>(
        "/api/v1/api-keys",
      );
      setApiKeys(body.apiKeys ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load API keys",
      );
    } finally {
      setLoading(false);
    }
  }, [client, clerkPublishableKey]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  if (!clerkPublishableKey) {
    return (
      <SettingsCard
        title="API keys"
        description="Sign in to create and manage revocable bearer tokens for the external REST API."
      >
        <Text style={styles.hint}>Requires Clerk authentication.</Text>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title="API keys"
      description="Revocable bearer tokens for the external REST API."
    >
      {loading ? (
        <ActivityIndicator color={colors.muted} style={{ marginVertical: 12 }} />
      ) : null}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.createRow}>
        <TextInput
          value={nameDraft}
          onChangeText={setNameDraft}
          placeholder="Key name"
          placeholderTextColor={colors.muted}
          style={[ui.input, styles.createInput]}
          editable={!creating}
        />
        <Pressable
          onPress={() => {
            const name = nameDraft.trim();
            if (!name || creating) return;
            setCreating(true);
            setErrorMessage(null);
            void (async () => {
              try {
                const result = await client.requestJson<CreateApiKeyResponse>(
                  "/api/v1/api-keys",
                  {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ name, scopes: ["read", "write"] }),
                  },
                );
                setApiKeys((current) => [result.apiKey, ...current]);
                setRevealedSecret(result.secret);
                setNameDraft("");
              } catch (error) {
                setErrorMessage(
                  error instanceof Error
                    ? error.message
                    : "Could not create API key",
                );
              } finally {
                setCreating(false);
              }
            })();
          }}
          disabled={!nameDraft.trim() || creating}
          style={({ pressed }) => [
            styles.primaryButtonCompact,
            !nameDraft.trim() || creating ? { opacity: 0.45 } : null,
            pressed ? { opacity: 0.9 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create API key"
        >
          <Text style={styles.primaryButtonLabel}>
            {creating ? "…" : "Create"}
          </Text>
        </Pressable>
      </View>

      {revealedSecret ? (
        <View style={styles.secretBox}>
          <Text style={styles.hint}>
            Copy this secret now — it will not be shown again.
          </Text>
          <Text style={styles.secretText} selectable>
            {revealedSecret}
          </Text>
          <Pressable
            onPress={() => setRevealedSecret(null)}
            accessibilityRole="button"
          >
            <Text style={styles.linkLabel}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}

      {apiKeys.length === 0 && !loading ? (
        <Text style={styles.hint}>No API keys yet.</Text>
      ) : (
        apiKeys.map((key) => (
          <View key={key.id} style={styles.keyRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.keyName} numberOfLines={1}>
                {key.name}
              </Text>
              <Text style={styles.keyMeta} numberOfLines={1}>
                {key.prefix}… · {key.scopes.join(", ")}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Alert.alert(
                  "Revoke API key",
                  `Revoke “${key.name}”? This cannot be undone.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Revoke",
                      style: "destructive",
                      onPress: () => {
                        void (async () => {
                          try {
                            await client.requestJson(
                              `/api/v1/api-keys/${encodeURIComponent(key.id)}`,
                              { method: "DELETE" },
                            );
                            setApiKeys((current) =>
                              current.filter((entry) => entry.id !== key.id),
                            );
                          } catch {
                            setErrorMessage("Could not revoke API key");
                          }
                        })();
                      },
                    },
                  ],
                );
              }}
              accessibilityRole="button"
              accessibilityLabel={`Revoke ${key.name}`}
            >
              <Text style={styles.dangerLink}>Revoke</Text>
            </Pressable>
          </View>
        ))
      )}

      {errorMessage ? (
        <Pressable onPress={() => void loadKeys()} accessibilityRole="button">
          <Text style={styles.linkLabel}>Retry</Text>
        </Pressable>
      ) : null}
    </SettingsCard>
  );
}

function ComingSoonTab({ title, body }: { title: string; body: string }) {
  return (
    <SettingsCard title={title} description={body}>
      <Text style={styles.comingSoon}>Coming soon</Text>
    </SettingsCard>
  );
}

function WhoopTab() {
  return (
    <SettingsCard
      title="Whoop"
      description="Recovery, sleep, and strain data for journal entries."
    >
      <Text style={styles.cardDescription}>
        Whoop credentials are read from a local totem.env file on the desktop
        app. Configure and test Whoop from desktop Settings → Whoop.
      </Text>
      <SettingsFieldRow label="Status" value="Desktop only" muted />
    </SettingsCard>
  );
}

function StorageTab() {
  const client = useMobileApiClient();
  const { apiUrl } = getMobileEnvironment();

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const body = await client.requestJson<{ configured: boolean }>(
        "/api/v1/settings/storage",
      );
      setConfigured(body.configured);
      setReason(body.configured ? null : STORAGE_NOT_CONFIGURED_REASON);
      return { configured: body.configured } as const;
    } catch (error) {
      try {
        const response = await fetch(`${apiUrl.replace(/\/$/, "")}/health`, {
          cache: "no-store",
        });
        if (response.ok) {
          const health = (await response.json()) as {
            spacesConfigured?: unknown;
          };
          if (typeof health.spacesConfigured === "boolean") {
            setConfigured(health.spacesConfigured);
            setReason(
              health.spacesConfigured ? null : STORAGE_NOT_CONFIGURED_REASON,
            );
            return { configured: health.spacesConfigured } as const;
          }
        }
      } catch {
        /* fall through */
      }
      const message =
        error instanceof Error
          ? error.message
          : "Could not reach the API to check storage.";
      setConfigured(false);
      setReason(message);
      return { error: message } as const;
    }
  }, [apiUrl, client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SettingsCard
      title="Storage"
      description="Object storage for documents and letter PDFs."
    >
      <Text style={styles.cardDescription}>
        Letter PDFs and document content are stored in the deployment’s
        DigitalOcean Spaces bucket. Credentials are configured on the API —
        BacksterOS does not store Spaces secrets in the app.
      </Text>
      <SettingsFieldRow
        label="Status"
        value={
          configured === null
            ? "Loading…"
            : configured
              ? "Connected"
              : "Not connected"
        }
      />
      <SettingsFieldRow
        label="Provider"
        value="DigitalOcean Spaces"
        muted
      />
      {reason ? <Text style={styles.hint}>{reason}</Text> : null}
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
            const result = await refresh();
            if ("error" in result) {
              setTestOk(false);
              setTestMessage(result.error ?? "Could not check storage.");
            } else if (result.configured) {
              setTestOk(true);
              setTestMessage(
                "Connected — Spaces credentials are configured.",
              );
            } else {
              setTestOk(false);
              setTestMessage(STORAGE_NOT_CONFIGURED_REASON);
            }
            setTesting(false);
          })();
        }}
        disabled={testing}
        style={({ pressed }) => [
          styles.primaryButton,
          testing ? { opacity: 0.5 } : null,
          pressed && !testing ? { opacity: 0.9 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Test connection"
      >
        <Text style={styles.primaryButtonLabel}>
          {testing ? "Testing…" : "Test connection"}
        </Text>
      </Pressable>
    </SettingsCard>
  );
}

export function SettingsScreen() {
  const { apiUrl, clerkPublishableKey } = getMobileEnvironment();
  const client = useMobileApiClient();

  const [tab, setTab] = useState<SettingsTabId>(DEFAULT_SETTINGS_TAB);
  const meta = getSettingsTabMeta(tab);

  const [timezone, setTimezone] = useState(() =>
    normalizeAppTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [workspaceSettings, setWorkspaceSettings] = useState<
    Record<string, unknown> | undefined
  >(undefined);

  const reloadSettings = useCallback(async () => {
    if (!clerkPublishableKey) return;
    try {
      const body = await client.requestJson<{
        settings: Record<string, unknown>;
      }>("/api/v1/settings");
      setWorkspaceSettings(body.settings);
      setTimezone(
        normalizeAppTimezone(
          String(
            body.settings.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone,
          ),
        ),
      );
      await syncDefaultAssigneeIdFromSettings(body.settings);
    } catch {
      // keep local defaults
    }
  }, [client, clerkPublishableKey]);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Settings",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <View style={ui.screen}>
        <View style={styles.pillWrap}>
          <PillNav
            accessibilityLabel="Settings sections"
            items={SETTINGS_NAV_TABS.map((entry) => ({
              value: entry.id,
              label: entry.label,
            }))}
            value={tab}
            onChange={setTab}
          />
        </View>
        <KeyboardAwareScrollView
          style={ui.screen}
          contentContainerStyle={styles.content}
          bottomClearance={40}
        >
          <Text style={styles.sectionTitle}>{meta.label}</Text>
          <Text style={styles.sectionDescription}>{meta.description}</Text>

          {tab === "general" ? (
            <GeneralTab
              timezone={timezone}
              saving={savingTimezone}
              onTimezoneChange={(next) => {
                setTimezone(next);
                if (!clerkPublishableKey) return;
                setSavingTimezone(true);
                void (async () => {
                  try {
                    await client.requestJson("/api/v1/settings", {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ timezone: next }),
                    });
                    await reloadSettings();
                  } catch {
                    // keep optimistic value offline
                  } finally {
                    setSavingTimezone(false);
                  }
                })();
              }}
            />
          ) : null}
          {tab === "account" ? (
            <AccountTab
              settings={workspaceSettings}
              onSettingsSaved={() => void reloadSettings()}
            />
          ) : null}
          {tab === "sync" ? <SyncTab /> : null}
          {tab === "api" ? <ApiTab /> : null}
          {tab === "cursor" ? (
            <ComingSoonTab
              title="Cursor"
              body="Cursor integration settings are not available yet. This section will cover API keys, agent profiles, and model selection when the feature is ready."
            />
          ) : null}
          {tab === "whoop" ? <WhoopTab /> : null}
          {tab === "storage" ? <StorageTab /> : null}
        </KeyboardAwareScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  pillWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingTop: 4,
  },
  content: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 28,
  },
  sectionDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: -8,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
  cardDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 14,
    width: 88,
  },
  fieldValue: {
    flex: 1,
    color: colors.foreground,
    fontSize: 14,
    textAlign: "right",
  },
  fieldValueMuted: {
    color: colors.muted,
  },
  staticValue: {
    color: colors.foreground,
    fontSize: 15,
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
  comingSoon: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
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
  dangerButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(248, 113, 113, 0.35)",
  },
  dangerButtonLabel: {
    color: colors.danger,
    fontWeight: "600",
    fontSize: 15,
  },
  dangerLink: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "500",
  },
  linkLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
  },
  createRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  createInput: {
    flex: 1,
  },
  secretBox: {
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.faint,
  },
  secretText: {
    color: colors.foreground,
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 18,
  },
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  keyName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  keyMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
    fontFamily: "Menlo",
  },
});
