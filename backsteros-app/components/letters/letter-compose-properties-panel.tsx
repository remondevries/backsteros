"use client";

import { useMemo, useState, useTransition } from "react";

import {
  getAssigneeFallbackIcon,
  useAssigneeDropdownOptions,
} from "@/components/contacts/assignee-dropdown-options";
import {
  getOrganizationFallbackIcon,
  useOrganizationDropdownOptions,
} from "@/components/organizations/organization-dropdown-options";
import {
  getDisplayProjectIcon,
  ProjectOcticon,
} from "@/components/project-icon";
import { TaskStatusIcon } from "@/components/task-status";
import { ComposeDueDateDropdown } from "@/components/tasks/compose-due-date-dropdown";
import { buildTaskStatusDropdownOptions } from "@/components/tasks/task-status-dropdown-options";
import { TaskDetailPropertiesSection } from "@/components/tasks/task-detail-properties-section";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { LetterPdfDropzone } from "@/components/letters/letter-pdf-dropzone";
import { useMergedAssignableList } from "@/hooks/use-merged-assignable-list";
import {
  TASK_ASSIGNEE_UNASSIGNED,
  type AssignableContact,
} from "@/lib/contacts/assignable-contact";
import { filterAssignableContactsByOrganization } from "@/lib/letters/organization-contacts";
import { createContactAction } from "@/lib/mutations/contacts";
import { createOrganizationAction } from "@/lib/mutations/organizations";
import {
  PROJECT_ORGANIZATION_NONE,
  type AssignableOrganization,
} from "@/lib/organizations/assignable-organization";
import type { AssignableProject } from "@/lib/projects/assignable-project";
import {
  createPendingAssignableId,
  getCreateEntityFromQueryLabel,
} from "@/lib/searchable-dropdown-create-from-query";
import { createLocalContact } from "@/lib/sync/local-contact-mutations";
import { createLocalOrganization } from "@/lib/sync/local-organization-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import {
  getTaskStatusLabel,
  isTaskStatus,
  type TaskStatus,
} from "@/lib/task-status";

const LETTER_COMPOSE_PROJECT_NONE = "__letter_project_none__";

type LetterComposePropertiesPanelProps = {
  status: TaskStatus;
  dueDate: string;
  receivedDate: string;
  projectId: string;
  organizationId: string;
  contactId: string;
  selectedFile: File | null;
  uploading?: boolean;
  uploadProgress?: number | null;
  assignableProjects: AssignableProject[];
  assignableOrganizations: AssignableOrganization[];
  assignableContacts: AssignableContact[];
  isPending: boolean;
  error: string | null;
  onStatusChange: (status: TaskStatus) => void;
  onDueDateChange: (ymd: string) => void;
  onReceivedDateChange: (ymd: string) => void;
  onProjectChange: (projectId: string) => void;
  onOrganizationChange: (organizationId: string) => void;
  onContactChange: (contactId: string) => void;
  onFileSelect: (file: File | null) => void;
  onSave: () => void;
};

export function LetterComposePropertiesPanel({
  status,
  dueDate,
  receivedDate,
  projectId,
  organizationId,
  contactId,
  selectedFile,
  uploading = false,
  uploadProgress = null,
  assignableProjects,
  assignableOrganizations,
  assignableContacts,
  isPending,
  error,
  onStatusChange,
  onDueDateChange,
  onReceivedDateChange,
  onProjectChange,
  onOrganizationChange,
  onContactChange,
  onFileSelect,
  onSave,
}: LetterComposePropertiesPanelProps) {
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();
  const {
    merged: mergedOrganizations,
    addOptimistic: addOptimisticOrganization,
    replaceOptimistic: replaceOptimisticOrganization,
    removeOptimistic: removeOptimisticOrganization,
  } = useMergedAssignableList(assignableOrganizations);
  const {
    merged: mergedContacts,
    addOptimistic: addOptimisticContact,
    replaceOptimistic: replaceOptimisticContact,
    removeOptimistic: removeOptimisticContact,
  } = useMergedAssignableList(assignableContacts);

  const statusOptions = useMemo(() => buildTaskStatusDropdownOptions(), []);
  const organizationOptions = useOrganizationDropdownOptions(mergedOrganizations);
  const filteredContacts = useMemo(
    () =>
      filterAssignableContactsByOrganization(
        mergedContacts,
        organizationId || null,
      ),
    [mergedContacts, organizationId],
  );
  const assigneeOptions = useAssigneeDropdownOptions(filteredContacts);
  const contactOptions = useMemo(
    () =>
      assigneeOptions.map((option) =>
        option.value === TASK_ASSIGNEE_UNASSIGNED
          ? { ...option, label: "No contact", searchTerms: "no contact none" }
          : option,
      ),
    [assigneeOptions],
  );
  const projectOptions = useMemo(
    () => [
      {
        value: LETTER_COMPOSE_PROJECT_NONE,
        label: "No project",
        searchTerms: "none no project",
        icon: (
          <ProjectOcticon
            icon={getDisplayProjectIcon(null)}
            size={14}
            className="text-foreground/70"
          />
        ),
      },
      ...assignableProjects.map((project) => ({
        value: project.id,
        label: project.name,
        searchTerms: `${project.key} ${project.name}`,
        icon: (
          <ProjectOcticon
            icon={getDisplayProjectIcon(project.icon)}
            size={14}
            className="text-foreground/70"
          />
        ),
      })),
    ],
    [assignableProjects],
  );

  const selectedOrganization = mergedOrganizations.find(
    (organization) => organization.id === organizationId,
  );
  const selectedContact = filteredContacts.find(
    (contact) => contact.id === contactId,
  );
  const selectedProject = assignableProjects.find(
    (project) => project.id === projectId,
  );
  const contactLocked = !organizationId;
  const busy = isPending || isCreating;
  const panelError = error ?? createError;

  function handleOrganizationChange(nextValue: string) {
    const next =
      nextValue === PROJECT_ORGANIZATION_NONE ? "" : nextValue;
    onOrganizationChange(next);
    setCreateError(null);
  }

  function handleCreateOrganization(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;

    const pendingId = createPendingAssignableId();
    addOptimisticOrganization({
      id: pendingId,
      key: pendingId,
      number: null,
      name: trimmed,
      avatarStorageKey: null,
      avatarUpdatedAt: Date.now(),
    });
    onOrganizationChange(pendingId);
    setCreateError(null);

    startCreateTransition(async () => {
      const created = await runEntityPersist(
        () => createLocalOrganization({ name: trimmed }),
        () => createOrganizationAction({ name: trimmed }),
      );
      if (!created.ok) {
        removeOptimisticOrganization(pendingId);
        onOrganizationChange("");
        setCreateError(created.error);
        return;
      }

      replaceOptimisticOrganization(pendingId, {
        id: created.organizationId,
        key: created.organizationKey,
        number: created.organizationNumber,
        name: trimmed,
        avatarStorageKey: null,
        avatarUpdatedAt: Date.now(),
      });
      onOrganizationChange(created.organizationId);
    });
  }

  function handleContactChange(nextValue: string) {
    onContactChange(
      nextValue === TASK_ASSIGNEE_UNASSIGNED ? "" : nextValue,
    );
    setCreateError(null);
  }

  function handleCreateContact(name: string) {
    const trimmed = name.trim();
    if (!trimmed || !organizationId) return;

    const pendingId = createPendingAssignableId();
    addOptimisticContact({
      id: pendingId,
      key: pendingId,
      number: null,
      name: trimmed,
      email: null,
      organizationId,
      organizationName: null,
      avatarStorageKey: null,
      avatarUpdatedAt: Date.now(),
    });
    onContactChange(pendingId);
    setCreateError(null);

    startCreateTransition(async () => {
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
        removeOptimisticContact(pendingId);
        onContactChange("");
        setCreateError(created.error);
        return;
      }

      replaceOptimisticContact(pendingId, {
        id: created.contactId,
        key: created.contactKey,
        number: created.contactNumber,
        name: trimmed,
        email: null,
        organizationId,
        organizationName: null,
        avatarStorageKey: null,
        avatarUpdatedAt: Date.now(),
      });
      onContactChange(created.contactId);
    });
  }

  return (
    <div className="task-detail-properties-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
      <div className="flex flex-col gap-2">
        <TaskDetailPropertiesSection title="Document">
          <LetterPdfDropzone
            file={selectedFile}
            disabled={busy}
            uploading={uploading}
            uploadProgress={uploadProgress}
            onFileSelect={onFileSelect}
          />
        </TaskDetailPropertiesSection>

        <TaskDetailPropertiesSection title="From">
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[11px] font-medium text-foreground/45">
              Organization
            </span>
            <PropertyDropdown
              value={organizationId || PROJECT_ORGANIZATION_NONE}
              options={organizationOptions}
              onChange={handleOrganizationChange}
              disabled={busy}
              searchPlaceholder="Change organization…"
              searchShortcutLabel="O"
              ariaLabel="Organization"
              fallbackIcon={getOrganizationFallbackIcon(selectedOrganization)}
              fallbackLabel={selectedOrganization?.name ?? "No organization"}
              mutedFallback={!organizationId}
              panelAlign="start"
              taskPropertyDropdownId="organization"
              createFromQueryLabel={(query) =>
                getCreateEntityFromQueryLabel("organization", query)
              }
              onCreateFromQuery={handleCreateOrganization}
            />
          </div>

          <div
            className={`flex flex-col gap-1.5${contactLocked ? " opacity-45" : ""}`}
          >
            <span className="px-1 text-[11px] font-medium text-foreground/45">
              Contact
            </span>
            <PropertyDropdown
              value={contactId || TASK_ASSIGNEE_UNASSIGNED}
              options={contactOptions}
              onChange={handleContactChange}
              disabled={busy || contactLocked}
              searchPlaceholder="Change contact…"
              searchShortcutLabel="⇧C"
              ariaLabel={
                contactLocked
                  ? "Contact (select an organization first)"
                  : "Contact"
              }
              fallbackIcon={getAssigneeFallbackIcon(selectedContact)}
              fallbackLabel={selectedContact?.name ?? "No contact"}
              mutedFallback={!contactId}
              panelAlign="start"
              taskPropertyDropdownId="contact"
              createFromQueryLabel={
                contactLocked
                  ? undefined
                  : (query) => getCreateEntityFromQueryLabel("contact", query)
              }
              onCreateFromQuery={
                contactLocked ? undefined : handleCreateContact
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[11px] font-medium text-foreground/45">
              Received date
            </span>
            <ComposeDueDateDropdown
              value={receivedDate || null}
              onChange={(next) => onReceivedDateChange(next ?? "")}
              disabled={busy}
              emptyLabel="No received date"
              ariaLabel="Received date"
              searchPlaceholder="yesterday, last Monday…"
              searchShortcutLabel="R"
              taskPropertyDropdownId="receivedDate"
              showUrgency={false}
            />
          </div>
        </TaskDetailPropertiesSection>

        <TaskDetailPropertiesSection title="Properties">
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[11px] font-medium text-foreground/45">
              Status
            </span>
            <PropertyDropdown
              value={status}
              options={statusOptions}
              onChange={(next) => {
                if (!isTaskStatus(next)) return;
                onStatusChange(next);
              }}
              disabled={busy}
              searchPlaceholder="Change status…"
              searchShortcutLabel="S"
              ariaLabel="Status"
              fallbackIcon={
                <TaskStatusIcon
                  status={status}
                  title={getTaskStatusLabel(status)}
                  size={14}
                />
              }
              fallbackLabel={getTaskStatusLabel(status)}
              panelAlign="start"
              taskPropertyDropdownId="status"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[11px] font-medium text-foreground/45">
              Due date
            </span>
            <ComposeDueDateDropdown
              value={dueDate || null}
              onChange={(next) => onDueDateChange(next ?? "")}
              disabled={busy}
            />
          </div>
        </TaskDetailPropertiesSection>

        <TaskDetailPropertiesSection title="Project">
          <PropertyDropdown
            value={projectId || LETTER_COMPOSE_PROJECT_NONE}
            options={projectOptions}
            onChange={(next) =>
              onProjectChange(
                next === LETTER_COMPOSE_PROJECT_NONE ? "" : next,
              )
            }
            disabled={busy}
            searchPlaceholder="Change project…"
            searchShortcutLabel="P"
            ariaLabel="Project"
            fallbackIcon={
              <ProjectOcticon
                icon={getDisplayProjectIcon(selectedProject?.icon ?? null)}
                size={14}
                className="text-foreground/70"
              />
            }
            fallbackLabel={selectedProject?.name ?? "No project"}
            mutedFallback={!projectId}
            panelAlign="start"
            taskPropertyDropdownId="project"
          />
        </TaskDetailPropertiesSection>

        {panelError ? (
          <p className="px-1 text-xs text-red-400" role="alert">
            {panelError}
          </p>
        ) : null}

        <button
          type="button"
          className="rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-medium text-foreground hover:bg-white/[0.1] disabled:opacity-40"
          disabled={busy}
          onClick={onSave}
        >
          {isPending ? "Creating…" : "Create letter"}
        </button>
      </div>
    </div>
  );
}
