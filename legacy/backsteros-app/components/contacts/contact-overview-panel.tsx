"use client";

import { ContactAvatarUpload } from "@/components/contacts/contact-avatar-upload";
import { ContactOverviewDetailsForm } from "@/components/contacts/contact-overview-details-form";
import { ContactOverviewNameEditor } from "@/components/contacts/contact-overview-name-editor";
import type { Contact, Organization } from "@/lib/db/schema";
import { getContactDisplayId } from "@/lib/contact-display-id";

type ContactOverviewPanelProps = {
  contact: Contact;
  organizations: Organization[];
  onSaved?: () => void;
};

export function ContactOverviewPanel({
  contact,
  organizations,
  onSaved,
}: ContactOverviewPanelProps) {
  const displayId = getContactDisplayId(contact);

  return (
    <article className="mx-auto flex w-full min-w-0 flex-col items-center text-foreground">
      <header className="flex w-full max-w-[800px] flex-col items-center gap-3 px-4 pt-6">
        <ContactAvatarUpload
          contactId={contact.id}
          contactName={contact.name}
          avatarStorageKey={contact.avatarStorageKey}
          updatedAt={contact.updatedAt}
          onSaved={onSaved}
        />
        {displayId ? (
          <p className="font-mono text-xs tabular-nums text-foreground/45">
            {displayId}
          </p>
        ) : null}
        <ContactOverviewNameEditor
          contactId={contact.id}
          value={contact.name}
          onNameSaved={() => onSaved?.()}
        />
      </header>

      <div className="w-full max-w-[800px] px-4 pb-8 pt-8">
        <ContactOverviewDetailsForm
          contact={contact}
          organizations={organizations}
          onSaved={onSaved}
        />
      </div>
    </article>
  );
}
