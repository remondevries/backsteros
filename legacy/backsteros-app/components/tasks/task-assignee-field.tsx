"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createContactAction } from "@/lib/mutations/contacts";
import { updateTaskAssigneeAction } from "@/lib/mutations/tasks";
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
import {
  createLocalContact,
} from "@/lib/sync/local-contact-mutations";
import {
  updateLocalTaskAssignee,
} from "@/lib/sync/local-task-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import {
  createPendingAssignableId,
  getCreateEntityFromQueryLabel,
  isPendingAssignableId,
} from "@/lib/searchable-dropdown-create-from-query";

export {
  TASK_ASSIGNEE_UNASSIGNED,
  type AssignableContact } from "@/lib/contacts/assignable-contact";

type TaskAssigneeFieldProps = {
  taskId: string;
  projectId: string | null;
  assigneeId: string | null;
  contacts: AssignableContact[];
  disabled?: boolean;
};

export function TaskAssigneeField({
  taskId,
  projectId,
  assigneeId: initialAssigneeId,
  contacts,
  disabled = false }: TaskAssigneeFieldProps) {
  const router = useRouter();
  const [assigneeId, setAssigneeId] = useState(initialAssigneeId);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    merged: mergedContacts,
    addOptimistic,
    replaceOptimistic,
    removeOptimistic,
  } = useMergedAssignableList(contacts);

  const [prevInitialAssigneeId, setPrevInitialAssigneeId] = useState(initialAssigneeId);
  if (initialAssigneeId !== prevInitialAssigneeId) {
    setPrevInitialAssigneeId(initialAssigneeId);
    setAssigneeId(initialAssigneeId);
  }

  const options = useAssigneeDropdownOptions(mergedContacts);

  const dropdownValue = assigneeId ?? TASK_ASSIGNEE_UNASSIGNED;
  const selectedContact = mergedContacts.find((contact) => contact.id === assigneeId);
  const fallbackLabel = selectedContact?.name ?? "Unassigned";

  function handleChange(nextValue: string) {
    if (disabled) return;

    const normalized =
      nextValue === TASK_ASSIGNEE_UNASSIGNED ? null : nextValue;

    if (normalized === assigneeId) {
      return;
    }

    const previousAssigneeId = assigneeId;
    setAssigneeId(normalized);
    setError(null);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          updateLocalTaskAssignee({
            taskId,
            projectId,
            assigneeId: normalized,
          }),
        () =>
          updateTaskAssigneeAction({
            taskId,
            projectId,
            assigneeId: normalized,
          }),
      );

      if (!result.ok) {
        setAssigneeId(previousAssigneeId);
        setError(result.error);
      }
    });
  }

  function handleCreateFromQuery(name: string) {
    if (disabled) return;

    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const previousAssigneeId = assigneeId;
    const pendingId = createPendingAssignableId();
    const optimisticContact: AssignableContact = {
      id: pendingId,
      key: pendingId,
      number: null,
      name: trimmed,
      email: null,
      organizationId: null,
      organizationName: null,
      avatarStorageKey: null,
      avatarUpdatedAt: Date.now(),
    };

    addOptimistic(optimisticContact);
    setAssigneeId(pendingId);
    setError(null);

    startTransition(async () => {
      const created = await runEntityPersist(
        () => createLocalContact({ name: trimmed }),
        () => createContactAction({ name: trimmed }),
      );
      if (!created.ok) {
        removeOptimistic(pendingId);
        setAssigneeId(previousAssigneeId);
        setError(created.error);
        return;
      }

      const createdContact: AssignableContact = {
        id: created.contactId,
        key: created.contactKey,
        number: created.contactNumber,
        name: trimmed,
        email: null,
        organizationId: null,
        organizationName: null,
        avatarStorageKey: null,
        avatarUpdatedAt: Date.now(),
      };
      replaceOptimistic(pendingId, createdContact);
      setAssigneeId(created.contactId);

      const assigned = await runEntityPersist(
        () =>
          updateLocalTaskAssignee({
            taskId,
            projectId,
            assigneeId: created.contactId,
          }),
        () =>
          updateTaskAssigneeAction({
            taskId,
            projectId,
            assigneeId: created.contactId,
          }),
      );

      if (!assigned.ok) {
        setAssigneeId(previousAssigneeId);
        removeOptimistic(created.contactId);
        setError(assigned.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <PropertyDropdownNavigateRow
        navigateHref={
          selectedContact && !isPendingAssignableId(selectedContact.id)
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
          options={options}
          onChange={handleChange}
          disabled={disabled || isPending}
          searchPlaceholder="Change assignee…"
          searchShortcutLabel="A"
          ariaLabel="Change assignee"
          taskPropertyDropdownId="assignee"
          fallbackIcon={getAssigneeFallbackIcon(selectedContact)}
          fallbackLabel={fallbackLabel}
          mutedFallback={!assigneeId}
          panelAlign="start"
          createFromQueryLabel={(query) =>
            getCreateEntityFromQueryLabel("contact", query)
          }
          onCreateFromQuery={handleCreateFromQuery}
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
