import type {
  AgentMailInboxSummary,
  AgentMailSettings,
  AgentMailTestConnectionResult,
} from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { colors } from "../../lib/theme";
import { useLocalQuery } from "../../lib/use-local-query";
import { PropertyOptionSheet } from "../property-option-sheet";
import { SegmentedPillToggle } from "../segmented-pill-toggle";
import { TextInput } from "../app-text-input";
import {
  SettingsCard,
  SettingsFieldRow,
} from "./settings-primitives";

const CONTACTS_SQL = `SELECT id, name FROM contacts
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

type ContactRow = { id: string; name: string | null };

function inboxOptionLabel(inbox: AgentMailInboxSummary): string {
  const name = inbox.displayName?.trim();
  return name ? `${name} (${inbox.email})` : inbox.email;
}

export function SettingsEmailTab() {
  const client = useMobileApiClient();
  const { data: contacts } = useLocalQuery<ContactRow>(CONTACTS_SQL);
  const [settings, setSettings] = useState<AgentMailSettings | null>(null);
  const [inboxes, setInboxes] = useState<AgentMailInboxSummary[]>([]);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkingInboxId, setLinkingInboxId] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [greetingDraftEn, setGreetingDraftEn] = useState("Hi {firstName},");
  const [greetingDraftNl, setGreetingDraftNl] = useState("Beste {firstName},");
  const [signOffDraftEn, setSignOffDraftEn] = useState("Best,\n{name}");
  const [signOffDraftNl, setSignOffDraftNl] = useState(
    "Met vriendelijke groet,\n{name}",
  );
  const [templateLanguage, setTemplateLanguage] = useState<"en" | "nl">("en");
  const [contactPickerInboxId, setContactPickerInboxId] = useState<string | null>(
    null,
  );

  const loadInboxes = useCallback(
    async (configured: boolean) => {
      if (!configured) {
        setInboxes([]);
        return;
      }
      try {
        const body = await client.requestJson<{
          inboxes: AgentMailInboxSummary[];
        }>("/api/v1/settings/agentmail/inboxes");
        setInboxes(body.inboxes);
      } catch {
        setInboxes([]);
      }
    },
    [client],
  );

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<AgentMailSettings>(
        "/api/v1/settings/agentmail",
      );
      setSettings(body);
      setSettingsError(null);
      await loadInboxes(body.apiKeyConfigured);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load E-mail settings.",
      );
      return null;
    }
  }, [client, loadInboxes]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const applySettingsPatch = useCallback(
    async (patch: {
      apiKey?: string;
      inboxId?: string | null;
      inboxIds?: string[];
      replyGreetingTemplate?: string;
      replyGreetingTemplateEn?: string;
      replyGreetingTemplateNl?: string;
      replySignOffTemplateEn?: string;
      replySignOffTemplateNl?: string;
      inboxContacts?: Record<string, string | null>;
    }): Promise<AgentMailSettings | null> => {
      setSettingsError(null);
      try {
        const body = await client.requestJson<AgentMailSettings>(
          "/api/v1/settings/agentmail",
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        setSettings(body);
        await loadInboxes(body.apiKeyConfigured);
        return body;
      } catch (error) {
        setSettingsError(
          error instanceof Error
            ? error.message.includes("Internal server error")
              ? "Core API error — run migrations and restart the API, then try again."
              : error.message
            : "Could not save E-mail settings.",
        );
        return null;
      }
    },
    [client, loadInboxes],
  );

  const patchSettings = async (patch: Parameters<typeof applySettingsPatch>[0]) => {
    setSaving(true);
    try {
      return await applySettingsPatch(patch);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!settings) return;
    setGreetingDraftEn(
      settings.replyGreetingTemplateEn ?? settings.replyGreetingTemplate,
    );
    setGreetingDraftNl(settings.replyGreetingTemplateNl);
    setSignOffDraftEn(settings.replySignOffTemplateEn);
    setSignOffDraftNl(settings.replySignOffTemplateNl);
  }, [
    settings?.replyGreetingTemplate,
    settings?.replyGreetingTemplateEn,
    settings?.replyGreetingTemplateNl,
    settings?.replySignOffTemplateEn,
    settings?.replySignOffTemplateNl,
  ]);

  const replyTemplatesDirty =
    settings != null &&
    (greetingDraftEn !==
      (settings.replyGreetingTemplateEn ?? settings.replyGreetingTemplate) ||
      greetingDraftNl !== settings.replyGreetingTemplateNl ||
      signOffDraftEn !== settings.replySignOffTemplateEn ||
      signOffDraftNl !== settings.replySignOffTemplateNl);

  const connected = settings?.connected ?? false;
  const selectedIds =
    settings?.inboxIds ?? (settings?.inboxId ? [settings.inboxId] : []);

  const selectedInboxes = useMemo(() => {
    if (!settings) return [];
    const listedById = new Map(inboxes.map((inbox) => [inbox.inboxId, inbox]));
    const stored = settings.inboxes ?? [];
    return selectedIds
      .map((id) => {
        const listed = listedById.get(id);
        const fromSettings = stored.find((inbox) => inbox.inboxId === id);
        if (listed && fromSettings) {
          return {
            ...listed,
            contactId: fromSettings.contactId ?? listed.contactId ?? null,
            contactName: fromSettings.contactName ?? listed.contactName ?? null,
          };
        }
        return listed ?? fromSettings ?? null;
      })
      .filter((inbox): inbox is AgentMailInboxSummary => inbox != null);
  }, [inboxes, selectedIds, settings]);

  const inboxLabel =
    selectedInboxes.length === 0
      ? "—"
      : selectedInboxes.length === 1
        ? selectedInboxes[0]!.displayName?.trim() ||
          selectedInboxes[0]!.email ||
          selectedInboxes[0]!.inboxId
        : `${selectedInboxes.length} inboxes`;

  const contactOptions = useMemo(
    () => [
      { value: "", label: "No contact" },
      ...(contacts ?? []).map((contact) => ({
        value: contact.id,
        label: contact.name?.trim() || contact.id,
      })),
    ],
    [contacts],
  );

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
        description="Connect an AgentMail API key to read messages from your inbox in BacksterOS. Keys are stored in core (not synced via PowerSync)."
      >
        <SettingsFieldRow
          label="Status"
          value={
            connected
              ? "Connected"
              : settings?.apiKeyConfigured
                ? "API key saved — pick inboxes"
                : "Not connected"
          }
          muted={!connected}
        />
        <SettingsFieldRow label="Inboxes" value={inboxLabel} muted={!connected} />
        {!connected && settings?.apiKeyConfigured ? (
          <Text style={styles.hint}>
            Select one or more inboxes below, then test the connection.
          </Text>
        ) : null}
        {connected ? (
          <Text style={styles.hint}>
            {settings?.webhookConfigured
              ? "Inbound webhook connected — new mail refreshes open shells."
              : "Set AGENTS_PUBLIC_URL on core for live inbound webhooks."}
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
                  await client.requestJson<AgentMailTestConnectionResult>(
                    "/api/v1/settings/agentmail/test",
                  );
                await loadSettings();
                setTestOk(result.ok);
                if (result.ok) {
                  const inbox = result.inboxEmail
                    ? ` (${result.inboxEmail})`
                    : "";
                  const count =
                    result.inboxCount != null
                      ? ` Inboxes visible: ${result.inboxCount}.`
                      : "";
                  setTestMessage(`Connected to AgentMail${inbox}.${count}`);
                } else {
                  setTestMessage(
                    result.error ?? "AgentMail connection test failed.",
                  );
                }
              } catch (error) {
                setTestOk(false);
                setTestMessage(
                  error instanceof Error
                    ? error.message
                    : "AgentMail connection test failed.",
                );
              } finally {
                setTesting(false);
              }
            })();
          }}
          disabled={testing || !settings?.apiKeyConfigured}
          style={({ pressed }) => [
            styles.primaryButton,
            testing || !settings?.apiKeyConfigured ? { opacity: 0.5 } : null,
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
        title="Reply template"
        description="Greeting and sign-off are applied automatically to every reply concept. Use {firstName} and {name} placeholders."
      >
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Language</Text>
          <SegmentedPillToggle
            value={templateLanguage}
            options={[
              { value: "en", label: "English" },
              { value: "nl", label: "Dutch" },
            ]}
            onChange={(value) => setTemplateLanguage(value as "en" | "nl")}
            disabled={saving || settings === null}
            accessibilityLabel="Reply template language"
          />
        </View>
        <Text style={styles.fieldLabel}>Greeting</Text>
        <TextInput
          value={templateLanguage === "en" ? greetingDraftEn : greetingDraftNl}
          editable={!saving && settings !== null}
          onChangeText={(value) => {
            if (templateLanguage === "en") setGreetingDraftEn(value);
            else setGreetingDraftNl(value);
          }}
        />
        <Text style={styles.fieldLabel}>Sign-off</Text>
        <TextInput
          value={templateLanguage === "en" ? signOffDraftEn : signOffDraftNl}
          editable={!saving && settings !== null}
          multiline
          style={styles.multiline}
          onChangeText={(value) => {
            if (templateLanguage === "en") setSignOffDraftEn(value);
            else setSignOffDraftNl(value);
          }}
        />
        <Pressable
          onPress={() => {
            void patchSettings({
              replyGreetingTemplateEn: greetingDraftEn,
              replyGreetingTemplateNl: greetingDraftNl,
              replySignOffTemplateEn: signOffDraftEn,
              replySignOffTemplateNl: signOffDraftNl,
            });
          }}
          disabled={saving || settings === null || !replyTemplatesDirty}
          style={({ pressed }) => [
            styles.primaryButton,
            saving || settings === null || !replyTemplatesDirty
              ? { opacity: 0.5 }
              : null,
            pressed ? { opacity: 0.9 } : null,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonLabel}>
            {saving ? "Saving…" : "Save reply template"}
          </Text>
        </Pressable>
      </SettingsCard>

      <SettingsCard
        title="API key"
        description="Create an API key in the AgentMail console and store it here."
      >
        <Text style={styles.fieldLabel}>AgentMail API key</Text>
        <TextInput
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={
            settings?.apiKeyConfigured
              ? `Configured (${settings.apiKeyPreview ?? "••••"})`
              : "Paste API key…"
          }
          value={apiKeyDraft}
          onChangeText={setApiKeyDraft}
        />
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              const value = apiKeyDraft.trim();
              if (!value) return;
              void patchSettings({ apiKey: value }).then((body) => {
                if (body) setApiKeyDraft("");
              });
            }}
            disabled={saving || !apiKeyDraft.trim()}
            style={({ pressed }) => [
              styles.primaryButtonCompact,
              saving || !apiKeyDraft.trim() ? { opacity: 0.5 } : null,
              pressed ? { opacity: 0.9 } : null,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonLabel}>
              {saving ? "Saving…" : "Save key"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void patchSettings({ apiKey: "", inboxIds: [] });
              setApiKeyDraft("");
            }}
            disabled={saving || !settings?.apiKeyConfigured}
            style={({ pressed }) => [
              styles.secondaryButtonInline,
              saving || !settings?.apiKeyConfigured ? { opacity: 0.5 } : null,
              pressed ? { opacity: 0.9 } : null,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonLabel}>Clear key</Text>
          </Pressable>
        </View>
        {settings?.apiKeyConfigured ? (
          <Text style={styles.hint}>
            Key on file: {settings.apiKeyPreview}
            {" · "}
            Inbound webhook:{" "}
            {settings.webhookConfigured ? "connected" : "not configured"}
          </Text>
        ) : (
          <Text style={styles.hint}>
            No key stored. Inbox email stays unavailable until you save one.
          </Text>
        )}
        {settingsError ? (
          <Text style={styles.errorText}>{settingsError}</Text>
        ) : null}
      </SettingsCard>

      {settings?.apiKeyConfigured ? (
        <SettingsCard
          title="Inboxes"
          description="Choose which AgentMail inboxes BacksterOS should read."
        >
          {inboxes.length === 0 ? (
            <Text style={styles.hint}>Could not load inboxes.</Text>
          ) : (
            inboxes.map((inbox) => {
              const selected = selectedIds.includes(inbox.inboxId);
              const label = inboxOptionLabel(inbox);
              return (
                <Pressable
                  key={inbox.inboxId}
                  onPress={() => {
                    const next = selected
                      ? selectedIds.filter((id) => id !== inbox.inboxId)
                      : [...selectedIds, inbox.inboxId];
                    void patchSettings({ inboxIds: next });
                  }}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.inboxRow,
                    selected ? styles.inboxRowSelected : null,
                    pressed ? { opacity: 0.85 } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={styles.inboxRowLabel}>{label}</Text>
                  <Text style={styles.inboxRowCheck}>{selected ? "✓" : ""}</Text>
                </Pressable>
              );
            })
          )}
          {selectedInboxes.length > 0 ? (
            <>
              <Text style={styles.subheading}>Inbox identities</Text>
              {selectedInboxes.map((inbox) => {
                const linkedContactId = inbox.contactId?.trim() || null;
                const linkedContactName =
                  inbox.contactName?.trim() ||
                  contacts?.find((contact) => contact.id === linkedContactId)
                    ?.name?.trim() ||
                  "No contact";
                return (
                  <SettingsFieldRow
                    key={inbox.inboxId}
                    label={inbox.email}
                    value={linkedContactName}
                    muted={!linkedContactId}
                    onPress={() => setContactPickerInboxId(inbox.inboxId)}
                  />
                );
              })}
            </>
          ) : null}
        </SettingsCard>
      ) : null}

      <PropertyOptionSheet
        visible={contactPickerInboxId != null}
        title="Link contact"
        options={contactOptions}
        selected={
          selectedInboxes.find((inbox) => inbox.inboxId === contactPickerInboxId)
            ?.contactId ?? ""
        }
        onSelect={(value) => {
          if (!contactPickerInboxId) return;
          const inboxId = contactPickerInboxId;
          setContactPickerInboxId(null);
          setLinkingInboxId(inboxId);
          void applySettingsPatch({
            inboxContacts: {
              [inboxId]: value || null,
            },
          }).finally(() => setLinkingInboxId(null));
        }}
        onClose={() => setContactPickerInboxId(null)}
      />

      {linkingInboxId ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : null}
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
  multiline: {
    minHeight: 88,
    paddingTop: 10,
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
  subheading: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
    marginTop: 8,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.faint,
  },
  chipLabel: {
    color: colors.foreground,
    fontSize: 13,
  },
  inboxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  inboxRowSelected: {
    backgroundColor: colors.faint,
  },
  inboxRowLabel: {
    flex: 1,
    color: colors.foreground,
    fontSize: 14,
  },
  inboxRowCheck: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "700",
    width: 20,
    textAlign: "right",
  },
});
