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

export function SettingsEmailTab({
  title,
  description,
  hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
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
  const [grokWebhookUrlDraft, setGrokWebhookUrlDraft] = useState("");
  const [grokWebhookKeyDraft, setGrokWebhookKeyDraft] = useState("");
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
      grokWebhookUrl?: string;
      grokWebhookKey?: string;
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
    replyGreetingTemplateEn?: string;
    replyGreetingTemplateNl?: string;
    replySignOffTemplateEn?: string;
    replySignOffTemplateNl?: string;
    inboxContacts?: Record<string, string | null>;
    grokWebhookUrl?: string;
    grokWebhookKey?: string;
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

  const onSaveReplyTemplates = async () => {
    await patchSettings({
      replyGreetingTemplateEn: greetingDraftEn,
      replyGreetingTemplateNl: greetingDraftNl,
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
    await patchSettings({ apiKey: "" });
    setApiKeyDraft("");
  };

  const onSaveGrokWebhook = async () => {
    const url = grokWebhookUrlDraft.trim();
    const key = grokWebhookKeyDraft.trim();
    if (!settings?.grokWebhookConfigured && (!url || !key)) {
      setSettingsError(
        "Paste both the Grok Bot webhook URL and key, then click Save Grok webhook.",
      );
      return;
    }
    if (!url && !key) return;
    setSettingsError(null);
    const patch: {
      grokWebhookUrl?: string;
      grokWebhookKey?: string;
    } = {};
    // Always send whatever was typed; omit only when updating key/url alone on an
    // already-configured webhook.
    if (url) patch.grokWebhookUrl = url;
    else if (!settings?.grokWebhookConfigured) patch.grokWebhookUrl = "";
    if (key) patch.grokWebhookKey = key;
    else if (!settings?.grokWebhookConfigured) patch.grokWebhookKey = "";

    const body = await patchSettings(patch);
    if (!body) return;
    setGrokWebhookUrlDraft("");
    setGrokWebhookKeyDraft("");
    if (!body.grokWebhookConfigured) {
      setSettingsError(
        "Saved, but Grok webhook is still incomplete — both URL and key are required.",
      );
    }
  };

  const onClearGrokWebhook = async () => {
    await patchSettings({ grokWebhookUrl: "", grokWebhookKey: "" });
    setGrokWebhookUrlDraft("");
    setGrokWebhookKeyDraft("");
  };

  const connected = settings?.connected ?? false;
  const allInboxes = useMemo(() => {
    if (!settings) return [];
    if (settings.inboxes?.length) return settings.inboxes;
    return inboxes;
  }, [inboxes, settings]);

  const inboxLabel =
    allInboxes.length === 0
      ? "—"
      : allInboxes.length === 1
        ? allInboxes[0]!.displayName?.trim() ||
          allInboxes[0]!.email ||
          allInboxes[0]!.inboxId
        : `${allInboxes.length} inboxes`;

  const contactOptions = useMemo(
    () => buildContactDropdownOptions(contacts),
    [contacts],
  );

  return (
    <>
      <IntegrationConnectionSettingsView
        title={title}
        headerDescription={description}
        hideHeader={hideHeader}
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
              : "Not connected"
        }
        secondaryLabel="Inboxes"
        secondaryValue={inboxLabel}
        reason={null}
        hint={
          connected
            ? settings?.webhookConfigured
              ? "All AgentMail inboxes are included. Inbound webhook connected — new mail refreshes open shells."
              : "All AgentMail inboxes are included. Set AGENTS_PUBLIC_URL on core for live inbound webhooks."
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
          English and Dutch templates are chosen automatically from the email
          text.
        </p>
        <div className="settings-field">
          <span className="settings-field__label-row">
            Language
            <SegmentedPillToggle
              value={templateLanguage}
              options={[
                { value: "en", label: "English" },
                { value: "nl", label: "Dutch" },
              ]}
              onChange={setTemplateLanguage}
              disabled={saving || settings === null}
              ariaLabel="Reply template language"
            />
          </span>
        </div>
        <label className="settings-field">
          Greeting
          <input
            type="text"
            value={
              templateLanguage === "en" ? greetingDraftEn : greetingDraftNl
            }
            disabled={saving || settings === null}
            onChange={(event) => {
              if (templateLanguage === "en") {
                setGreetingDraftEn(event.target.value);
              } else {
                setGreetingDraftNl(event.target.value);
              }
            }}
          />
        </label>
        <label className="settings-field">
          Sign-off
          <textarea
            rows={3}
            value={
              templateLanguage === "en" ? signOffDraftEn : signOffDraftNl
            }
            disabled={saving || settings === null}
            onChange={(event) => {
              if (templateLanguage === "en") {
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
        <h2>Grok Bot (concept drafts)</h2>
        <p>
          When you message the agent from an email thread, BacksterOS wakes this
          Grok Bot webhook with the thread and your instruction. The bot posts
          the drafted body back; you review the concept and send yourself.
        </p>
        <label className="settings-field">
          Webhook URL
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              settings?.grokWebhookConfigured
                ? `Configured (${settings.grokWebhookUrlPreview ?? "••••"})`
                : "https://…"
            }
            value={grokWebhookUrlDraft}
            onChange={(event) => setGrokWebhookUrlDraft(event.target.value)}
          />
        </label>
        <label className="settings-field">
          Webhook key
          <input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.grokWebhookConfigured
                ? "Configured (leave blank to keep)"
                : "Paste Grok Bot webhook key…"
            }
            value={grokWebhookKeyDraft}
            onChange={(event) => setGrokWebhookKeyDraft(event.target.value)}
          />
        </label>
        <div className="settings-cursor-key-actions">
          <button
            type="button"
            disabled={
              saving ||
              settings === null ||
              (!settings.grokWebhookConfigured &&
                (!grokWebhookUrlDraft.trim() || !grokWebhookKeyDraft.trim())) ||
              (settings.grokWebhookConfigured &&
                !grokWebhookUrlDraft.trim() &&
                !grokWebhookKeyDraft.trim())
            }
            onClick={() => void onSaveGrokWebhook()}
          >
            {saving ? "Saving…" : "Save Grok webhook"}
          </button>
          <button
            type="button"
            disabled={saving || !settings?.grokWebhookConfigured}
            onClick={() => void onClearGrokWebhook()}
          >
            Clear
          </button>
        </div>
        <p className="settings-hint">
          {settings?.grokWebhookConfigured
            ? `Configured: ${settings.grokWebhookUrlPreview}`
            : "Not configured — paste URL + key, then click Save Grok webhook."}
        </p>
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
          and store it here. Organization-scoped keys include every inbox
          automatically.
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
          <h2>Inbox identities</h2>
          <p>
            Backsteros reads every AgentMail inbox for this API key. Link a
            contact to each inbox for avatars and sender details when composing
            email.
          </p>
          {allInboxes.length === 0 ? (
            <p className="settings-hint">
              No inboxes visible for this API key yet.
            </p>
          ) : null}
          {allInboxes.length > 0 ? (
            <div className="settings-inbox-contact-links">
              {!workspace.ready && contacts.length === 0 ? (
                <p className="settings-hint">Loading contacts…</p>
              ) : contacts.length === 0 ? (
                <p className="settings-hint">
                  Add contacts in Contacts before linking inbox identities.
                </p>
              ) : null}
              <ul className="settings-inbox-contact-list">
                {allInboxes.map((inbox) => {
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
