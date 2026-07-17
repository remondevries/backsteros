"use client";

import { useUser } from "@clerk/nextjs";
import type { Contact as ApiContact } from "@backsteros/contracts";
import Link from "next/link";
import { useState } from "react";

import { useApiResource } from "@/lib/api-context";
import { TaskCreateAssigneeDropdown } from "@/components/tasks/task-create-assignee-dropdown";
import { mapContactToAssignable } from "@/lib/contacts/assignable-contact";
import { normalizeContact } from "@/lib/entity-normalize";
import { isE2eAuthBypassEnabled } from "@/lib/e2e-bypass-auth";
import {
  getDefaultAssigneeId,
  setDefaultAssigneeId,
} from "@/lib/settings/default-assignee";

const BYPASS_AUTH = isE2eAuthBypassEnabled();

function DefaultAssigneeField() {
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((api) =>
    api.requestJson("/api/v1/contacts"),
  );
  const [assigneeId, setAssigneeId] = useState<string | null>(() =>
    getDefaultAssigneeId(),
  );

  const contacts = (contactsResource.data?.contacts ?? []).map((contact) =>
    mapContactToAssignable({ ...normalizeContact(contact), organization: null }),
  );

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
        setAssigneeId(nextValue);
        setDefaultAssigneeId(nextValue);
      }}
      disabled={contactsResource.loading}
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

export function AccountSettingsSection() {
  return (
    <>
      {BYPASS_AUTH ? null : <ClerkAccountEmail />}
      <section className="settings-card">
        <h2>Default assignee</h2>
        <p>
          This contact is the default assignee for newly created tasks. You
          can still change the assignee on individual tasks.
        </p>
        <DefaultAssigneeField />
      </section>
    </>
  );
}
