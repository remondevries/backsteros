import { useEffect, useMemo, useState } from "react";

import { fetchBacksterosContacts, testBacksterosConnection } from "~/backsteros/client";
import {
  DEFAULT_BACKSTEROS_API_URL,
  DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
  useBacksterosSettingsStore,
} from "~/backsteros/settingsStore";
import type { BacksterosContact } from "~/backsteros/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const NONE_VALUE = "__none__";

function contactLabel(contact: BacksterosContact): string {
  const name = contact.name?.trim();
  if (name) return name;
  const composed = [contact.firstName, contact.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  if (composed) return composed;
  return contact.email?.trim() || contact.id;
}

async function persistAgentProfile(contactId: string | null): Promise<void> {
  const response = await fetch("/api/backsteros/agent-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ contactId }),
  });
  if (!response.ok) {
    throw new Error(`Could not save agent contact profile (${response.status})`);
  }
}

export function BacksterosConnectionSetting() {
  const apiUrl = useBacksterosSettingsStore((state) => state.apiUrl);
  const localCoreUrl = useBacksterosSettingsStore((state) => state.localCoreUrl);
  const apiKey = useBacksterosSettingsStore((state) => state.apiKey);
  const enabled = useBacksterosSettingsStore((state) => state.enabled);
  const agentContactId = useBacksterosSettingsStore((state) => state.agentContactId);
  const setConnection = useBacksterosSettingsStore((state) => state.setConnection);
  const setEnabled = useBacksterosSettingsStore((state) => state.setEnabled);
  const setAgentContactId = useBacksterosSettingsStore((state) => state.setAgentContactId);
  const [draftKey, setDraftKey] = useState(apiKey);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "ok" | "error">("idle");
  const [contacts, setContacts] = useState<readonly BacksterosContact[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    setDraftKey(apiKey);
    setTestStatus("idle");
  }, [apiKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/backsteros/agent-profile", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { contactId?: string | null };
        if (cancelled) return;
        const fromDisk =
          typeof data.contactId === "string" && data.contactId.trim()
            ? data.contactId.trim()
            : null;
        setAgentContactId((current) => (fromDisk !== current ? fromDisk : current));
      } catch {
        // Host file optional until first save.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !apiKey.trim()) {
      setContacts([]);
      setContactsError(null);
      setContactsLoading(false);
      return;
    }
    let cancelled = false;
    setContactsLoading(true);
    setContactsError(null);
    void fetchBacksterosContacts()
      .then((list) => {
        if (cancelled) return;
        setContacts(list);
      })
      .catch((cause) => {
        if (cancelled) return;
        setContacts([]);
        setContactsError(cause instanceof Error ? cause.message : "Could not load contacts");
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl, apiKey, enabled]);

  const sortedContacts = useMemo(
    () =>
      [...contacts].sort((a, b) =>
        contactLabel(a).localeCompare(contactLabel(b), undefined, { sensitivity: "base" }),
      ),
    [contacts],
  );

  const selectedContact = useMemo(
    () => sortedContacts.find((contact) => contact.id === agentContactId) ?? null,
    [agentContactId, sortedContacts],
  );

  const trimmedDraftKey = draftKey.trim();
  const isDirty = draftKey !== apiKey;
  const canReset =
    apiUrl.trim() !== DEFAULT_BACKSTEROS_API_URL ||
    localCoreUrl.trim() !== DEFAULT_BACKSTEROS_LOCAL_CORE_URL ||
    apiKey.trim().length > 0 ||
    enabled ||
    agentContactId != null ||
    isDirty;

  const persistKey = (nextKey: string, nextEnabled = enabled) => {
    setConnection({
      apiUrl: apiUrl.trim() || DEFAULT_BACKSTEROS_API_URL,
      localCoreUrl: localCoreUrl.trim() || DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
      apiKey: nextKey,
      enabled: nextEnabled,
    });
  };

  const save = () => {
    persistKey(trimmedDraftKey, enabled || trimmedDraftKey.length > 0);
    setTestStatus("idle");
  };

  const onEnabledChange = (checked: boolean) => {
    setEnabled(checked);
    setTestStatus("idle");
    if (checked && !trimmedDraftKey && !apiKey.trim()) {
      toastManager.add({
        type: "error",
        title: "API key required",
        description: "Paste a BacksterOS Access key to turn the connection on.",
      });
    }
  };

  const reset = () => {
    setDraftKey("");
    setTestStatus("idle");
    setConnection({
      apiUrl: DEFAULT_BACKSTEROS_API_URL,
      localCoreUrl: DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
      apiKey: "",
      enabled: false,
    });
    setAgentContactId(null);
    setProfileError(null);
    setProfileSaving(true);
    void persistAgentProfile(null)
      .catch((cause) => {
        setProfileError(cause instanceof Error ? cause.message : "Could not clear agent profile");
      })
      .finally(() => setProfileSaving(false));
  };

  const runTest = async () => {
    if (!trimmedDraftKey) {
      setTestStatus("error");
      toastManager.add({
        type: "error",
        title: "API key required",
        description: "Paste a BacksterOS Access key, then try again.",
      });
      return;
    }
    setTesting(true);
    setTestStatus("idle");
    try {
      await testBacksterosConnection({ apiUrl, apiKey: trimmedDraftKey });
      persistKey(trimmedDraftKey, true);
      setTestStatus("ok");
      toastManager.add({ type: "success", title: "Connected to BacksterOS" });
    } catch (cause) {
      setTestStatus("error");
      toastManager.add({
        type: "error",
        title: "Connection failed",
        description: cause instanceof Error ? cause.message : "Could not reach BacksterOS.",
      });
    }
    setTesting(false);
  };

  const onAgentContactChange = (value: string | null) => {
    const next = value && value !== NONE_VALUE ? value : null;
    setAgentContactId(next);
    setProfileError(null);
    setProfileSaving(true);
    void persistAgentProfile(next)
      .catch((cause) => {
        setProfileError(cause instanceof Error ? cause.message : "Could not save agent profile");
      })
      .finally(() => setProfileSaving(false));
  };

  return (
    <>
      <SettingsRow
        {...searchableSetting("backsteros-connection")}
        description="Bearer Access key from BacksterOS → Settings → Access. Used for projects, tasks, and the rest of the product API."
        resetAction={
          canReset ? <SettingResetButton label="BacksterOS connection" onClick={reset} /> : null
        }
      >
        <div className="mt-3 grid w-full min-w-0 gap-2 pb-3">
          <div className="flex w-full min-w-0 items-center gap-2">
            <Switch
              checked={enabled}
              aria-label="Enable BacksterOS connection"
              onCheckedChange={(checked) => onEnabledChange(Boolean(checked))}
            />
            <Input
              id="backsteros-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-label="API key"
              className="min-w-0 flex-1"
              placeholder="sk_access_… or sk_live_…"
              disabled={!enabled}
              value={draftKey}
              onChange={(event) => {
                setDraftKey(event.target.value);
                setTestStatus("idle");
              }}
            />
            {enabled && isDirty && trimmedDraftKey ? (
              <Button type="button" size="xs" onClick={save}>
                Save
              </Button>
            ) : enabled && !isDirty && trimmedDraftKey ? (
              <Button
                type="button"
                size="xs"
                disabled={testing}
                onClick={() => void runTest()}
              >
                {testing ? "Testing…" : "Test"}
              </Button>
            ) : null}
          </div>
          {testStatus === "ok" ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Connected</p>
          ) : testStatus === "error" ? (
            <p className="text-xs text-destructive">Connection failed</p>
          ) : null}
        </div>
      </SettingsRow>

      <SettingsRow
        {...searchableSetting("backsteros-agent-contact")}
        description="Contact profile used when agents post BacksterOS task comments. Shown as that person instead of a generic Agent author."
        control={
          <Select
            value={agentContactId ?? NONE_VALUE}
            onValueChange={onAgentContactChange}
            disabled={!enabled || !apiKey.trim() || contactsLoading || profileSaving}
          >
            <SelectTrigger
              size="sm"
              className="w-full min-w-0 sm:w-64"
              aria-label="Agent contact profile"
            >
              <SelectValue>
                {!enabled || !apiKey.trim()
                  ? "Connect first"
                  : contactsLoading
                    ? "Loading contacts…"
                    : selectedContact
                      ? contactLabel(selectedContact)
                      : "No contact (Agent)"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false} className="min-w-64">
              <SelectItem value={NONE_VALUE}>No contact (Agent)</SelectItem>
              {sortedContacts.map((contact) => (
                <SelectItem key={contact.id} value={contact.id}>
                  <span className="flex w-full flex-col gap-0.5">
                    <span>{contactLabel(contact)}</span>
                    {contact.email ? (
                      <span className="text-xs text-muted-foreground">{contact.email}</span>
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      >
        {contactsError ? <p className="pb-2 text-sm text-destructive">{contactsError}</p> : null}
        {profileError ? <p className="pb-2 text-sm text-destructive">{profileError}</p> : null}
      </SettingsRow>
    </>
  );
}
