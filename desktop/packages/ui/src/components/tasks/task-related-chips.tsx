"use client";

import { XIcon } from "@primer/octicons-react";
import type { ReactNode } from "react";

import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import type { TaskPropertyDropdownId } from "../../tasks/task-property-dropdown-keys.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type TaskRelatedChipsProps = {
  values: readonly string[];
  options: SearchableDropdownOption<string>[];
  onChange?: (next: string[]) => void;
  disabled?: boolean;
  /** Shown when nothing is selected. */
  emptyLabel?: string;
  searchPlaceholder?: string;
  searchShortcutLabel?: string;
  ariaLabel?: string;
  taskPropertyDropdownId?: TaskPropertyDropdownId;
  onCreateFromQuery?: (query: string) => void;
  /**
   * `rail` — properties panel under a field label.
   * `inline` — task header chip row (same chrome as other property chips).
   */
  variant?: "rail" | "inline";
  /** Read-only activate (e.g. when edits are not wired). */
  onActivate?: () => void;
};

function resolveSelected(
  values: readonly string[],
  options: SearchableDropdownOption<string>[],
): SearchableDropdownOption<string>[] {
  const byValue = new Map(options.map((option) => [option.value, option]));
  return values.map((value) => {
    const match = byValue.get(value);
    if (match) return match;
    return {
      value,
      label: "Unknown",
      icon: <ContactPersonIcon size={14} />,
    };
  });
}

/**
 * Related contacts/orgs as individual chips (avatar/icon + hover remove),
 * matching contact phone / relationship chip chrome. Plus opens the multi-select.
 */
export function TaskRelatedChips({
  values,
  options,
  onChange,
  disabled = false,
  emptyLabel = "Related",
  searchPlaceholder = "Add related…",
  searchShortcutLabel = "R",
  ariaLabel = "Related",
  taskPropertyDropdownId = "related",
  onCreateFromQuery,
  variant = "rail",
  onActivate,
}: TaskRelatedChipsProps) {
  const canEdit = Boolean(onChange) && options.length > 0;
  const selected = resolveSelected(values, options);
  const isInline = variant === "inline";

  function removeValue(value: string) {
    if (!onChange || disabled) return;
    onChange(values.filter((entry) => entry !== value));
  }

  const addControl = canEdit ? (
    <SearchableDropdown
      multiple
      values={[...values]}
      options={options}
      onValuesChange={onChange}
      disabled={disabled}
      searchPlaceholder={searchPlaceholder}
      searchShortcutLabel={searchShortcutLabel}
      ariaLabel={ariaLabel}
      taskPropertyDropdownId={taskPropertyDropdownId}
      emptySelectionLabel={emptyLabel}
      className={
        isInline
          ? "property-dropdown property-dropdown--inline-chip"
          : "property-dropdown"
      }
      panelWidth={280}
      panelAlign="start"
      createFromQueryLabel={
        onCreateFromQuery
          ? (query) => getCreateEntityFromQueryLabel("contact", query)
          : undefined
      }
      onCreateFromQuery={onCreateFromQuery}
      renderTrigger={({
        open,
        disabled: isDisabled,
        triggerId,
        onToggle,
      }) => {
        if (values.length === 0) {
          return (
            <button
              type="button"
              id={triggerId}
              className={[
                "property-dropdown-trigger",
                isInline ? "property-dropdown-trigger--inline-chip" : null,
                open ? "is-open" : null,
                "is-muted",
              ]
                .filter(Boolean)
                .join(" ")}
              data-task-property-dropdown={taskPropertyDropdownId}
              disabled={isDisabled}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={ariaLabel}
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
            >
              <span
                className="property-dropdown-trigger__icon"
                aria-hidden="true"
              >
                <ContactPersonIcon size={14} />
              </span>
              <span className="property-dropdown-trigger__label">
                {emptyLabel}
              </span>
            </button>
          );
        }
        return (
          <button
            type="button"
            id={triggerId}
            className={[
              "contact-detail-chips__add",
              open ? "is-open" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            data-task-property-dropdown={taskPropertyDropdownId}
            disabled={isDisabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`Add ${ariaLabel.toLowerCase()}`}
            title="Add related"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <SidePanelPlusIcon />
          </button>
        );
      }}
    />
  ) : values.length === 0 ? (
    <button
      type="button"
      className={[
        "property-dropdown-trigger",
        isInline ? "property-dropdown-trigger--inline-chip" : null,
        "is-muted",
      ]
        .filter(Boolean)
        .join(" ")}
      data-task-property-dropdown={taskPropertyDropdownId}
      disabled={disabled}
      onClick={() => onActivate?.()}
    >
      <span className="property-dropdown-trigger__icon" aria-hidden="true">
        <ContactPersonIcon size={14} />
      </span>
      <span className="property-dropdown-trigger__label">{emptyLabel}</span>
    </button>
  ) : null;

  return (
    <div
      className={[
        "contact-detail-chips",
        "task-related-chips",
        isInline ? "task-related-chips--inline" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="contact-detail-chips__row">
        {selected.map((option) => {
          const icon: ReactNode = option.icon ?? (
            <ContactPersonIcon size={14} />
          );
          return (
            <div
              key={option.value}
              className="contact-detail-relationship-chip task-related-chip"
            >
              <span
                className="contact-detail-chip"
                title={option.label}
              >
                <span className="task-related-chip__icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="task-related-chip__label">{option.label}</span>
              </span>
              {canEdit ? (
                <button
                  type="button"
                  className="contact-detail-split-chip__remove"
                  disabled={disabled}
                  aria-label={`Remove ${option.label}`}
                  title="Remove"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    removeValue(option.value);
                  }}
                >
                  <XIcon size={10} />
                </button>
              ) : null}
            </div>
          );
        })}
        {addControl}
      </div>
    </div>
  );
}
