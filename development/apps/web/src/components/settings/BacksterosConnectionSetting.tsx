import { useEffect, useMemo, useState } from "react";

import { fetchBacksterosContacts } from "~/backsteros/client";
import { DEFAULT_BACKSTEROS_API_URL, useBacksterosSettingsStore } from "~/backsteros/settingsStore";
import type { BacksterosContact } from "~/backsteros/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
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
  const apiKey = useBacksterosSettingsStore((state) => state.apiKey);
  const agentContactId = useBacksterosSettingsStore((state) => state.agentContactId);
  const setConnection = useBacksterosSettingsStore((state) => state.setConnection);
  const setAgentContactId = useBacksterosSettingsStore((state) => state.setAgentContactId);
  const [draftUrl, setDraftUrl] = useState(apiUrl);
  const [draftKey, setDraftKey] = useState(apiKey);
  const [contacts, setContacts] = useState<readonly BacksterosContact[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    setDraftUrl(apiUrl);
    setDraftKey(apiKey);
  }, [apiKey, apiUrl]);

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
        if (fromDisk !== agentContactId) {
          setAgentContactId(fromDisk);
        }
      } catch {
        // Host file optional until first save.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Hydrate once on mount from the host profile file.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount hydrate
  }, []);

  useEffect(() => {
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
  }, [apiUrl, apiKey]);

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

  const isDirty = draftUrl.trim() !== apiUrl.trim() || draftKey !== apiKey;
  const canReset =
    apiUrl.trim() !== DEFAULT_BACKSTEROS_API_URL ||
    apiKey.trim().length > 0 ||
    agentContactId != null ||
    isDirty;

  const save = () => {
    setConnection({
      apiUrl: draftUrl.trim() || DEFAULT_BACKSTEROS_API_URL,
      apiKey: draftKey.trim(),
    });
  };

  const reset = () => {
    setDraftUrl(DEFAULT_BACKSTEROS_API_URL);
    setDraftKey("");
    setConnection({ apiUrl: DEFAULT_BACKSTEROS_API_URL, apiKey: "" });
    setAgentContactId(null);
    setProfileError(null);
    setProfileSaving(true);
    void persistAgentProfile(null)
      .catch((cause) => {
        setProfileError(cause instanceof Error ? cause.message : "Could not clear agent profile");
      })
      .finally(() => setProfileSaving(false));
  };

  const onAgentContactChange = (value: string) => {
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
        description="Used by the sidebar BacksterOS project list. Packaged desktop needs the API key here (or BACKSTEROS_API_KEY in the process env). The key stays on this device."
        resetAction={
          canReset ? <SettingResetButton label="BacksterOS connection" onClick={reset} /> : null
        }
      >
        <div className="grid max-w-lg gap-3 pb-3">
          <div className="grid gap-1.5">
            <Label htmlFor="backsteros-api-url">API URL</Label>
            <Input
              id="backsteros-api-url"
              autoComplete="off"
              spellCheck={false}
              placeholder={DEFAULT_BACKSTEROS_API_URL}
              value={draftUrl}
              onChange={(event) => setDraftUrl(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="backsteros-api-key">API key</Label>
            <Input
              id="backsteros-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk_live_…"
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" size="xs" disabled={!isDirty} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </SettingsRow>

      <SettingsRow
        {...searchableSetting("backsteros-agent-contact")}
        description="Contact profile used when agents post BacksterOS task comments. Shown as that person instead of a generic Agent author."
        control={
          <Select
            value={agentContactId ?? NONE_VALUE}
            onValueChange={onAgentContactChange}
            disabled={contactsLoading || profileSaving}
          >
            <SelectTrigger
              size="sm"
              className="w-full min-w-0 sm:w-64"
              aria-label="Agent contact profile"
            >
              <SelectValue>
                {contactsLoading
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
