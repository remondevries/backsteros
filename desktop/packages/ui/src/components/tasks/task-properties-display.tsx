"use client";

import { getTaskPriorityLabel } from "../../tasks/task-priority.js";
import { TASK_PRIORITY_ORDER } from "../../tasks/task-priority.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../../tasks/task-status.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownNone,
  resolveDropdownProjectKey,
} from "../dropdowns/dropdown-options.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { EntityPropertiesSection } from "../entity/entity-properties-section.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { PropertyDropdownNavigateRow } from "../dropdowns/property-dropdown-navigate-row.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import {
  decodeTaskRelatedValues,
  encodeTaskRelatedValues,
  type TaskRelatedSelection,
} from "../../tasks/task-related-entities.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskRelatedChips } from "./task-related-chips.js";
import { TaskStatusIcon } from "./task-status-icon.js";
import { SupportContactCard } from "./support-contact-card.js";
import { SupportOrganizationCard } from "./support-organization-card.js";
import type {
  SupportContactCardModel,
  SupportOrganizationCardModel,
} from "./support-party-card-types.js";
import { TrackedTimeField } from "../shared/tracked-time-field.js";
import type { TrackedTimerSessionMeta } from "../../tracked-timer/tracked-timer-context.js";
import { trackedMinutesFromTaskSchedule } from "@backsteros/contracts";

export type TaskPropertiesDisplayTask = {
  id: string;
  status: string;
  priority: number;
  dueDate?: number | Date | null;
  dueEndDate?: number | Date | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  relatedContactIds?: string[] | null;
  relatedOrganizationIds?: string[] | null;
  projectKey?: string | null;
  projectName?: string | null;
  agentCreatedAt?: number | Date | null;
  agentInboxApprovedAt?: number | Date | null;
  trackedDurationSeconds?: number | null;
  trackedMinutes?: number | null;
  /** Notification-style task — bell glyph with status color. */
  notification?: boolean | null;
  /** Client support ticket — support-ring glyph with status color. */
  support?: boolean | null;
};

export type TaskPropertiesDisplayProps = {
  task: TaskPropertiesDisplayTask | null;
  onStatusChange?: (status: TaskStatus) => void;
  /** When true, status dropdown is read-only (e.g. inbox triage without a project). */
  statusDisabled?: boolean;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onRelatedChange?: (related: TaskRelatedSelection) => void;
  onProjectChange?: (projectKey: string | null) => void;
  onFieldActivate?: (field: string) => void;
  assigneeOptions?: SearchableDropdownOption<string>[];
  relatedOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeNavigateHref?: string | null;
  projectNavigateHref?: string | null;
  onCreateAssigneeFromQuery?: (query: string) => void;
  onCreateRelatedContactFromQuery?: (query: string) => void;
  /** Support tickets: resolved client contact for the Contact card. */
  supportContact?: SupportContactCardModel | null;
  /** Support tickets: resolved client organization for the Organization card. */
  supportOrganization?: SupportOrganizationCardModel | null;
  supportContactHref?: string | null;
  supportOrganizationHref?: string | null;
  agentInboxPending?: boolean;
  onAgentInboxApprove?: () => void;
  onTrackedDurationSecondsChange?: (seconds: number | null) => void;
  onTimerSessionChange?: (
    action: "start" | "pause",
    seconds?: number | null,
  ) => void;
  timerSession?: TrackedTimerSessionMeta | null;
};

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Task properties rail — PropertyDropdowns when handlers/options provided.
 */
export function TaskPropertiesDisplay({
  task,
  onStatusChange,
  statusDisabled = false,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onRelatedChange,
  onProjectChange,
  onFieldActivate,
  assigneeOptions = [],
  relatedOptions = [],
  projectOptions = [],
  assigneeNavigateHref,
  projectNavigateHref,
  onCreateAssigneeFromQuery,
  onCreateRelatedContactFromQuery,
  supportContact = null,
  supportOrganization = null,
  supportContactHref = null,
  supportOrganizationHref = null,
  agentInboxPending = false,
  onAgentInboxApprove,
  onTrackedDurationSecondsChange,
  onTimerSessionChange,
  timerSession = null,
}: TaskPropertiesDisplayProps) {
  const disabled = task == null;
  const status = migrateLegacyTaskStatus(task?.status ?? "triage");
  const priority = task?.priority ?? 0;
  const due = toDate(task?.dueDate);

  const statusOptions: SearchableDropdownOption<TaskStatus>[] =
    TASK_STATUS_ORDER.map((value) => ({
      value,
      label: getTaskStatusLabel(value),
      searchTerms: value.replaceAll("_", " "),
      icon: <TaskStatusIcon status={value} size={14} />,
    }));

  const priorityOptions: SearchableDropdownOption<string>[] =
    TASK_PRIORITY_ORDER.map((value) => ({
      value: String(value),
      label: getTaskPriorityLabel(value),
      icon: <TaskPriorityIcon priority={value} size={14} />,
    }));

  const assigneeValue = task?.assigneeId ?? DROPDOWN_NONE_VALUE;
  const relatedValues = encodeTaskRelatedValues(
    task?.relatedContactIds ?? [],
    task?.relatedOrganizationIds ?? [],
  );
  const canEditAssignee =
    Boolean(onAssigneeChange) && assigneeOptions.length > 0;
  const canEditRelated =
    Boolean(onRelatedChange) && relatedOptions.length > 0;
  const canEditProject =
    Boolean(onProjectChange) && projectOptions.length > 0;

  return (
    <div className="task-detail-properties-scroll">
      <div className="detail-properties-panel__timer">
        <TrackedTimeField
          variant="pill"
          trackedDurationSeconds={task?.trackedDurationSeconds ?? null}
          trackedMinutes={task?.trackedMinutes ?? null}
          scheduleMinutes={trackedMinutesFromTaskSchedule(
            toDate(task?.dueDate),
            toDate(task?.dueEndDate),
          )}
          disabled={disabled}
          onTrackedDurationSecondsChange={onTrackedDurationSecondsChange}
          onTimerSessionChange={onTimerSessionChange}
          timerSession={timerSession}
        />
      </div>
      <div className="entity-properties-stack">
        <EntityPropertiesSection title="Properties">
          <PropertyDropdown
            value={status}
            options={statusOptions}
            onChange={onStatusChange}
            disabled={disabled || statusDisabled || !onStatusChange}
            searchPlaceholder="Change status…"
            searchShortcutLabel="S"
            ariaLabel="Status"
            taskPropertyDropdownId="status"
            fallbackIcon={
              <TaskStatusIcon
                status={status}
                size={14}
                support={Boolean(task?.support)}
                notification={Boolean(task?.notification)}
              />
            }
            fallbackLabel={getTaskStatusLabel(status)}
          />
          <PropertyDropdown
            value={String(priority)}
            options={priorityOptions}
            onChange={(next) => onPriorityChange?.(Number(next))}
            disabled={disabled}
            searchPlaceholder="Change priority…"
            searchShortcutLabel="P"
            ariaLabel="Priority"
            taskPropertyDropdownId="priority"
            fallbackIcon={<TaskPriorityIcon priority={priority} size={14} />}
            fallbackLabel={getTaskPriorityLabel(priority)}
          />
          <TaskDueDateDropdown
            dueDate={due}
            status={status}
            variant="property"
            disabled={disabled}
            onDueDateChange={onDueDateChange}
          />
          <PropertyFieldGroup label="Assignee">
            {canEditAssignee ? (
              <PropertyDropdownNavigateRow navigateHref={assigneeNavigateHref}>
                <PropertyDropdown
                  value={assigneeValue}
                  options={assigneeOptions}
                  onChange={(next) =>
                    onAssigneeChange?.(resolveDropdownNone(next))
                  }
                  disabled={disabled}
                  searchPlaceholder="Change assignee…"
                  searchShortcutLabel="A"
                  ariaLabel="Assignee"
                  taskPropertyDropdownId="assignee"
                  fallbackIcon={<ContactPersonIcon size={14} />}
                  fallbackLabel="Unassigned"
                  mutedFallback
                  createFromQueryLabel={
                    onCreateAssigneeFromQuery
                      ? (query) =>
                          getCreateEntityFromQueryLabel("contact", query)
                      : undefined
                  }
                  onCreateFromQuery={onCreateAssigneeFromQuery}
                />
              </PropertyDropdownNavigateRow>
            ) : (
              <button
                type="button"
                className="property-dropdown-trigger"
                data-task-property-dropdown="assignee"
                disabled={disabled}
                onClick={() => onFieldActivate?.("assignee")}
              >
                <span
                  className="property-dropdown-trigger__icon"
                  aria-hidden="true"
                >
                  <ContactPersonIcon size={14} />
                </span>
                <span className="property-dropdown-trigger__label">
                  {task?.assigneeName?.trim() || "Unassigned"}
                </span>
              </button>
            )}
          </PropertyFieldGroup>
          {task?.support ? null : (
            <PropertyFieldGroup label="Related">
              <TaskRelatedChips
                values={relatedValues}
                options={relatedOptions}
                onChange={
                  canEditRelated
                    ? (next) => onRelatedChange?.(decodeTaskRelatedValues(next))
                    : undefined
                }
                disabled={disabled}
                emptyLabel="No related"
                searchPlaceholder="Add related…"
                searchShortcutLabel="R"
                ariaLabel="Related"
                taskPropertyDropdownId="related"
                onCreateFromQuery={onCreateRelatedContactFromQuery}
                variant="rail"
                onActivate={() => onFieldActivate?.("related")}
              />
            </PropertyFieldGroup>
          )}
        </EntityPropertiesSection>

        {task?.support ? (
          <>
            <EntityPropertiesSection title="Contact">
              <SupportContactCard
                contact={supportContact}
                viewHref={supportContactHref}
              />
            </EntityPropertiesSection>
            <EntityPropertiesSection title="Organization">
              <SupportOrganizationCard
                organization={supportOrganization}
                viewHref={supportOrganizationHref}
              />
            </EntityPropertiesSection>
          </>
        ) : null}

        <EntityPropertiesSection title="Project">
          {canEditProject ? (
            <PropertyDropdownNavigateRow navigateHref={projectNavigateHref}>
              <PropertyDropdown
                value={task?.projectKey ?? DROPDOWN_NO_PROJECT_VALUE}
                options={projectOptions}
                onChange={(next) =>
                  onProjectChange?.(resolveDropdownProjectKey(next))
                }
                disabled={disabled}
                searchPlaceholder="Change project…"
                searchShortcutLabel="⇧P"
                ariaLabel="Project"
                taskPropertyDropdownId="project"
                fallbackIcon={<DefaultProjectIcon size={14} />}
                fallbackLabel="No project"
                mutedFallback
              />
            </PropertyDropdownNavigateRow>
          ) : (
            <button
              type="button"
              className="property-dropdown-trigger"
              data-task-property-dropdown="project"
              disabled={disabled}
              onClick={() => onFieldActivate?.("project")}
            >
              <span
                className="property-dropdown-trigger__icon"
                aria-hidden="true"
              >
                <DefaultProjectIcon size={14} />
              </span>
              <span className="property-dropdown-trigger__label">
                {task?.projectName?.trim() || "No project"}
              </span>
            </button>
          )}
        </EntityPropertiesSection>

        {agentInboxPending && onAgentInboxApprove ? (
          <button
            type="button"
            className="task-agent-inbox-approve-button"
            onClick={onAgentInboxApprove}
          >
            Approve
          </button>
        ) : null}
      </div>
    </div>
  );
}
