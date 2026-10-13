"use client";

import { useEffect, useMemo, useState } from "react";

import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../../tasks/task-priority.js";
import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "../../projects/project-status.js";
import {
  PROJECT_AREA_LABELS,
  PROJECT_AREAS,
  type ProjectArea,
} from "../../projects/project-areas.js";
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
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import type { ProjectOverviewRowProject } from "./project-overview-row.js";

export type ProjectBulkPatch = {
  status?: ProjectStatus;
  priority?: number;
  /** Top-level area; clearing also clears nested `areaId` on apply. */
  area?: ProjectArea | null;
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
  area?: ProjectArea | null;
  organizationId?: string | null;
};

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
        searchTerms: getTaskPriorityLabel(value),
        icon: <TaskPriorityIcon priority={value} size={18} />,
      })),
    [],
  );

  const areaOptions = useMemo(
    () =>
      relabelDropdownNoneOption(
        [
          {
            value: DROPDOWN_NONE_VALUE,
            label: "No area",
            searchTerms: "none unassigned",
          },
          ...PROJECT_AREAS.map((area) => ({
            value: area,
            label: PROJECT_AREA_LABELS[area],
            searchTerms: area,
          })),
        ],
        DROPDOWN_NONE_VALUE,
        "Area",
      ),
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

  const bulkAreaValue = useMemo(() => {
    if ("area" in bulkDraft) {
      return bulkDraft.area ?? DROPDOWN_NONE_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedProjects.map((project) => project.area ?? null),
      DROPDOWN_NONE_VALUE,
    );
  }, [bulkDraft, selectedProjects]);

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
          await Promise.resolve(onApply({ ...bulkDraft }));
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
      <SearchableDropdown
        ariaLabel="Bulk set area"
        className="property-dropdown"
        triggerClassName={withBulkDropdownFillState(
          FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
          bulkAreaValue,
          DROPDOWN_NONE_VALUE,
        )}
        value={bulkAreaValue}
        options={areaOptions}
        emptySelectionLabel="Area"
        showIcon={bulkDropdownShowIcon(bulkAreaValue, DROPDOWN_NONE_VALUE)}
        searchPlaceholder="Set area"
        panelWidth={240}
        onChange={(value) =>
          setBulkDraft((current) => ({
            ...current,
            area: value === DROPDOWN_NONE_VALUE ? null : (value as ProjectArea),
          }))
        }
      />
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
