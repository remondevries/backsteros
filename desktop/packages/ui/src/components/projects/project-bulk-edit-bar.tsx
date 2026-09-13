"use client";

import { useEffect, useMemo, useState } from "react";

import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../../tasks/task-priority.js";
import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "../../projects/project-status.js";
import { DROPDOWN_NONE_VALUE } from "../dropdowns/dropdown-options.js";
import {
  FinanceBulkBar,
  bulkDropdownShowIcon,
  relabelDropdownNoneOption,
  sharedNullableIdSelectionValue,
  sharedSelectionValue,
  withBulkDropdownFillState,
} from "../finance/finance-bulk-bar.js";
import { FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME } from "../finance/finance-transactions-filter-bar.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { TaskDueDateDropdown } from "../tasks/task-due-date-dropdown.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import type { ProjectOverviewRowProject } from "./project-overview-row.js";

export type ProjectBulkPatch = {
  status?: ProjectStatus;
  priority?: number;
  startDate?: Date | null;
  dueDate?: Date | null;
  organizationId?: string | null;
};

export type ProjectBulkEditBarProps = {
  selectedProjects: ProjectOverviewRowProject[];
  onClear: () => void;
  onSelectAll?: () => void;
  onApply: (patch: ProjectBulkPatch) => void | Promise<void>;
  showPriority?: boolean;
  showOrganization?: boolean;
  organizationOptions?: SearchableDropdownOption<string>[];
};

type ProjectBulkDraft = {
  status?: ProjectStatus;
  priority?: number;
  startDate?: Date | null;
  dueDate?: Date | null;
  organizationId?: string | null;
};

function toEpoch(value: number | Date | null | undefined): number | null {
  if (value == null) return null;
  return value instanceof Date ? value.getTime() : Number(value);
}

/**
 * Floating bulk editor for project multi-select — same dock chrome as tasks.
 */
export function ProjectBulkEditBar({
  selectedProjects,
  onClear,
  onSelectAll,
  onApply,
  showPriority = true,
  showOrganization = true,
  organizationOptions = [],
}: ProjectBulkEditBarProps) {
  const selectionCount = selectedProjects.length;
  const [bulkDraft, setBulkDraft] = useState<ProjectBulkDraft>({});
  const [applyPending, setApplyPending] = useState(false);
  const registrarDatesLocked = selectedProjects.every(
    (project) => project.type === "domeinname",
  );

  const selectionDraftKey = useMemo(
    () =>
      selectedProjects
        .map((project) => project.id)
        .sort()
        .join(","),
    [selectedProjects],
  );

  useEffect(() => {
    setBulkDraft({});
  }, [selectionDraftKey]);

  const statusOptions = useMemo(
    () =>
      PROJECT_STATUS_ORDER.map((value) => ({
        value,
        label: getProjectStatusLabel(value),
        searchTerms: value.replaceAll("_", " "),
        icon: <ProjectStatusIcon status={value} size={18} />,
      })),
    [],
  );

  const priorityOptions = useMemo(
    () =>
      TASK_PRIORITY_ORDER.map((value) => ({
        value: String(value),
        label: getTaskPriorityLabel(value),
        icon: <TaskPriorityIcon priority={value} size={18} />,
      })),
    [],
  );

  const bulkOrganizationOptions = useMemo(
    () =>
      relabelDropdownNoneOption(
        [
          {
            value: DROPDOWN_NONE_VALUE,
            label: "No organization",
            searchTerms: "none unassigned",
            icon: <OrganizationIcon size={14} />,
          },
          ...organizationOptions,
        ],
        DROPDOWN_NONE_VALUE,
        "Organization",
      ),
    [organizationOptions],
  );

  const bulkStatusValue = useMemo(() => {
    if ("status" in bulkDraft) return bulkDraft.status ?? null;
    return sharedSelectionValue(
      selectedProjects.map((project) =>
        migrateLegacyProjectStatus(project.status),
      ),
    );
  }, [bulkDraft, selectedProjects]);

  const bulkPriorityValue = useMemo(() => {
    if ("priority" in bulkDraft) {
      return bulkDraft.priority != null ? String(bulkDraft.priority) : null;
    }
    const shared = sharedSelectionValue(
      selectedProjects.map((project) => project.priority),
    );
    return shared == null ? null : String(shared);
  }, [bulkDraft, selectedProjects]);

  const bulkStartDate = useMemo(() => {
    if ("startDate" in bulkDraft) return bulkDraft.startDate ?? null;
    const shared = sharedSelectionValue(
      selectedProjects.map((project) => toEpoch(project.startDate)),
    );
    return shared == null ? null : new Date(shared);
  }, [bulkDraft, selectedProjects]);

  const bulkStartIsMixed =
    !("startDate" in bulkDraft) &&
    selectedProjects.length > 1 &&
    sharedSelectionValue(
      selectedProjects.map((project) => toEpoch(project.startDate)),
    ) == null;

  const bulkDueDate = useMemo(() => {
    if ("dueDate" in bulkDraft) return bulkDraft.dueDate ?? null;
    const shared = sharedSelectionValue(
      selectedProjects.map((project) => toEpoch(project.dueDate)),
    );
    return shared == null ? null : new Date(shared);
  }, [bulkDraft, selectedProjects]);

  const bulkDueIsMixed =
    !("dueDate" in bulkDraft) &&
    selectedProjects.length > 1 &&
    sharedSelectionValue(
      selectedProjects.map((project) => toEpoch(project.dueDate)),
    ) == null;

  const bulkOrganizationValue = useMemo(() => {
    if ("organizationId" in bulkDraft) {
      return bulkDraft.organizationId ?? DROPDOWN_NONE_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedProjects.map((project) => project.organizationId ?? null),
      DROPDOWN_NONE_VALUE,
    );
  }, [bulkDraft, selectedProjects]);

  const bulkDraftReady = Object.keys(bulkDraft).length > 0;
  const canShowOrganization =
    showOrganization && organizationOptions.length > 0;

  if (selectionCount <= 0) return null;

  return (
    <FinanceBulkBar
      selectionCount={selectionCount}
      ariaLabel="Bulk edit selected projects"
      deleteEntityLabel="project"
      dockClassName="finance-bulk-bar-dock project-bulk-bar-dock"
      showSelectAll={Boolean(onSelectAll)}
      onSelectAll={onSelectAll}
      onClear={() => {
        setBulkDraft({});
        onClear();
      }}
      applyEnabled={bulkDraftReady}
      applyPending={applyPending}
      onApply={async () => {
        if (!bulkDraftReady) return;
        setApplyPending(true);
        try {
          const patch: ProjectBulkPatch = { ...bulkDraft };
          if (registrarDatesLocked) {
            delete patch.startDate;
            delete patch.dueDate;
          }
          await Promise.resolve(onApply(patch));
          setBulkDraft({});
        } finally {
          setApplyPending(false);
        }
      }}
    >
      <SearchableDropdown
        ariaLabel="Bulk set status"
        className="property-dropdown"
        triggerClassName={withBulkDropdownFillState(
          FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
          bulkStatusValue,
        )}
        value={bulkStatusValue}
        options={statusOptions}
        emptySelectionLabel="Status"
        showIcon={bulkDropdownShowIcon(bulkStatusValue)}
        searchPlaceholder="Set status"
        panelWidth={240}
        onChange={(value) =>
          setBulkDraft((current) => ({
            ...current,
            status: migrateLegacyProjectStatus(value),
          }))
        }
      />
      {showPriority ? (
        <SearchableDropdown
          ariaLabel="Bulk set priority"
          className="property-dropdown"
          triggerClassName={withBulkDropdownFillState(
            FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
            bulkPriorityValue,
            "0",
          )}
          value={bulkPriorityValue}
          options={priorityOptions}
          emptySelectionLabel="Priority"
          showIcon={
            bulkPriorityValue != null && bulkPriorityValue !== "0"
          }
          searchPlaceholder="Set priority"
          panelWidth={240}
          onChange={(value) =>
            setBulkDraft((current) => ({
              ...current,
              priority: Number(value),
            }))
          }
        />
      ) : null}
      <span
        className={[
          "project-bulk-bar__date",
          ("startDate" in bulkDraft && bulkDraft.startDate != null) ||
          (!("startDate" in bulkDraft) &&
            bulkStartDate != null &&
            !bulkStartIsMixed)
            ? "is-filled"
            : "is-empty",
        ].join(" ")}
      >
        <TaskDueDateDropdown
          dueDate={
            bulkStartIsMixed && !("startDate" in bulkDraft)
              ? null
              : bulkStartDate
          }
          variant="property"
          triggerVariant="composePill"
          status="completed"
          disabled={registrarDatesLocked}
          noDueDateLabel={
            bulkStartIsMixed && !("startDate" in bulkDraft)
              ? "Start date"
              : "No start date"
          }
          searchPlaceholder="Set start date"
          onDueDateChange={(next) =>
            setBulkDraft((current) => ({
              ...current,
              startDate: next,
            }))
          }
        />
      </span>
      <span
        className={[
          "project-bulk-bar__date",
          ("dueDate" in bulkDraft && bulkDraft.dueDate != null) ||
          (!("dueDate" in bulkDraft) && bulkDueDate != null && !bulkDueIsMixed)
            ? "is-filled"
            : "is-empty",
        ].join(" ")}
      >
        <TaskDueDateDropdown
          dueDate={
            bulkDueIsMixed && !("dueDate" in bulkDraft) ? null : bulkDueDate
          }
          variant="property"
          triggerVariant="composePill"
          disabled={registrarDatesLocked}
          noDueDateLabel={
            bulkDueIsMixed && !("dueDate" in bulkDraft)
              ? "Due date"
              : "No due date"
          }
          searchPlaceholder="Set due date"
          onDueDateChange={(next) =>
            setBulkDraft((current) => ({
              ...current,
              dueDate: next,
            }))
          }
        />
      </span>
      {canShowOrganization ? (
        <SearchableDropdown
          ariaLabel="Bulk set organization"
          className="property-dropdown"
          triggerClassName={withBulkDropdownFillState(
            FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
            bulkOrganizationValue,
            DROPDOWN_NONE_VALUE,
          )}
          value={bulkOrganizationValue}
          options={bulkOrganizationOptions}
          emptySelectionLabel="Organization"
          showIcon={bulkDropdownShowIcon(
            bulkOrganizationValue,
            DROPDOWN_NONE_VALUE,
          )}
          searchPlaceholder="Set organization"
          panelWidth={280}
          onChange={(value) =>
            setBulkDraft((current) => ({
              ...current,
              organizationId:
                value === DROPDOWN_NONE_VALUE ? null : value,
            }))
          }
        />
      ) : null}
    </FinanceBulkBar>
  );
}
