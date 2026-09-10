import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchBacksterosContacts } from "../../backsteros/client";
import { BacksterosContactPersonIcon } from "../../backsteros/ContactPersonIcon";
import { BacksterosEntityAvatarIcon } from "../../backsteros/EntityAvatarIcon";
import {
  BacksterosSearchablePropertyMenu,
  type BacksterosSearchablePropertyOption,
} from "../../backsteros/SearchablePropertyMenu";
import type { BacksterosContact } from "../../backsteros/types";
import { useBacksterosContactAvatarSrcMap } from "../../backsteros/useBacksterosContactAvatars";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import {
  fetchAppNotifications,
  updateAppNotifications,
  type AppNotificationsSettings,
} from "./hetznerApi";
import "../../backsteros/backsterosPropertyMenu.css";

const CLEAR_CONTACT_VALUE = "__none__";

function SettingsCard({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: React.ReactNode;
  readonly children?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <div className="border-b border-border/60 px-6 py-5">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        {description ? (
          <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  readonly label: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 sm:max-w-[55%]">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex w-full shrink-0 justify-start sm:w-auto sm:min-w-[14rem] sm:justify-end">
        {children}
      </div>
    </div>
  );
}

/**
 * Settings → Notifications (Forge-shaped): failure contact + deploy hook.
 */
export function NotificationsSettings({
  serverId,
  service,
}: {
  readonly serverId: string;
  readonly service: string;
}) {
  const [settings, setSettings] = useState<AppNotificationsSettings | null>(null);
  const [hookUrlDraft, setHookUrlDraft] = useState("");
  const [contacts, setContacts] = useState<readonly BacksterosContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarSrcById = useBacksterosContactAvatarSrcMap(contacts);

  const applySettings = useCallback((next: AppNotificationsSettings) => {
    setSettings(next);
    setHookUrlDraft(next.deployHookUrl);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAppNotifications(serverId, service);
      if (!data.ok || !data.settings) {
        setError(data.error ?? "Failed to load notification settings");
        setSettings(null);
        return;
      }
      applySettings(data.settings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load notification settings");
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [applySettings, serverId, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setContactsLoading(true);
    setContactsError(null);
    let cancelled = false;
    void fetchBacksterosContacts()
      .then((rows) => {
        if (!cancelled) setContacts(rows);
      })
      .catch((cause) => {
        if (cancelled) return;
        setContacts([]);
        setContactsError(
          cause instanceof Error ? cause.message : "Failed to load BacksterOS contacts",
        );
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedContact = useMemo(() => {
    const id = settings?.failureContactId;
    if (!id) return null;
    return contacts.find((contact) => contact.id === id) ?? null;
  }, [contacts, settings?.failureContactId]);

  const contactOptions = useMemo((): readonly BacksterosSearchablePropertyOption[] => {
    const none: BacksterosSearchablePropertyOption = {
      value: CLEAR_CONTACT_VALUE,
      label: "No contact",
      searchText: "none clear unset",
      icon: <BacksterosContactPersonIcon size={14} className="opacity-70" />,
    };
    const rows = contacts.map((contact, index) => ({
      value: contact.id,
      label: contact.name,
      searchText: [contact.name, contact.firstName, contact.lastName, contact.email]
        .filter(Boolean)
        .join(" "),
      icon: <BacksterosEntityAvatarIcon src={avatarSrcById[contact.id] ?? null} size={14} />,
      separatorBefore: index === 0,
    }));
    return [none, ...rows];
  }, [avatarSrcById, contacts]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const data = await updateAppNotifications({ serverId, service, ...body });
      if (!data.ok || !data.settings) {
        throw new Error(data.error ?? "Failed to save notification settings");
      }
      applySettings(data.settings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save notification settings");
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="rounded-xl border border-border/70 bg-card/40 px-6 py-10 text-sm text-muted-foreground">
        {error ?? "Loading notification settings…"}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <SettingsCard title="Notifications" description="Manage your site's notification settings.">
        <div className="divide-y divide-border/60">
          <SettingsRow
            label="Deployment failure contact"
            description="When a deploy fails, BacksterOS opens a support ticket for the selected contact."
          >
            <div className="flex w-full max-w-sm flex-col items-stretch gap-2 sm:items-end">
              {contactsError ? <p className="text-sm text-destructive">{contactsError}</p> : null}
              <BacksterosSearchablePropertyMenu
                label={
                  contactsLoading
                    ? "Loading contacts…"
                    : selectedContact
                      ? selectedContact.name
                      : settings.failureContactName
                        ? settings.failureContactName
                        : "Select a contact"
                }
                icon={
                  selectedContact ? (
                    <BacksterosEntityAvatarIcon
                      src={avatarSrcById[selectedContact.id] ?? null}
                      size={14}
                    />
                  ) : (
                    <BacksterosContactPersonIcon size={14} className="opacity-70" />
                  )
                }
                value={settings.failureContactId ?? CLEAR_CONTACT_VALUE}
                options={contactOptions}
                searchPlaceholder="Search contacts…"
                ariaLabel="Deployment failure contact"
                disabled={busy || contactsLoading}
                muted={!settings.failureContactId}
                onChange={(value) => {
                  if (value === CLEAR_CONTACT_VALUE) {
                    void patch({ failureContactId: null, failureContactName: null });
                    return;
                  }
                  const contact = contacts.find((entry) => entry.id === value);
                  void patch({
                    failureContactId: value,
                    failureContactName: contact?.name ?? null,
                  });
                }}
              />
            </div>
          </SettingsRow>

          <SettingsRow
            label="Deploy hook"
            description="A custom URL that we will ping when your site is deployed."
          >
            <div className="flex w-full max-w-md flex-col items-stretch gap-3 sm:items-end">
              <Switch
                checked={settings.deployHookEnabled}
                disabled={busy}
                onCheckedChange={(checked) => {
                  void patch({ deployHookEnabled: checked });
                }}
              />
              {settings.deployHookEnabled ? (
                <Input
                  value={hookUrlDraft}
                  disabled={busy}
                  className="w-full font-mono text-xs sm:w-80"
                  placeholder="https://example.com/hooks/deploy"
                  onChange={(event) => setHookUrlDraft(event.target.value)}
                  onBlur={() => {
                    if (hookUrlDraft !== settings.deployHookUrl) {
                      void patch({ deployHookUrl: hookUrlDraft });
                    }
                  }}
                />
              ) : null}
            </div>
          </SettingsRow>
        </div>
      </SettingsCard>
    </div>
  );
}
