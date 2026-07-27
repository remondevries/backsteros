"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { createContactAction } from "@/lib/mutations/contacts";
import { updateLetterContactAction } from "@/lib/mutations/letters";
import { createLocalContact } from "@/lib/sync/local-contact-mutations";
import {
  updateLocalLetterContact,
} from "@/lib/sync/local-letter-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import {
  getAssigneeFallbackIcon,
  useAssigneeDropdownOptions } from "@/components/contacts/assignee-dropdown-options";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { PropertyDropdownNavigateRow } from "@/components/ui/property-dropdown-navigate-row";
import { useMergedAssignableList } from "@/hooks/use-merged-assignable-list";
import {
  TASK_ASSIGNEE_UNASSIGNED,
  type AssignableContact } from "@/lib/contacts/assignable-contact";
import { getContactHrefFromKey } from "@/lib/entity-route-hrefs";
import { filterAssignableContactsByOrganization } from "@/lib/letters/organization-contacts";
import {
  createPendingAssignableId,
  getCreateEntityFromQueryLabel,
  isPendingAssignableId,
} from "@/lib/searchable-dropdown-create-from-query";

export type { AssignableContact };

type LetterContactFieldProps = {
  letterId: string;
  organizationId: string | null;
  contactId: string | null;
  contacts: AssignableContact[];
};

export function LetterContactField({
  letterId,
  organizationId,
  contactId: initialContactId,
  contacts }: LetterContactFieldProps) {
  const router = useRouter();
  const [contactId, setContactId] = useState(initialContactId);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    merged: mergedContacts,
    addOptimistic,
    replaceOptimistic,
    removeOptimistic,
  } = useMergedAssignableList(contacts);

  const [prevInitialContactId, setPrevInitialContactId] = useState(initialContactId);
  if (initialContactId !== prevInitialContactId) {
    setPrevInitialContactId(initialContactId);
    setContactId(initialContactId);
  }

  const filteredContacts = useMemo(
    () => filterAssignableContactsByOrganization(mergedContacts, organizationId),
    [mergedContacts, organizationId],
  );

  const validContactId = useMemo(() => {
    if (!contactId) {
      return null;
    }

    return filteredContacts.some((contact) => contact.id === contactId)
      ? contactId
      : null;
  }, [contactId, filteredContacts]);

  const options = useAssigneeDropdownOptions(filteredContacts);
  const contactOptions = useMemo(
    () =>
      options.map((option) =>
        option.value === TASK_ASSIGNEE_UNASSIGNED
          ? { ...option, label: "No contact", searchTerms: "no contact none" }
          : option,
      ),
    [options],
  );

  const dropdownValue = validContactId ?? TASK_ASSIGNEE_UNASSIGNED;
  const selectedContact = validContactId
    ? filteredContacts.find((contact) => contact.id === validContactId)
    : undefined;
  const fallbackLabel = selectedContact?.name ?? "No contact";

  function handleChange(nextValue: string) {
    const normalized =
      nextValue === TASK_ASSIGNEE_UNASSIGNED ? null : nextValue;

    if (normalized === contactId) {
      return;
    }

    const previousContactId = contactId;
    setContactId(normalized);
    setError(null);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          updateLocalLetterContact({
            letterId,
            contactId: normalized,
          }),
        () =>
          updateLetterContactAction({
            letterId,
            contactId: normalized,
          }),
      );

      if (!result.ok) {
        setContactId(previousContactId);
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  function handleCreateFromQuery(name: string) {
    const trimmed = name.trim();
    if (!trimmed || !organizationId) {
      return;
    }

    const previousContactId = contactId;
    const pendingId = createPendingAssignableId();
    const optimisticContact: AssignableContact = {
      id: pendingId,
      key: pendingId,
      number: null,
      name: trimmed,
      email: null,
      organizationId,
      organizationName: null,
      avatarStorageKey: null,
      avatarUpdatedAt: Date.now(),
    };

    addOptimistic(optimisticContact);
    setContactId(pendingId);
    setError(null);

    startTransition(async () => {
      const created = await runEntityPersist(
        () =>
          createLocalContact({
            name: trimmed,
            organizationId,
          }),
        () =>
          createContactAction({
            name: trimmed,
            organizationId,
          }),
      );

      if (!created.ok) {
        removeOptimistic(pendingId);
        setContactId(previousContactId);
        setError(created.error);
        return;
      }

      const createdContact: AssignableContact = {
        id: created.contactId,
        key: created.contactKey,
        number: created.contactNumber,
        name: trimmed,
        email: null,
        organizationId,
        organizationName: null,
        avatarStorageKey: null,
        avatarUpdatedAt: Date.now(),
      };
      replaceOptimistic(pendingId, createdContact);
      setContactId(created.contactId);

      const assigned = await runEntityPersist(
        () =>
          updateLocalLetterContact({
            letterId,
            contactId: created.contactId,
          }),
        () =>
          updateLetterContactAction({
            letterId,
            contactId: created.contactId,
          }),
      );

      if (!assigned.ok) {
        setContactId(previousContactId);
        removeOptimistic(created.contactId);
        setError(assigned.error);
        return;
      }

      router.refresh();
    });
  }

  const contactLocked = !organizationId;

  return (
    <div
      className={`flex flex-col gap-1${contactLocked ? " opacity-45" : ""}`}
    >
      <PropertyDropdownNavigateRow
        navigateHref={
          !contactLocked &&
          selectedContact &&
          !isPendingAssignableId(selectedContact.id)
            ? getContactHrefFromKey(
                selectedContact.key,
                selectedContact.number,
              )
            : null
        }
        navigateLabel={
          selectedContact ? `Open contact ${selectedContact.name}` : undefined
        }
      >
        <PropertyDropdown
          value={dropdownValue}
          options={contactOptions}
          onChange={handleChange}
          disabled={isPending || contactLocked}
          searchPlaceholder="Change contact…"
          searchShortcutLabel="⇧C"
          ariaLabel={
            contactLocked
              ? "Contact (select an organization first)"
              : "Change contact"
          }
          fallbackIcon={getAssigneeFallbackIcon(selectedContact)}
          fallbackLabel={fallbackLabel}
          mutedFallback={!validContactId}
          panelAlign="start"
          taskPropertyDropdownId="contact"
          createFromQueryLabel={
            contactLocked
              ? undefined
              : (query) => getCreateEntityFromQueryLabel("contact", query)
          }
          onCreateFromQuery={contactLocked ? undefined : handleCreateFromQuery}
        />
      </PropertyDropdownNavigateRow>
      {error ? (
        <p className="px-1 text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
