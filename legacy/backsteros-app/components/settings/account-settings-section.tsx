"use client";

import { useUser } from "@clerk/nextjs";
import type { Contact as ApiContact } from "@backsteros/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiErrorMessage, useApiResource, useAppApi } from "@/lib/api-context";
import { TaskCreateAssigneeDropdown } from "@/components/tasks/task-create-assignee-dropdown";
import { mapContactToAssignable } from "@/lib/contacts/assignable-contact";
import { normalizeContact } from "@/lib/entity-normalize";
import { isE2eAuthBypassEnabled } from "@/lib/e2e-bypass-auth";
import {
  DEFAULT_ASSIGNEE_SETTINGS_KEY,
  getDefaultAssigneeId,
  parseDefaultAssigneeIdFromSettings,
  setDefaultAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "@/lib/settings/default-assignee";

const BYPASS_AUTH = isE2eAuthBypassEnabled();

type DefaultAssigneeFieldProps = {
  settings: Record<string, unknown> | undefined;
  onSettingsSaved?: () => void;
};

function DefaultAssigneeField({
  settings,
  onSettingsSaved,
}: DefaultAssigneeFieldProps) {
  const { client } = useAppApi();
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((api) =>
    api.requestJson("/api/v1/contacts"),
  );
  const [assigneeId, setAssigneeId] = useState<string | null>(() =>
    getDefaultAssigneeId(),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const synced = syncDefaultAssigneeIdFromSettings(settings);
    setAssigneeId(synced);

    // One-time migrate: local-only value → workspace settings.
    const fromServer = parseDefaultAssigneeIdFromSettings(settings);
    if (fromServer !== undefined || !synced) return;
    void client
      .requestJson("/api/v1/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [DEFAULT_ASSIGNEE_SETTINGS_KEY]: synced }),
      })
      .then(() => onSettingsSaved?.())
      .catch(() => {
        // keep local value if migrate fails
      });
  }, [client, onSettingsSaved, settings]);

  const contacts = (contactsResource.data?.contacts ?? []).map((contact) =>
    mapContactToAssignable({ ...normalizeContact(contact), organization: null }),
  );

  async function handleChange(nextValue: string | null) {
    setAssigneeId(nextValue);
    setDefaultAssigneeId(nextValue);
    setSaving(true);
    try {
      await client.requestJson("/api/v1/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [DEFAULT_ASSIGNEE_SETTINGS_KEY]: nextValue }),
      });
      onSettingsSaved?.();
      toast.success("Settings saved");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (!contactsResource.loading && contacts.length === 0) {
    return (
      <p className="settings-hint">
        Add a <Link href="/contacts">contact</Link> to set a default
        assignee.
      </p>
    );
  }

  return (
    <TaskCreateAssigneeDropdown
      contacts={contacts}
      value={assigneeId}
      onChange={(nextValue) => {
        void handleChange(nextValue);
      }}
      disabled={contactsResource.loading || saving}
    />
  );
}

function ClerkAccountEmail() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";

  return (
    <section className="settings-card">
      <h2>Email</h2>
      <p>The email address associated with your account.</p>
      <div className="settings-field">
        <span className="settings-static-value">{email}</span>
      </div>
    </section>
  );
}

type AccountSettingsSectionProps = {
  settings?: Record<string, unknown>;
  onSettingsSaved?: () => void;
};

export function AccountSettingsSection({
  settings,
  onSettingsSaved,
}: AccountSettingsSectionProps = {}) {
  return (
    <>
      {BYPASS_AUTH ? null : <ClerkAccountEmail />}
      <section className="settings-card">
        <h2>Default assignee</h2>
        <p>
          This contact is the default assignee for newly created tasks. You
          can still change the assignee on individual tasks.
        </p>
        <DefaultAssigneeField
          settings={settings}
          onSettingsSaved={onSettingsSaved}
        />
      </section>
    </>
  );
}
