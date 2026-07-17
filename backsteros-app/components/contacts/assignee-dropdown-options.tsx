"use client";

import { useMemo, type ReactNode } from "react";

import { AssigneeContactIcon } from "@/components/contacts/assignee-contact-icon";
import {
  TASK_ASSIGNEE_UNASSIGNED,
  type AssignableContact,
} from "@/lib/contacts/assignable-contact";
import { ContactPersonIcon } from "@/components/icons/contact-person-icon";
import type { SearchableDropdownOption } from "@/components/ui/searchable-dropdown";

export function useAssigneeDropdownOptions(
  contacts: AssignableContact[],
): SearchableDropdownOption<string>[] {
  return useMemo(
    () => [
      {
        value: TASK_ASSIGNEE_UNASSIGNED,
        label: "Unassigned",
        icon: <ContactPersonIcon size={14} className="text-foreground/70" />,
        searchTerms: "unassigned none",
      },
      ...contacts.map((contact) => ({
        value: contact.id,
        label: contact.name,
        searchTerms: [
          contact.name,
          contact.email ?? "",
          contact.organizationName ?? "",
        ]
          .filter(Boolean)
          .join(" "),
        icon: (
          <AssigneeContactIcon
            contact={{
              id: contact.id,
              avatarStorageKey: contact.avatarStorageKey,
              avatarUpdatedAt: contact.avatarUpdatedAt,
            }}
          />
        ),
      })),
    ],
    [contacts],
  );
}

export function getAssigneeFallbackIcon(
  contact: AssignableContact | undefined,
): ReactNode {
  if (contact) {
    return (
      <AssigneeContactIcon
        contact={{
          id: contact.id,
          avatarStorageKey: contact.avatarStorageKey,
          avatarUpdatedAt: contact.avatarUpdatedAt,
        }}
      />
    );
  }

  return <ContactPersonIcon size={14} className="text-foreground/70" />;
}
