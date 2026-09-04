import type {
  ApiKey,
  CreateApiKeyResponse,
  CursorSettings,
  GithubConnectionStatus,
  WhoopDayResult,
  WhoopSettingsStatus,
} from "@backsteros/contracts";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import {
  fetchGithubConnectionStatus,
  GITHUB_OAUTH_SCOPES,
  startGithubOauthConnect,
} from "../lib/github-oauth";
import {
  DEFAULT_SETTINGS_TAB,
  getSettingsTabMeta,
  getVisibleSettingsNavTabs,
  isSettingsTabId,
  type SettingsTabId,
} from "../lib/settings-tabs";
import { useSuspendNavigationShortcuts } from "../lib/navigation-shortcut-gate";
import { useHideTabBar } from "../lib/tab-bar-visibility";
import { SettingsCard, SettingsFieldRow } from "./settings/settings-primitives";
import { colors, spacing } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { FullscreenIcon } from "./fullscreen-icon";
import { PillNav } from "./pill-nav";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { PropertyOptionSheet } from "./property-option-sheet";
import { SegmentedPillToggle } from "./segmented-pill-toggle";
import { SettingsServerTab } from "./settings-server-tab";
import { SettingsEmailTab } from "./settings/email-tab";
import { SettingsMoneybirdTab } from "./settings/moneybird-tab";
import { TextInput } from "./app-text-input";

const CONTACTS_SQL = `SELECT id, name FROM contacts
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const STORAGE_NOT_CONFIGURED_REASON =
  "Local vault is not configured. Choose a vault folder on desktop Settings → Storage.";

type ContactRow = { id: string; name: string | null };

type CursorModelOption = { id: string; displayName?: string };
type CursorSubTab = "api-key" | "spellcheck" | "research" | "agents";

const CURSOR_SUB_TABS: { value: CursorSubTab; label: string }[] = [
  { value: "api-key", label: "API key" },
  { value: "spellcheck", label: "Spellcheck" },
  { value: "research", label: "Research" },
  { value: "agents", label: "Agents" },
];

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

import { GeneralTab } from "./settings/general-tab";
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
  const { clerkPublishableKey } = getMobileEnvironment();
  const client = useMobileApiClient();

  const { data: syncedContacts, isLoading: contactsSyncLoading } =
    useLocalQuery<ContactRow>(CONTACTS_SQL);
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

  const contacts = syncedContacts ?? [];
  const contactsLoading = contactsSyncLoading;
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
        {contactsLoading ? (
          <ActivityIndicator color={colors.muted} style={{ marginTop: 8 }} />
        ) : contacts.length === 0 ? (
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

function ApiKeyRow({
  apiKey,
  onRename,
  onRevoke,
}: {
  apiKey: ApiKey;
  onRename: (id: string, name: string) => Promise<boolean>;
  onRevoke: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(apiKey.name);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setName(apiKey.name);
  }, [apiKey.name, editing]);

  return (
    <View style={styles.keyRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <View style={styles.renameRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              editable={!saving}
              style={[ui.input, styles.renameInput]}
              autoFocus
            />
            <Pressable
              onPress={() => {
                const next = name.trim();
                if (!next || next === apiKey.name) {
                  setEditing(false);
                  setName(apiKey.name);
                  return;
                }
                setSaving(true);
                void onRename(apiKey.id, next).then((ok) => {
                  setSaving(false);
                  if (ok) setEditing(false);
                });
              }}
              disabled={saving || !name.trim()}
              accessibilityRole="button"
              accessibilityLabel="Save API key name"
            >
              <Text style={styles.linkLabel}>{saving ? "…" : "Save"}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setEditing(false);
                setName(apiKey.name);
              }}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Cancel rename"
            >
              <Text style={styles.linkLabel}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.keyName} numberOfLines={1}>
              {apiKey.name}
            </Text>
            <Text style={styles.keyMeta} numberOfLines={1}>
              {apiKey.prefix}… · {apiKey.scopes.join(", ")}
            </Text>
          </>
        )}
      </View>
      {!editing ? (
        <>
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel={`Rename ${apiKey.name}`}
          >
            <Text style={styles.linkLabel}>Rename</Text>
          </Pressable>
          <Pressable
            onPress={() => onRevoke(apiKey.id)}
            accessibilityRole="button"
            accessibilityLabel={`Revoke ${apiKey.name}`}
          >
            <Text style={styles.dangerLink}>Revoke</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function ApiTab() {
  const { clerkPublishableKey } = getMobileEnvironment();
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
          <ApiKeyRow
            key={key.id}
            apiKey={key}
            onRename={async (id, name) => {
              try {
                const updated = await client.requestJson<ApiKey>(
                  `/api/v1/api-keys/${encodeURIComponent(id)}`,
                  {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ name }),
                  },
                );
                setApiKeys((current) =>
                  current.map((entry) => (entry.id === updated.id ? updated : entry)),
                );
                return true;
              } catch {
                setErrorMessage("Could not rename API key");
                return false;
              }
            }}
            onRevoke={(id) => {
              const target = apiKeys.find((entry) => entry.id === id);
              Alert.alert(
                "Revoke API key",
                `Revoke “${target?.name ?? "this key"}”? This cannot be undone.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Revoke",
                    style: "destructive",
                    onPress: () => {
                      void (async () => {
                        try {
                          await client.requestJson(
                            `/api/v1/api-keys/${encodeURIComponent(id)}`,
                            { method: "DELETE" },
                          );
                          setApiKeys((current) =>
                            current.filter((entry) => entry.id !== id),
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
          />
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

function CursorTab() {
  const client = useMobileApiClient();
  const [subTab, setSubTab] = useState<CursorSubTab>("api-key");
  const [cursorSettings, setCursorSettings] = useState<CursorSettings | null>(
    null,
  );
  const [models, setModels] = useState<CursorModelOption[]>([]);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [researchInstructionsDraft, setResearchInstructionsDraft] =
    useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [savingResearchInstructions, setSavingResearchInstructions] =
    useState(false);
  const [modelPicker, setModelPicker] = useState<
    "spellcheck" | "research" | null
  >(null);

  const loadCursorSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<CursorSettings>(
        "/api/v1/settings/cursor",
      );
      setCursorSettings(body);
      setInstructionsDraft(body.spellcheckInstructions);
      setResearchInstructionsDraft(body.researchInstructions);
      setSettingsError(null);
      return body;
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : "Could not load Cursor settings.",
      );
      return null;
    }
  }, [client]);

  const loadModels = useCallback(
    async (configured: boolean) => {
      if (!configured) {
        setModels([{ id: "auto", displayName: "Auto" }]);
        return;
      }
      try {
        const body = await client.requestJson<{ models: CursorModelOption[] }>(
          "/api/v1/settings/cursor/models",
        );
        const list = body.models.length
          ? body.models
          : [{ id: "auto", displayName: "Auto" }];
        if (!list.some((m) => m.id === "auto")) {
          list.unshift({ id: "auto", displayName: "Auto" });
        }
        setModels(list);
      } catch {
        setModels([{ id: "auto", displayName: "Auto" }]);
      }
    },
    [client],
  );

  useEffect(() => {
    void (async () => {
      const settings = await loadCursorSettings();
      if (settings) await loadModels(settings.apiKeyConfigured);
    })();
  }, [loadCursorSettings, loadModels]);

  const patchCursorSettings = async (
    patch: Record<string, unknown>,
  ): Promise<CursorSettings | null> => {
    setSavingSettings(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<CursorSettings>(
        "/api/v1/settings/cursor",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setCursorSettings(body);
      if (patch.spellcheckInstructions !== undefined) {
        setInstructionsDraft(body.spellcheckInstructions);
      }
      if (patch.researchInstructions !== undefined) {
        setResearchInstructionsDraft(body.researchInstructions);
      }
      return body;
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : "Could not save Cursor settings.",
      );
      return null;
    } finally {
      setSavingSettings(false);
    }
  };

  const withSelectedModel = (selected: string | undefined) => {
    if (selected && !models.some((m) => m.id === selected)) {
      return [{ id: selected, displayName: selected }, ...models];
    }
    return models;
  };
  const spellcheckModelOptions = withSelectedModel(
    cursorSettings?.spellcheckModel,
  );
  const researchModelOptions = withSelectedModel(cursorSettings?.researchModel);

  const instructionsDirty =
    Boolean(cursorSettings) &&
    instructionsDraft !== (cursorSettings?.spellcheckInstructions ?? "");
  const researchInstructionsDirty =
    Boolean(cursorSettings) &&
    researchInstructionsDraft !==
      (cursorSettings?.researchInstructions ?? "");

  return (
    <>
      <View style={styles.subtabs}>
        <SegmentedPillToggle
          accessibilityLabel="Cursor settings sections"
          value={subTab}
          onChange={setSubTab}
          options={CURSOR_SUB_TABS}
        />
      </View>

      {subTab === "api-key" ? (
        <SettingsCard
          title="API key"
          description="Create an API key in the Cursor dashboard and store it here (kept in core, not synced via PowerSync). Used for spellcheck and other Cursor SDK features."
        >
          <TextInput
            value={apiKeyDraft}
            onChangeText={setApiKeyDraft}
            placeholder={
              cursorSettings?.apiKeyConfigured
                ? `Configured (${cursorSettings.apiKeyPreview ?? "••••"})`
                : "cursor_…"
            }
            placeholderTextColor={colors.muted}
            style={ui.input}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                const value = apiKeyDraft.trim();
                if (!value) return;
                setSavingKey(true);
                void patchCursorSettings({ apiKey: value }).then((body) => {
                  setSavingKey(false);
                  if (body) {
                    setApiKeyDraft("");
                    void loadModels(body.apiKeyConfigured);
                  }
                });
              }}
              disabled={savingKey || !apiKeyDraft.trim()}
              style={({ pressed }) => [
                styles.primaryButtonCompact,
                savingKey || !apiKeyDraft.trim() ? { opacity: 0.45 } : null,
                pressed ? { opacity: 0.9 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save Cursor API key"
            >
              <Text style={styles.primaryButtonLabel}>
                {savingKey ? "Saving…" : "Save key"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setSavingKey(true);
                void patchCursorSettings({ apiKey: "" }).then((body) => {
                  setSavingKey(false);
                  if (body) {
                    setApiKeyDraft("");
                    void loadModels(false);
                  }
                });
              }}
              disabled={savingKey || !cursorSettings?.apiKeyConfigured}
              style={({ pressed }) => [
                styles.secondaryButtonInline,
                savingKey || !cursorSettings?.apiKeyConfigured
                  ? { opacity: 0.45 }
                  : null,
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Clear Cursor API key"
            >
              <Text style={styles.secondaryButtonLabel}>Clear key</Text>
            </Pressable>
          </View>
          {cursorSettings?.apiKeyConfigured ? (
            <Text style={styles.hint}>
              Key on file: {cursorSettings.apiKeyPreview}
            </Text>
          ) : (
            <Text style={styles.hint}>
              No API key stored. Spellcheck stays unavailable until you save
              one.
            </Text>
          )}
          {settingsError ? (
            <Text style={styles.errorText}>{settingsError}</Text>
          ) : null}
        </SettingsCard>
      ) : null}

      {subTab === "spellcheck" ? (
        <SettingsCard
          title="Spellcheck"
          description="Use the Cursor SDK to fix spelling and light formatting on task titles and descriptions."
        >
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Enable spellcheck</Text>
            <Switch
              value={cursorSettings?.spellcheckEnabled ?? false}
              disabled={!cursorSettings || savingSettings}
              onValueChange={(checked) => {
                void patchCursorSettings({ spellcheckEnabled: checked });
              }}
            />
          </View>
          <SettingsFieldRow
            label="Model"
            value={
              spellcheckModelOptions.find(
                (m) => m.id === (cursorSettings?.spellcheckModel ?? "auto"),
              )?.displayName ||
              cursorSettings?.spellcheckModel ||
              "auto"
            }
            onPress={
              !cursorSettings || savingSettings
                ? undefined
                : () => setModelPicker("spellcheck")
            }
          />
          <Text style={styles.fieldCaption}>Spellcheck instructions</Text>
          <TextInput
            value={instructionsDraft}
            onChangeText={setInstructionsDraft}
            editable={Boolean(cursorSettings) && !savingInstructions}
            multiline
            style={[ui.input, styles.instructionsInput]}
            textAlignVertical="top"
          />
          <Text style={styles.hint}>
            Sent to the Cursor agent before the task title and description. Keep
            the JSON response shape requirement so results can be applied.
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                setSavingInstructions(true);
                void patchCursorSettings({
                  spellcheckInstructions: instructionsDraft,
                }).then(() => setSavingInstructions(false));
              }}
              disabled={
                savingInstructions || !cursorSettings || !instructionsDirty
              }
              style={({ pressed }) => [
                styles.primaryButtonCompact,
                savingInstructions || !cursorSettings || !instructionsDirty
                  ? { opacity: 0.45 }
                  : null,
                pressed ? { opacity: 0.9 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonLabel}>
                {savingInstructions ? "Saving…" : "Save instructions"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setSavingInstructions(true);
                void patchCursorSettings({ spellcheckInstructions: "" }).then(
                  () => setSavingInstructions(false),
                );
              }}
              disabled={savingInstructions || !cursorSettings}
              style={({ pressed }) => [
                styles.secondaryButtonInline,
                savingInstructions || !cursorSettings ? { opacity: 0.45 } : null,
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonLabel}>Reset to default</Text>
            </Pressable>
          </View>
          {settingsError ? (
            <Text style={styles.errorText}>{settingsError}</Text>
          ) : null}
        </SettingsCard>
      ) : null}

      {subTab === "research" ? (
        <SettingsCard
          title="Research"
          description="Use the Cursor SDK to research the task topic and enrich the title and description with findings."
        >
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Enable research</Text>
            <Switch
              value={cursorSettings?.researchEnabled ?? false}
              disabled={!cursorSettings || savingSettings}
              onValueChange={(checked) => {
                void patchCursorSettings({ researchEnabled: checked });
              }}
            />
          </View>
          <SettingsFieldRow
            label="Model"
            value={
              researchModelOptions.find(
                (m) => m.id === (cursorSettings?.researchModel ?? "auto"),
              )?.displayName ||
              cursorSettings?.researchModel ||
              "auto"
            }
            onPress={
              !cursorSettings || savingSettings
                ? undefined
                : () => setModelPicker("research")
            }
          />
          <Text style={styles.fieldCaption}>Research instructions</Text>
          <TextInput
            value={researchInstructionsDraft}
            onChangeText={setResearchInstructionsDraft}
            editable={Boolean(cursorSettings) && !savingResearchInstructions}
            multiline
            style={[ui.input, styles.instructionsInput]}
            textAlignVertical="top"
          />
          <Text style={styles.hint}>
            Sent to the Cursor agent before the task title and description. Keep
            the JSON response shape requirement so results can be applied.
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                setSavingResearchInstructions(true);
                void patchCursorSettings({
                  researchInstructions: researchInstructionsDraft,
                }).then(() => setSavingResearchInstructions(false));
              }}
              disabled={
                savingResearchInstructions ||
                !cursorSettings ||
                !researchInstructionsDirty
              }
              style={({ pressed }) => [
                styles.primaryButtonCompact,
                savingResearchInstructions ||
                !cursorSettings ||
                !researchInstructionsDirty
                  ? { opacity: 0.45 }
                  : null,
                pressed ? { opacity: 0.9 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonLabel}>
                {savingResearchInstructions ? "Saving…" : "Save instructions"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setSavingResearchInstructions(true);
                void patchCursorSettings({ researchInstructions: "" }).then(
                  () => setSavingResearchInstructions(false),
                );
              }}
              disabled={savingResearchInstructions || !cursorSettings}
              style={({ pressed }) => [
                styles.secondaryButtonInline,
                savingResearchInstructions || !cursorSettings
                  ? { opacity: 0.45 }
                  : null,
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonLabel}>Reset to default</Text>
            </Pressable>
          </View>
          {settingsError ? (
            <Text style={styles.errorText}>{settingsError}</Text>
          ) : null}
        </SettingsCard>
      ) : null}

      {subTab === "agents" ? (
        <SettingsCard
          title="Active agents"
          description="Local Cursor agent processes are owned by the PTY sidecar on the computer running core. Leaving a task only detaches the viewer; Kill stops that process."
        >
          <Text style={styles.hint}>
            Manage and kill live agent sessions from desktop Settings → Cursor →
            Agents. Mobile can attach to sessions when the PTY sidecar is
            reachable, but process kill stays on desktop.
          </Text>
        </SettingsCard>
      ) : null}

      <PropertyOptionSheet
        visible={modelPicker !== null}
        title="Model"
        options={(modelPicker === "research"
          ? researchModelOptions
          : spellcheckModelOptions
        ).map((model) => ({
          value: model.id,
          label: model.displayName || model.id,
        }))}
        selected={
          modelPicker === "research"
            ? (cursorSettings?.researchModel ?? "auto")
            : (cursorSettings?.spellcheckModel ?? "auto")
        }
        onSelect={(value) => {
          if (!value || !modelPicker) return;
          if (modelPicker === "research") {
            void patchCursorSettings({ researchModel: value });
          } else {
            void patchCursorSettings({ spellcheckModel: value });
          }
        }}
        onClose={() => setModelPicker(null)}
      />
    </>
  );
}

function GithubTab() {
  const { user, isLoaded } = useUser();
  const client = useMobileApiClient();
  const [status, setStatus] = useState<GithubConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchGithubConnectionStatus(client);
      setStatus(next);
      return next;
    } catch (reason) {
      setStatus(null);
      throw reason;
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh().catch(() => {
      // status card shows empty / not connected
    });
  }, [refresh]);

  async function onConnect() {
    if (!user || connecting) return;
    setConnecting(true);
    setActionError(null);
    try {
      const result = await startGithubOauthConnect(user);
      if (result === "success") {
        await user.reload();
        await refresh();
      }
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "Could not start GitHub connection.",
      );
    } finally {
      setConnecting(false);
    }
  }

  const connected = Boolean(status?.connected);
  const missingScopes = status?.missingScopes ?? [];
  const needsScopes = missingScopes.length > 0;
  const scopes = status?.scopes ?? [];
  const organizations = status?.organizations ?? [];
  const connectLabel =
    connected ||
    user?.externalAccounts.some((account) => {
      const provider = String(account.provider);
      return provider === "github" || provider === "oauth_github";
    })
      ? needsScopes
        ? "Grant missing scopes"
        : "Reconnect GitHub"
      : "Connect GitHub";

  const statusLabel = loading || !isLoaded
    ? "Loading…"
    : connected
      ? needsScopes
        ? "Connected — needs more access"
        : "Connected"
      : "Not connected";

  return (
    <SettingsCard
      title="Connection"
      description="Link GitHub so project panels can browse your personal repositories and repositories in organizations you belong to. Grant repo and read:org when prompted. Org owners may also need to approve the OAuth app under GitHub → Settings → Third-party access."
    >
      <SettingsFieldRow label="Status" value={statusLabel} muted={!connected} />
      <SettingsFieldRow
        label="Account"
        value={status?.login ?? "—"}
        muted={!status?.login}
      />
      <SettingsFieldRow
        label="Scopes"
        value={scopes.length > 0 ? scopes.join(", ") : "—"}
        muted={scopes.length === 0}
      />
      <SettingsFieldRow
        label="Organizations"
        value={
          organizations.length > 0
            ? organizations.map((org) => org.login).join(", ")
            : "—"
        }
        muted={organizations.length === 0}
      />
      <SettingsFieldRow
        label="Repositories"
        value={
          status?.repositoryCount == null
            ? "—"
            : String(status.repositoryCount)
        }
        muted={status?.repositoryCount == null}
      />
      {needsScopes ? (
        <Text style={styles.hint}>
          Missing scopes: {missingScopes.join(", ")}. Reconnect to grant{" "}
          {GITHUB_OAUTH_SCOPES.join(", ")}.
        </Text>
      ) : null}
      {actionError || (status?.reason && !connected) ? (
        <Text style={styles.hint}>{actionError ?? status?.reason}</Text>
      ) : null}
      {testMessage ? (
        <Text style={testOk ? styles.okText : styles.errorText}>
          {testMessage}
        </Text>
      ) : null}

      <Pressable
        onPress={() => {
          void onConnect();
        }}
        disabled={connecting || !user || loading}
        style={({ pressed }) => [
          styles.primaryButton,
          connecting || !user || loading ? { opacity: 0.5 } : null,
          pressed && !connecting ? { opacity: 0.9 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={connectLabel}
      >
        <Text style={styles.primaryButtonLabel}>
          {connecting ? "Opening GitHub…" : connectLabel}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          void (async () => {
            setTesting(true);
            setTestMessage(null);
            setTestOk(null);
            setActionError(null);
            try {
              const next = await refresh();
              if (!next.connected) {
                setTestOk(false);
                setTestMessage(next.reason ?? "GitHub is not connected.");
                return;
              }
              if (next.missingScopes.length > 0) {
                setTestOk(false);
                setTestMessage(
                  `Connected as ${next.login}, but missing scopes: ${next.missingScopes.join(", ")}.`,
                );
                return;
              }
              const orgLabel =
                next.organizations.length > 0
                  ? `${next.organizations.length} organization${next.organizations.length === 1 ? "" : "s"}`
                  : "no organizations";
              setTestOk(true);
              setTestMessage(
                `Connected as ${next.login} with ${orgLabel} visible.`,
              );
            } catch (error) {
              setTestOk(false);
              setTestMessage(
                error instanceof Error
                  ? error.message
                  : "GitHub connection test failed",
              );
            } finally {
              setTesting(false);
            }
          })();
        }}
        disabled={testing || loading}
        style={({ pressed }) => [
          styles.secondaryButton,
          testing || loading ? { opacity: 0.5 } : null,
          pressed ? { opacity: 0.85 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Test GitHub connection"
      >
        <Text style={styles.secondaryButtonLabel}>
          {testing ? "Testing…" : "Test connection"}
        </Text>
      </Pressable>
    </SettingsCard>
  );
}

function WhoopTab() {
  const client = useMobileApiClient();
  const [status, setStatus] = useState<WhoopSettingsStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await client.requestJson<WhoopSettingsStatus>(
        "/api/v1/whoop/status",
      );
      setStatus(next);
      return next;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not read Whoop status.";
      const fallback: WhoopSettingsStatus = {
        connected: false,
        configured: false,
        email: null,
        reason: message,
        envPath: "",
      };
      setStatus(fallback);
      return fallback;
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connected = status?.connected ?? false;

  return (
    <SettingsCard
      title="Connection"
      description="Recovery, sleep, and strain appear above journal entries when Whoop credentials are configured. Tokens are read from a local totem.env file under ~/.backsteros-agent/. BacksterOS does not store Whoop passwords."
    >
      <SettingsFieldRow
        label="Status"
        value={
          status === null ? "Loading…" : connected ? "Connected" : "Not connected"
        }
        muted={!connected}
      />
      <SettingsFieldRow
        label="Account"
        value={status?.email ?? "—"}
        muted
      />
      {!connected && status?.reason ? (
        <Text style={styles.hint}>{status.reason}</Text>
      ) : null}
      {connected ? (
        <Text style={styles.hint}>
          Credentials are present. Use Test connection to load today’s
          recovery, sleep, and strain snapshot.
        </Text>
      ) : status?.envPath ? (
        <Text style={styles.hint}>Looking for tokens at {status.envPath}</Text>
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
              const result = await client.requestJson<WhoopDayResult>(
                `/api/v1/whoop/day?date=${encodeURIComponent(todayIsoDate())}`,
              );
              await refresh();
              if (!result.authenticated) {
                setTestOk(false);
                setTestMessage(
                  result.error ??
                    "Whoop is not connected. Add refresh or bearer tokens to totem.env.",
                );
                return;
              }
              if (result.snapshot) {
                setTestOk(true);
                setTestMessage("Connected — today’s Whoop snapshot loaded.");
                return;
              }
              setTestOk(false);
              setTestMessage(
                result.error ?? "Could not load today’s Whoop snapshot.",
              );
            } catch (error) {
              setTestOk(false);
              setTestMessage(
                error instanceof Error
                  ? error.message
                  : "Whoop connection test failed",
              );
            } finally {
              setTesting(false);
            }
          })();
        }}
        disabled={testing || status === null}
        style={({ pressed }) => [
          styles.primaryButton,
          testing || status === null ? { opacity: 0.5 } : null,
          pressed && !testing ? { opacity: 0.9 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Test Whoop connection"
      >
        <Text style={styles.primaryButtonLabel}>
          {testing ? "Testing…" : "Test connection"}
        </Text>
      </Pressable>
    </SettingsCard>
  );
}

function StorageTab() {
  const client = useMobileApiClient();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const body = await client.requestJson<{
        configured: boolean;
        vaultPath?: string | null;
      }>("/api/v1/settings/storage");
      setConfigured(body.configured);
      setVaultPath(body.vaultPath ?? null);
      setReason(body.configured ? null : STORAGE_NOT_CONFIGURED_REASON);
      return {
        configured: body.configured,
        vaultPath: body.vaultPath ?? null,
      } as const;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not reach the API to check storage.";
      setConfigured(false);
      setVaultPath(null);
      setReason(message);
      return { error: message } as const;
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SettingsCard
      title="Connection"
      description="Documents, journal notes, and letter PDFs live in a local Obsidian-style vault on the computer running the API. Pick a folder once on desktop; BacksterOS creates Journal, Projects, Letters, and Knowledge Base automatically."
    >
      <SettingsFieldRow
        label="Status"
        value={
          configured === null
            ? "Loading…"
            : configured
              ? "Configured"
              : "Not configured"
        }
        muted={!configured}
      />
      <SettingsFieldRow
        label="Vault path"
        value={vaultPath ?? "—"}
        muted
      />
      {reason ? <Text style={styles.hint}>{reason}</Text> : null}
      {configured ? (
        <Text style={styles.hint}>
          Project folders get Documents, Updates, and .cursor skills; Codebase
          is added only for codebase projects. Choose or change the vault folder
          from desktop Settings → Storage.
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
            const result = await refresh();
            if ("error" in result) {
              setTestOk(false);
              setTestMessage(result.error ?? "Could not check storage.");
            } else if (result.configured) {
              setTestOk(true);
              setTestMessage(
                result.vaultPath
                  ? `Vault ready at ${result.vaultPath}`
                  : "Local vault is configured.",
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
        accessibilityLabel="Test storage connection"
      >
        <Text style={styles.primaryButtonLabel}>
          {testing ? "Testing…" : "Test connection"}
        </Text>
      </Pressable>
    </SettingsCard>
  );
}

function ServerSectionHeader({
  title,
  description,
  fullscreen,
  onToggleFullscreen,
}: {
  title: string;
  description: string;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  return (
    <View style={styles.serverHeader}>
      <View style={styles.serverHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.serverSectionDescription}>{description}</Text>
      </View>
      <Pressable
        onPress={onToggleFullscreen}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={
          fullscreen ? "Exit fullscreen terminal" : "Fullscreen terminal"
        }
        style={({ pressed }) => [
          styles.fullscreenButton,
          pressed ? { opacity: 0.7 } : null,
        ]}
      >
        <FullscreenIcon exit={fullscreen} size={20} />
      </Pressable>
    </View>
  );
}

export function SettingsScreen() {
  const { clerkPublishableKey } = getMobileEnvironment();
  const client = useMobileApiClient();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const visibleTabs = useMemo(() => getVisibleSettingsNavTabs(), []);
  const [serverFullscreen, setServerFullscreen] = useState(false);

  const initialTab = ((): SettingsTabId => {
    const raw = typeof params.tab === "string" ? params.tab : "";
    if (isSettingsTabId(raw, true)) return raw;
    return DEFAULT_SETTINGS_TAB;
  })();

  const [tab, setTab] = useState<SettingsTabId>(initialTab);
  const meta = getSettingsTabMeta(tab);
  const isServerTab = tab === "server" && Platform.OS === "ios";

  useEffect(() => {
    const raw = typeof params.tab === "string" ? params.tab : "";
    if (isSettingsTabId(raw, true)) {
      setTab(raw);
    }
  }, [params.tab]);

  useEffect(() => {
    if (!isSettingsTabId(tab, true)) {
      setTab(DEFAULT_SETTINGS_TAB);
    }
  }, [tab]);

  useEffect(() => {
    if (!isServerTab) setServerFullscreen(false);
  }, [isServerTab]);

  // Floating tab bar uses FullWindowOverlay — hide it on Server so it cannot
  // sit above the server pane and steal taps.
  useHideTabBar(isServerTab);
  // Go / Escape stay registered under Settings (tabs stay mounted) — suspend
  // them so Magic Keyboard keys are not swallowed by navigation shortcuts.
  useSuspendNavigationShortcuts(isServerTab);

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
          headerShown: !(isServerTab && serverFullscreen),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.background },
          gestureEnabled: !(isServerTab && serverFullscreen),
        }}
      />
      <View style={ui.screen}>
        {!(isServerTab && serverFullscreen) ? (
          <View style={styles.pillWrap}>
            <PillNav
              accessibilityLabel="Settings sections"
              items={visibleTabs.map((entry) => ({
                value: entry.id,
                label: entry.label,
              }))}
              value={tab}
              onChange={setTab}
            />
          </View>
        ) : null}
        {isServerTab ? (
          <View
            style={[
              styles.serverPane,
              serverFullscreen
                ? [
                    styles.serverFullscreen,
                    {
                      paddingTop: Math.max(insets.top, 8),
                      paddingBottom: Math.max(insets.bottom, 8),
                    },
                  ]
                : null,
            ]}
          >
            <ServerSectionHeader
              title={meta.label}
              description={meta.description}
              fullscreen={serverFullscreen}
              onToggleFullscreen={() =>
                setServerFullscreen((open) => !open)
              }
            />
            <SettingsServerTab />
          </View>
        ) : (
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
            {tab === "api" ? <ApiTab /> : null}
            {tab === "cursor" ? <CursorTab /> : null}
            {tab === "github" ? <GithubTab /> : null}
            {tab === "email" ? <SettingsEmailTab /> : null}
            {tab === "moneybird" ? <SettingsMoneybirdTab /> : null}
            {tab === "whoop" ? <WhoopTab /> : null}
            {tab === "storage" ? <StorageTab /> : null}
          </KeyboardAwareScrollView>
        )}
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
  serverPane: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.screenX,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 10,
  },
  serverFullscreen: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    elevation: 20,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenX,
    gap: 10,
  },
  serverHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    zIndex: 1,
  },
  serverHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  fullscreenButton: {
    marginTop: 2,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
  serverSectionDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  subtabs: {
    marginBottom: 0,
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
    width: 100,
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
  fieldCaption: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
  },
  toggleLabel: {
    color: colors.foreground,
    fontSize: 15,
    flex: 1,
  },
  instructionsInput: {
    minHeight: 140,
    paddingTop: 10,
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
  secondaryButton: {
    marginTop: 4,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
  renameRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  renameInput: {
    flexGrow: 1,
    minWidth: 120,
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
