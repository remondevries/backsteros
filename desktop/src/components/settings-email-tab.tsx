import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgentMailInboxSummary,
  AgentMailSettings,
  AgentMailTestConnectionResult,
} from "@backsteros/contracts";
import {
  IntegrationConnectionSettingsView,
  SearchableDropdown,
  SegmentedPillToggle,
  buildContactDropdownOptions,
  DROPDOWN_NONE_VALUE,
  resolveDropdownNone,
  type AssigneeDropdownContact,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap, withAvatarSrc } from "../lib/avatar-src";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

function inboxOptionLabel(inbox: AgentMailInboxSummary): string {
  const name = inbox.displayName?.trim();
  return name ? `${name} (${inbox.email})` : inbox.email;
}

export function SettingsEmailTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );
  const contacts = useMemo(
    () =>
      withAvatarSrc(workspace.contacts, contactAvatarSrc) as AssigneeDropdownContact[],
    [contactAvatarSrc, workspace.contacts],
  );
  const [settings, setSettings] = useState<AgentMailSettings | null>(null);
  const [inboxes, setInboxes] = useState<AgentMailInboxSummary[]>([]);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkingInboxId, setLinkingInboxId] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [greetingDraft, setGreetingDraft] = useState("Hi {firstName},");
  const [signOffDraftEn, setSignOffDraftEn] = useState("Best,\n{name}");
  const [signOffDraftNl, setSignOffDraftNl] = useState(
    "Met vriendelijke groet,\n{name}",
  );
  const [signOffLanguage, setSignOffLanguage] = useState<"en" | "nl">("en");

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
              ? "Core API error — run `pnpm --filter @backsteros/server db:migrate`, restart the API, then try again."
              : error.message
            : "Could not save E-mail settings.",
        );
        return null;
      }
    },
    [client, loadInboxes],
  );

  const patchSettings = async (patch: {
    apiKey?: string;
    inboxId?: string | null;
    inboxIds?: string[];
    replyGreetingTemplate?: string;
    replySignOffTemplateEn?: string;
    replySignOffTemplateNl?: string;
    inboxContacts?: Record<string, string | null>;
  }): Promise<AgentMailSettings | null> => {
    setSaving(true);
    try {
      return await applySettingsPatch(patch);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!settings) return;
    setGreetingDraft(settings.replyGreetingTemplate);
    setSignOffDraftEn(settings.replySignOffTemplateEn);
    setSignOffDraftNl(settings.replySignOffTemplateNl);
  }, [
    settings?.replyGreetingTemplate,
    settings?.replySignOffTemplateEn,
    settings?.replySignOffTemplateNl,
  ]);

  const replyTemplatesDirty =
    settings != null &&
    (greetingDraft !== settings.replyGreetingTemplate ||
      signOffDraftEn !== settings.replySignOffTemplateEn ||
      signOffDraftNl !== settings.replySignOffTemplateNl);

  const onSaveReplyTemplates = async () => {
    await patchSettings({
      replyGreetingTemplate: greetingDraft,
      replySignOffTemplateEn: signOffDraftEn,
      replySignOffTemplateNl: signOffDraftNl,
    });
  };

  const onSaveKey = async () => {
    const value = apiKeyDraft.trim();
    if (!value) return;
    const body = await patchSettings({ apiKey: value });
    if (body) setApiKeyDraft("");
  };

  const onClearKey = async () => {
    await patchSettings({ apiKey: "", inboxIds: [] });
    setApiKeyDraft("");
  };

  const connected = settings?.connected ?? false;
  const selectedIds = settings?.inboxIds ?? (settings?.inboxId ? [settings.inboxId] : []);
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

  const inboxOptions = useMemo(
    () =>
      inboxes.map((inbox) => ({
        value: inbox.inboxId,
        label: inboxOptionLabel(inbox),
        searchTerms: [inbox.email, inbox.displayName ?? "", inbox.inboxId]
          .filter(Boolean)
          .join(" "),
      })),
    [inboxes],
  );

  const contactOptions = useMemo(
    () => buildContactDropdownOptions(contacts),
    [contacts],
  );

  return (
    <>
      <IntegrationConnectionSettingsView
        title={title}
        headerDescription={description}
        connected={settings === null ? undefined : connected}
        body={
          <p>
            Connect an{" "}
            <a
              href="https://console.agentmail.to"
              target="_blank"
              rel="noreferrer"
            >
              AgentMail API key
            </a>{" "}
            to read messages from your inbox in Backsteros. Keys are stored in
            core (not synced via PowerSync).
          </p>
        }
        statusLabel={
          settings === null
            ? "Loading…"
            : connected
              ? "Connected"
              : settings.apiKeyConfigured
                ? "API key saved — pick inboxes"
                : "Not connected"
        }
        secondaryLabel="Inboxes"
        secondaryValue={inboxLabel}
        reason={
          !connected && settings?.apiKeyConfigured
            ? "Select one or more inboxes below, then test the connection."
            : null
        }
        hint={
          connected
            ? settings?.webhookConfigured
              ? "Inbound webhook connected — new mail refreshes open shells."
              : "Inbox messages appear when shells fetch them. Set AGENTS_PUBLIC_URL on core for live inbound webhooks."
            : null
        }
        testing={testing}
        testMessage={testMessage}
        testOk={testOk}
        testDisabled={settings === null || !settings.apiKeyConfigured}
        onTestConnection={() => {
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
      />

      <section className="settings-card">
        <h2>Reply template</h2>
        <p>
          Greeting and sign-off are applied automatically to every reply
          concept. Only the body is editable in the email editor. Use{" "}
          <code>{"{firstName}"}</code> for the recipient&apos;s first name and{" "}
          <code>{"{name}"}</code> for the linked contact on the sending inbox.
          English and Dutch sign-offs are chosen automatically from the email
          text.
        </p>
        <label className="settings-field">
          Greeting
          <input
            type="text"
            value={greetingDraft}
            disabled={saving || settings === null}
            onChange={(event) => setGreetingDraft(event.target.value)}
          />
        </label>
        <label className="settings-field">
          <span className="settings-field__label-row">
            Sign-off
            <SegmentedPillToggle
              value={signOffLanguage}
              options={[
                { value: "en", label: "English" },
                { value: "nl", label: "Dutch" },
              ]}
              onChange={setSignOffLanguage}
              disabled={saving || settings === null}
              ariaLabel="Sign-off language"
            />
          </span>
          <textarea
            rows={3}
            value={signOffLanguage === "en" ? signOffDraftEn : signOffDraftNl}
            disabled={saving || settings === null}
            onChange={(event) => {
              if (signOffLanguage === "en") {
                setSignOffDraftEn(event.target.value);
              } else {
                setSignOffDraftNl(event.target.value);
              }
            }}
          />
        </label>
        <div className="settings-cursor-key-actions">
          <button
            type="button"
            disabled={saving || settings === null || !replyTemplatesDirty}
            onClick={() => void onSaveReplyTemplates()}
          >
            {saving ? "Saving…" : "Save reply template"}
          </button>
        </div>
      </section>

      <section className="settings-card">
        <h2>API key</h2>
        <p>
          Create an API key in the{" "}
          <a
            href="https://docs.agentmail.to/knowledge-base/getting-api-key.md"
            target="_blank"
            rel="noreferrer"
          >
            AgentMail console
          </a>{" "}
          and store it here. Organization-scoped keys can list all inboxes;
          inbox-scoped keys auto-select that inbox.
        </p>
        <label className="settings-field">
          AgentMail API key
          <input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.apiKeyConfigured
                ? `Configured (${settings.apiKeyPreview ?? "••••"})`
                : "Paste API key…"
            }
            value={apiKeyDraft}
            onChange={(event) => setApiKeyDraft(event.target.value)}
          />
        </label>
        <div className="settings-cursor-key-actions">
          <button
            type="button"
            disabled={saving || !apiKeyDraft.trim()}
            onClick={() => void onSaveKey()}
          >
            {saving ? "Saving…" : "Save key"}
          </button>
          <button
            type="button"
            disabled={saving || !settings?.apiKeyConfigured}
            onClick={() => void onClearKey()}
          >
            Clear key
          </button>
        </div>
        {settings?.apiKeyConfigured ? (
          <p className="settings-hint">
            Key on file: {settings.apiKeyPreview}
            {" · "}
            Inbound webhook:{" "}
            {settings.webhookConfigured
              ? "connected"
              : "not configured (set AGENTS_PUBLIC_URL on core)"}
          </p>
        ) : (
          <p className="settings-hint">
            No key stored. Inbox email stays unavailable until you save one.
          </p>
        )}
        {settingsError ? (
          <p className="settings-cursor-error">{settingsError}</p>
        ) : null}
      </section>

      {settings?.apiKeyConfigured ? (
        <section className="settings-card">
          <h2>Inboxes</h2>
          <p>
            Choose which AgentMail inboxes Backsteros should read. If your key
            is scoped to a single inbox, it is selected automatically. Later,
            this choice will control which inboxes appear in the app.
          </p>
          <div className="settings-field">
            <span>Inboxes</span>
            <div className="settings-inbox-picker">
              <SearchableDropdown
                multiple
                values={selectedIds}
                options={inboxOptions}
                disabled={saving || inboxes.length === 0}
                emptySelectionLabel={
                  inboxes.length === 0
                    ? "Could not load inboxes"
                    : "Select inboxes…"
                }
                searchPlaceholder="Search inboxes…"
                ariaLabel="AgentMail inboxes"
                onValuesChange={(next) => {
                  void patchSettings({ inboxIds: next });
                }}
              />
              {selectedInboxes.length > 0 ? (
                <div className="settings-inbox-account-labels">
                  {selectedInboxes.map((inbox) => {
                    const label = inbox.email?.trim() || inbox.inboxId;
                    return (
                      <button
                        key={inbox.inboxId}
                        type="button"
                        className="settings-inbox-account-label"
                        title={`Remove ${label}`}
                        disabled={saving}
                        onClick={() => {
                          void patchSettings({
                            inboxIds: selectedIds.filter(
                              (id) => id !== inbox.inboxId,
                            ),
                          });
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
          {selectedInboxes.length > 0 ? (
            <div className="settings-inbox-contact-links">
              <h3>Inbox identities</h3>
              <p>
                Link a contact to each inbox for avatars and sender details when
                composing email.
              </p>
              {!workspace.ready && contacts.length === 0 ? (
                <p className="settings-hint">Loading contacts…</p>
              ) : contacts.length === 0 ? (
                <p className="settings-hint">
                  Add contacts in Contacts before linking inbox identities.
                </p>
              ) : null}
              <ul className="settings-inbox-contact-list">
                {selectedInboxes.map((inbox) => {
                  const linkedContactId = inbox.contactId?.trim() || null;
                  return (
                    <li
                      key={inbox.inboxId}
                      className="settings-inbox-contact-row"
                    >
                      <div className="settings-inbox-contact-row__inbox">
                        <strong>{inbox.email}</strong>
                        {inbox.displayName?.trim() ? (
                          <span className="settings-inbox-contact-row__meta">
                            {inbox.displayName}
                          </span>
                        ) : null}
                      </div>
                      <div className="settings-inbox-contact-row__contact">
                        <SearchableDropdown
                          value={linkedContactId ?? DROPDOWN_NONE_VALUE}
                          options={contactOptions}
                          disabled={
                            linkingInboxId === inbox.inboxId ||
                            (!workspace.ready && contacts.length === 0) ||
                            contacts.length === 0
                          }
                          emptySelectionLabel="No contact"
                          searchPlaceholder="Link contact…"
                          ariaLabel={`Contact for ${inbox.email}`}
                          triggerClassName="property-dropdown-trigger--settings-field"
                          onChange={(next) => {
                            void (async () => {
                              setLinkingInboxId(inbox.inboxId);
                              try {
                                await applySettingsPatch({
                                  inboxContacts: {
                                    [inbox.inboxId]: resolveDropdownNone(next),
                                  },
                                });
                              } finally {
                                setLinkingInboxId(null);
                              }
                            })();
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {settingsError ? (
                <p className="settings-cursor-error">{settingsError}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
